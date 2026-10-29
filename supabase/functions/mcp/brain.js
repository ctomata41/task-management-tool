// The platform's own Claude: with the team's Anthropic API key (Supabase secret ANTHROPIC_API_KEY), the platform writes
// a project's work plan itself instead of waiting for someone to open Claude. It runs the same tools the connector
// gives a person's Claude, as the same team agent, on behalf of the person who asked, so every rule there holds here
// too (the unclassified check, personal projects, no closing or deciding for people). Served at /mcp/brain/*:
//   POST /mcp/brain/status   {on}: is there a key
//   POST /mcp/brain/run      {run_id}: write or update the plan for that run, in the background; answers 202 at once
// The browser sends its Google session (x-session), or the team code (x-team-code) and the person (x-actor), as for voice and the calendar.
import { TOOLS, INSTRUCTIONS, UserError, makeDb, makeTools } from './server.js';

const MODEL = 'claude-opus-5-5';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USE = ['get_project', 'get_updates', 'set_plan', 'ask_decision', 'request_human_step', 'report_progress', 'finish_run'];
const MAX_TURNS = 10;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
class Fail extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const fail = (msg, status) => { throw new Fail(msg, status); };
export const isPlanRun = (r) => /^תוכנית עבודה/.test(r?.title || '');

const SYSTEM = `${INSTRUCTIONS}

You run inside the platform itself, not in a chat: nobody reads your text, and only what you do through the tools reaches people. You cannot wait for answers in this turn.
- If the plan is not written yet: write a full first plan now with one set_plan call (a short summary that says which assumptions it rests on, phases with dates that keep the project's milestones, and steps with an owner, Claude or a named person, and a date). Then ask through ask_decision only what is really missing, at most three questions, and stop. You are called again when people answer.
- If you are called back: call get_updates for the run, update the plan with set_plan by the answers, and never ask again what was already answered.
- When nothing is open for people any more, call finish_run with a short hand-off.
- Never invent people: owners are only the team members the project shows.`;

const kickoff = (r, picked, today) => [
  `Run ${r.id}: ${r.title}`,
  `Today: ${today}`,
  r.plan_written ? 'The plan was already written; people may have answered since. Start with get_updates for this run.' : 'No plan yet. Write it now.',
  '',
  'Brief:',
  picked.brief || r.brief || '',
  '',
  'The project, as the platform holds it:',
  JSON.stringify(picked.project || {}, null, 1),
].join('\n');

// One tool-use loop over the platform tools. claude is an Anthropic SDK client (or a stand-in in tests).
export async function writePlan({ claude, tools, run: r, picked, log = console }) {
  const specs = TOOLS.filter((t) => USE.includes(t.name)).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const messages = [{ role: 'user', content: kickoff(r, picked, new Date().toISOString().slice(0, 10)) }];
  const ask = (extra) => claude.beta.messages.create({ model: MODEL, max_tokens: 16000, output_config: { effort: 'medium' }, system: SYSTEM, tools: specs, messages, ...extra });
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let res;
    try {
      res = await ask({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    } catch (e) {
      if (e?.status !== 400 || !/fallback/i.test(String(e?.message))) throw e;
      res = await ask({}); // an account without the fallback beta still gets its plan
    }
    if (res.stop_reason === 'refusal') return { ok: false, why: 'Claude לא כתב את התוכנית הזו.' };
    messages.push({ role: 'assistant', content: res.content });
    const uses = res.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) return { ok: true, turns: turn + 1 };
    const results = await Promise.all(uses.map(async (u) => {
      if (!USE.includes(u.name)) return { type: 'tool_result', tool_use_id: u.id, content: 'This tool is not available here.', is_error: true };
      try {
        return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(await tools[u.name](u.input || {})) };
      } catch (e) {
        if (!(e instanceof UserError)) log.error('brain tool', u.name, e);
        return { type: 'tool_result', tool_use_id: u.id, content: e instanceof UserError ? e.message : 'תקלה בפלטפורמה.', is_error: true };
      }
    }));
    messages.push({ role: 'user', content: results });
  }
  return { ok: true, turns: MAX_TURNS };
}

// What a failure means for the person, said on the run itself, where they see it.
function failWords(e) {
  const m = String(e?.message || e);
  if (e?.status === 401) return 'מפתח ה-API של Anthropic לא תקין.';
  if (/credit|billing|balance/i.test(m)) return 'נגמר הקרדיט בחשבון Anthropic, או שהגענו לתקרה החודשית.';
  if (e?.status === 429) return 'Anthropic עמוס כרגע. אפשר לנסות שוב בעוד דקה.';
  return 'לא הצלחתי לכתוב את התוכנית. אפשר לנסות שוב.';
}

