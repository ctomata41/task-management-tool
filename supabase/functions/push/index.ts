// The push function: phone notifications (Web Push) for the team app, and the daily run of the fixed rules
// (the digest and the commitment reminders). The database calls it with a shared secret: a trigger on notifications and
// an hourly pg_cron job. The app calls it for the public key, and for a test message or "my digest now" on its own device.
// Deployed without JWT verification; the actions the database calls check the shared secret.
import { generateVapidKeys, sendPush } from './webpush.js';
import {
  localNow, isQuiet, isWorkday, pushPlan, messageFor, blockerIsUrgent, digestFor, remindersDue, reminderText,
} from './rules.js';

const BASE = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUBJECT = 'https://cto-tasks.vercel.app'; // who sends: push services contact this if something goes wrong
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function db(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}) {
  const headers: Record<string, string> = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  if (init.prefer) headers.Prefer = init.prefer;
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: Row = {}) => db(`rpc/${fn}`, { method: 'POST', body: args });
const one = async (path: string): Promise<Row | null> => ((await db(path)) as Row[])[0] ?? null;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- keys and the shared secret ----------
let vapidKeys: Row | null = null;
async function vapid() {
  if (vapidKeys) return vapidKeys;
  let keys = await rpc('push_keys_get');
  if (!keys) {
    const fresh = await generateVapidKeys(); // first run: the keys are made here and stored; nobody sees the private one
    keys = await rpc('push_keys_init', { public_key: fresh.publicKey, private_jwk: fresh.privateJwk });
  }
  vapidKeys = keys;
  return keys;
}
let secret: string | null = null;
async function fromDatabase(req: Request) {
  const got = req.headers.get('x-push-secret') ?? '';
  secret ??= (await rpc('push_secret')) as string | null;
  if (!secret || got.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

// ---------- sending ----------
async function deliver(subs: Row[], message: Row, opts: Row) {
  const keys = await vapid();
  const results = [];
  for (const s of subs) {
    let r: Row;
    try {
      r = await sendPush(s, message, keys, { subject: SUBJECT, ...opts });
    } catch (e) {
      r = { status: 0, ok: false, text: String(e).slice(0, 200) };
    }
    results.push({ device: s.device, status: r.status, ok: r.ok, text: r.text });
    if (r.status === 404 || r.status === 410) { // the browser dropped this subscription
      await db(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' });
    } else {
      await db(`push_subscriptions?id=eq.${s.id}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: r.ok ? { last_ok_at: new Date().toISOString(), last_status: r.status, failures: 0 } : { last_status: r.status, failures: (s.failures ?? 0) + 1 },
      });
    }
  }
  return results;
}

// One in-app notification: to the phone now, or left for the digest.
async function onNotification(id: string) {
  const n = await one(`notifications?id=eq.${id}&select=*`);
  if (!n || n.pushed_at || n.read_at) return { skipped: 'done' };
  const subs = await db(`push_subscriptions?person_id=eq.${n.person_id}&select=*`) as Row[];
  if (!subs.length) return { skipped: 'no_device' };
  const person = await one(`people?id=eq.${n.person_id}&select=id,name,role,is_team,is_command,is_agent,team_id`);
  const actor = n.actor_id ? await one(`people?id=eq.${n.actor_id}&select=id,name,is_agent`) : null;
  const task = n.task_id ? await one(`tasks?id=eq.${n.task_id}&select=id,title,project_id,owner_id,created_by,private,flagged`) : null;
  const decision = n.decision_id ? await one(`decisions?id=eq.${n.decision_id}&select=id,title,kind,flagged`) : null;
  const commitment = n.commitment_id ? await one(`commitments?id=eq.${n.commitment_id}&select=id,title,flagged`) : null;
  const project = task?.project_id ? await one(`projects?id=eq.${task.project_id}&select=id,name`) : null;
  const settings = person ? await one(`team_settings?team_id=eq.${person.team_id}&select=*`) : null;
  const local = localNow();
  let urgent = false;
  if (task?.project_id && (n.kind === 'blocked' || n.kind === 'blocked_by_you')) {
    const cs = await db(`commitments?project_id=eq.${task.project_id}&status=eq.open&archived=is.false&select=project_id,status,archived,direction,due`) as Row[];
    urgent = blockerIsUrgent(task, cs, local.date);
  }
  const ctx = { person, actor, settings, local, task, decision, commitment, project, urgent };
  const plan = pushPlan(n, ctx);
  if (!plan.send) {
    await db(`notifications?id=eq.${n.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { push_note: plan.why } });
    return { held: plan.why };
  }
  const results = await deliver(subs, messageFor(n, ctx), { ttl: 12 * 3600, urgency: plan.urgency });
  const ok = results.some((r) => r.ok);
  await db(`notifications?id=eq.${n.id}`, {
    method: 'PATCH', prefer: 'return=minimal', body: ok ? { pushed_at: new Date().toISOString(), push_note: 'sent' } : { push_note: 'failed' },
  });
  return { sent: results };
}

// ---------- the daily run: reminders, then the digest ----------
async function teamData(teamId: string, since: string) {
  const [people, tasks, decisions, commitments, subs, sent] = await Promise.all([
    db(`people?team_id=eq.${teamId}&archived=is.false&select=id,name,role,is_team,is_command,is_agent`),
    db(`tasks?team_id=eq.${teamId}&archived=is.false&status=neq.done&select=id,title,status,kind,htype,owner_id,created_by,accountable_id,blocked_by_person,due,private,flagged,archived,project_id,created_at,updated_at`),
    db(`decisions?team_id=eq.${teamId}&archived=is.false&status=eq.open&select=id,title,kind,assignee_id,due,flagged,archived,created_at`),
    db(`commitments?team_id=eq.${teamId}&archived=is.false&status=eq.open&select=id,title,direction,counterpart,owner_id,due,status,flagged,archived,project_id,created_at`),
    db(`push_subscriptions?team_id=eq.${teamId}&select=*`),
    db(`reminders?team_id=eq.${teamId}&select=commitment_id,step,due`),
  ]) as Row[][];
  const ids = people.map((p) => p.id);
  const notifications = ids.length
    ? await db(`notifications?person_id=in.(${ids.join(',')})&read_at=is.null&pushed_at=is.null&created_at=gt.${encodeURIComponent(since)}&select=*&order=created_at.asc`) as Row[]
    : [];
  return { people, tasks, decisions, commitments, subs, sent, notifications };
}

// Claims today's run of a rule, so the next hourly call (or a second one) does nothing. False if it already ran.
async function claim(teamId: string, rule: string, day: string) {
  const rows = await db('rule_runs?on_conflict=team_id,rule,run_date', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation',
    body: { team_id: teamId, rule, run_date: day, summary: 'רץ עכשיו' },
  }) as Row[];
  return rows[0]?.id ?? null;
}
const finish = (runId: number, summary: string, details: unknown) =>
  db(`rule_runs?id=eq.${runId}`, { method: 'PATCH', prefer: 'return=minimal', body: { summary, details } });

async function sendDigest(pid: string, data: Row, local: Row) {
  const subs = data.subs.filter((s: Row) => s.person_id === pid);
  const d = digestFor(pid, data, local);
  if (!d || !subs.length) return { count: 0, sent: false };
  const results = await deliver(subs, { title: d.title, body: d.body, url: d.url, tag: d.tag }, { ttl: 6 * 3600, topic: 'digest' });
  return { count: d.count, extra: d.extra, sent: results.some((r) => r.ok) };
}

async function onDaily() {
  const local = localNow();
  const out: Row[] = [];
  for (const team of await db('teams?select=id') as Row[]) {
    const settings = await one(`team_settings?team_id=eq.${team.id}&select=*`);
    const rules = await db(`rules?team_id=eq.${team.id}&select=key,status`) as Row[];
    const active = (k: string) => rules.some((r) => r.key === k && r.status === 'active');
    const [h, m] = String(settings?.digest_at ?? '08:00').split(':').map(Number);
    if (!isWorkday(local.date) || isQuiet(settings, local) || local.minutes < h * 60 + (m || 0)) { out.push({ team: team.id, skipped: 'not_time' }); continue; }
    const last = await one(`rule_runs?team_id=eq.${team.id}&rule=eq.digest&run_date=lt.${local.date}&select=ran_at&order=ran_at.desc&limit=1`);
    const since = last?.ran_at ?? new Date(Date.now() - 72 * 3600000).toISOString();
    const data = await teamData(team.id, since);

    if (active('commitment_reminders')) {
      const runId = await claim(team.id, 'commitment_reminders', local.date);
      if (runId) {
        const due = remindersDue(data.commitments, data.sent, local);
        for (const { c, step } of due) {
          await db('reminders?on_conflict=commitment_id,step,due', {
            method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
            body: { team_id: team.id, commitment_id: c.id, person_id: c.owner_id, step, due: c.due },
          });
          // In the app's notifications too; the digest below carries it to the phone.
          await db('notifications', { method: 'POST', prefer: 'return=minimal', body: { person_id: c.owner_id, commitment_id: c.id, kind: 'reminder', body: reminderText(c, local) } });
        }
        const name = (id: string) => data.people.find((p: Row) => p.id === id)?.name ?? '';
        const summary = due.length === 0 ? 'אין התחייבות שמועדה קרוב' : due.length === 1 ? 'תזכורת אחת' : `${due.length} תזכורות`;
        await finish(runId, summary, due.map(({ c, step }) => ({ title: c.title, owner: name(c.owner_id), step })));
        out.push({ team: team.id, reminders: due.length });
      }
    }

    if (active('digest')) {
      const runId = await claim(team.id, 'digest', local.date);
      if (runId) {
        const fresh = await teamData(team.id, since); // includes the reminders just written
        const people = fresh.people.filter((p: Row) => p.is_team && !p.is_agent && p.role !== 'מפקד');
        const details = [];
        for (const p of people) details.push({ name: p.name, ...(await sendDigest(p.id, fresh, local)) });
        const got = details.filter((x) => x.sent).length;
        await finish(runId, got === 0 ? 'לא נשלח: אין למי או אין מה' : got === 1 ? 'נשלח לאדם אחד' : `נשלח ל-${got} אנשים`, details);
        out.push({ team: team.id, digest: got });
      }
    }
  }
  return out;
}

// The app's two actions act on one device, and knowing its push address is the proof: only that browser and the
// database have it.
async function device(endpoint: unknown) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return null;
  return await one(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=*`);
}

// "My digest now", from the settings screen: the same digest, outside the schedule, to this device only.
async function onDigestMe(endpoint: unknown) {
  const sub = await device(endpoint);
  if (!sub) return { ok: false, error: 'not_registered' };
  const last = await one(`rule_runs?team_id=eq.${sub.team_id}&rule=eq.digest&select=ran_at&order=ran_at.desc&limit=1`);
  const data = await teamData(sub.team_id, last?.ran_at ?? new Date(Date.now() - 72 * 3600000).toISOString());
  const d = digestFor(sub.person_id, data, localNow());
  if (!d) return { ok: true, empty: true };
  const [r] = await deliver([sub], { title: d.title, body: d.body, url: d.url, tag: d.tag }, { ttl: 6 * 3600, topic: 'digest' });
  return { ok: r.ok, status: r.status, count: d.count };
}

async function onTest(endpoint: unknown) {
  const sub = await device(endpoint);
  if (!sub) return { ok: false, error: 'not_registered' };
  const [r] = await deliver([sub], {
    title: 'בדיקה: ההתראות עובדות',
    body: 'מכאן יגיעו מיד חסם, שיוך ואזכור. כל השאר בתקציר אחד ביום, ובשעות השקט לא יגיע כלום.',
    url: '/#/home', tag: 'test',
  }, { ttl: 600, urgency: 'high' });
  return { ok: r.ok, status: r.status, text: r.text };
}

Deno.serve(async (req) => {
  try {
    const body: Row = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    if (req.method === 'GET' || body.action === 'key') return json({ publicKey: (await vapid()).publicKey });
    if (body.action === 'test') return json(await onTest(body.endpoint));
    if (body.action === 'digest_me') return json(await onDigestMe(body.endpoint));
    if (!(await fromDatabase(req))) return json({ error: 'forbidden' }, 403);
    if (body.notification) return json(await onNotification(String(body.notification)));
    if (body.digest) return json(await onDaily());
    return json({ error: 'unknown' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