// env: { base, serviceKey, claude (Anthropic client, or null without a key), background (fn that keeps a promise alive) }
export async function handleBrain(req, env) {
  const route = new URL(req.url).pathname.replace(/\/+$/, '').split('/').pop();
  const sys = makeDb(env.base, env.serviceKey, null);
  try {
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    const actor = await sys('rpc/auth_who', { method: 'POST', body: { p_session: req.headers.get('x-session') || '', p_code: req.headers.get('x-team-code') || '', p_actor: req.headers.get('x-actor') || '' } });
    if (!actor || !UUID.test(actor)) fail('צריך להיכנס לפלטפורמה.', 401);
    const me = (await sys(`people?select=id,name,team_id,is_team,archived&id=eq.${actor}`))[0];
    if (!me || !me.is_team || me.archived) fail('רק אדם מהצוות.', 403);
    if (route === 'status') return json({ on: !!env.claude });
    if (route !== 'run') return json({ error: 'not found' }, 404);
    if (!env.claude) fail('לפלטפורמה אין עדיין מפתח API של Anthropic.', 409);

    let body = {};
    try { body = await req.json(); } catch (e) { /* empty */ }
    if (!UUID.test(body.run_id || '')) fail('חסר run_id.');
    const r = (await sys(`runs?select=*&id=eq.${body.run_id}`))[0];
    if (!r || r.person_id !== me.id) fail('הריצה לא נמצאה.', 404);
    // Only plans for now: other work (a document, code, research) needs the person's own Claude and its tools.
    if (!isPlanRun(r)) return json({ skipped: 'not a plan' });
    // A run still waiting on people goes on once the last question is answered (the app moves it back to running).
    if (r.stop_requested || ['done', 'stopped', 'review', 'waiting'].includes(r.state)) return json({ skipped: r.state });
    // One writer at a time: a run being written carries "platform:<start>" as its session, cleared when the work ends.
    const lock = /^platform:(.+)$/.exec(r.session_url || '');
    if (lock && Date.now() - Date.parse(lock[1]) < 5 * 60e3) return json({ busy: true });
    const agent = (await sys(`people?select=id&team_id=eq.${me.team_id}&is_agent=is.true&archived=is.false&order=created_at&limit=1`))[0];
    if (!agent) fail('לצוות אין עדיין משתמש Claude בפלטפורמה.', 500);

    const who = { person_id: me.id, person_name: me.name, team_id: me.team_id, agent_id: agent.id };
    const db = makeDb(env.base, env.serviceKey, agent.id);
    const tools = makeTools(db, who);
    const picked = await tools.start_run({ run_id: r.id, surface: 'platform', session_url: `platform:${new Date().toISOString()}` });
    const planWritten = !!(await sys(`projects?select=plan_updated_at&id=eq.${r.project_id}`))[0]?.plan_updated_at;
    await tools.report_progress({ run_id: r.id, progress: 0.1, step: planWritten ? 'מעדכן את התוכנית לפי התשובות' : 'כותב את התוכנית' }).catch(() => {});
    const work = writePlan({ claude: env.claude, tools, run: { ...r, plan_written: planWritten }, picked })
      .then(async (out) => {
        if (!out.ok) await db(`runs?id=eq.${r.id}`, { method: 'PATCH', body: { state: 'queued', step: out.why, last_seen_at: new Date().toISOString() } });
        // A loop that ended without finish_run or a question leaves the run "running" with no session on it.
        const now = (await sys(`runs?select=state&id=eq.${r.id}`))[0];
        if (out.ok && now?.state === 'running') await tools.finish_run({ run_id: r.id, summary: 'התוכנית נכתבה.' }).catch(() => {});
      })
      .catch(async (e) => {
        console.error('brain', e);
        await db(`runs?id=eq.${r.id}`, { method: 'PATCH', body: { state: 'queued', step: failWords(e), last_seen_at: new Date().toISOString() } }).catch(() => {});
      })
      .finally(() => db(`runs?id=eq.${r.id}`, { method: 'PATCH', body: { session_url: null } }).catch(() => {}));
    if (env.background) env.background(work);
    else await work;
    return json({ started: true }, 202);
  } catch (e) {
    if (e instanceof Fail || e instanceof UserError) return json({ error: e.message }, e.status || 400);
    throw e;
  }
}
