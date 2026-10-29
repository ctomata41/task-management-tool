// Google Calendar for the platform: each person signs in with Google once, then the platform shows their week, shows
// the team's busy times, and creates events in their calendar. Served as the Edge Function `gcal` and, through the
// site's rewrite, at /gcal/*:
//   GET  /gcal/start?state=…   the browser's way to Google's sign-in (the state comes from the gcal_state_create RPC)
//   GET  /gcal/callback        Google's way back: keeps the tokens and sends the browser home with a device token
//   POST /gcal/events          {from, to}: this person's events (only on a device that signed in) and the team's busy times
//   POST /gcal/create          {title, start, mins, project_id, invite, notes}: an event in this person's calendar
//   POST /gcal/disconnect      forgets the link and revokes the token at Google
//   GET  /gcal/signin?return=/m/  signing in to the platform with Google: the same Google screen also connects the
//                               calendar. Back home through /account/ with a session token (#session=…)
// The browser sends its session (x-session), or the team code (x-team-code) with the person (x-actor) and its device
// token (x-gcal-device). A session is a person on their own device, so it sees its own calendar's titles anywhere.
import { sensitiveHits, textsIn } from './guard.js';

const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.events';
const SIGNIN_SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar.events';
const DAY = 864e5;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const redirect = (url) => new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
class Fail extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const fail = (msg, status) => { throw new Fail(msg, status); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeRpc(base, key) {
  return async function rpc(fn, args = {}) {
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
}
function makeDb(base, key) {
  return async (path) => {
    const res = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`GET ${path.split('?')[0]}: ${res.status}`);
    return res.json();
  };
}
function randomHex(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function makeGoogle(env) {
  const g = { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', api: 'https://www.googleapis.com', revoke: 'https://oauth2.googleapis.com/revoke', ...(env.google || {}) };
  const form = (o) => new URLSearchParams(o).toString();
  async function call(url, opts) {
    const res = await fetch(url, opts);
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const why = body?.error_description || body?.error?.message || body?.error || res.status;
      if (res.status === 400 && body?.error === 'invalid_grant') fail('הגישה ליומן בוטלה בגוגל. צריך לחבר שוב.', 409);
      throw new Error(`google ${res.status}: ${String(why).slice(0, 200)}`);
    }
    return body;
  }
  return {
    authUrl: (state, signin = false) => `${g.auth}?${form({ client_id: env.clientId, redirect_uri: env.redirectUri, response_type: 'code', scope: signin ? SIGNIN_SCOPES : SCOPES, access_type: 'offline', prompt: signin ? 'select_account consent' : 'consent', include_granted_scopes: 'true', state })}`,
    exchange: (code) => call(g.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ code, client_id: env.clientId, client_secret: env.clientSecret, redirect_uri: env.redirectUri, grant_type: 'authorization_code' }) }),
    access: async (refresh) => (await call(g.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ refresh_token: refresh, client_id: env.clientId, client_secret: env.clientSecret, grant_type: 'refresh_token' }) })).access_token,
    userinfo: (token) => call(`${g.api}/oauth2/v3/userinfo`, { headers: { Authorization: `Bearer ${token}` } }),
    events: (token, from, to) => call(`${g.api}/calendar/v3/calendars/primary/events?${form({ timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })}`, { headers: { Authorization: `Bearer ${token}` } }),
    busy: (token, from, to) => call(`${g.api}/calendar/v3/freeBusy`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ timeMin: from, timeMax: to, items: [{ id: 'primary' }] }) }),
    insert: (token, ev) => call(`${g.api}/calendar/v3/calendars/primary/events?sendUpdates=all`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(ev) }),
    revoke: (token) => fetch(`${g.revoke}?${form({ token })}`, { method: 'POST' }).catch(() => null),
  };
}

// A Google event as the platform shows it.
function shape(e) {
  const allDay = !e.start?.dateTime;
  const start = e.start?.dateTime || `${e.start?.date}T00:00:00`;
  const end = e.end?.dateTime || `${e.end?.date}T00:00:00`;
  const p = e.extendedProperties?.private || {};
  return {
    id: e.id, title: e.summary || '(בלי כותרת)', start, end, all_day: allDay,
    mins: Math.max(15, Math.round((Date.parse(end) - Date.parse(start)) / 6e4)),
    link: e.htmlLink || null, meet: e.hangoutLink || null, here: p.cto === '1', project_id: p.cto_project || null,
    attendees: (e.attendees || []).filter((a) => !a.self).map((a) => a.email),
  };
}

export async function handle(req, env) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  const rpc = makeRpc(env.base, env.serviceKey);
  const db = makeDb(env.base, env.serviceKey);
  const google = makeGoogle(env);
  const home = (ret, frag) => redirect(`${env.site}${ret || '/next/'}#${frag}`);
  const configured = !!(env.clientId && env.clientSecret);
  let signingIn = route === 'signin';
  const account = (ret, frag) => redirect(`${env.site}/account/?return=${encodeURIComponent(ret || '/')}#${frag}`);

  try {
    if (req.method === 'GET' && route === 'signin') {
      const ret = url.searchParams.get('return') || '/';
      if (!configured) return account(ret, 'error=setup');
      return redirect(google.authUrl(await rpc('auth_state_create', { p_return: ret }), true));
    }

    if (req.method === 'GET' && route === 'start') {
      if (!configured) return home('/next/', 'gcal_error=setup');
      const state = url.searchParams.get('state') || '';
      if (!/^[0-9a-f]{48}$/.test(state) || !(await rpc('gcal_state_peek', { p_state: state }))) return home('/next/', 'gcal_error=expired');
      return redirect(google.authUrl(state));
    }

    if (req.method === 'GET' && route === 'callback') {
      const state = url.searchParams.get('state') || '';
      const taken = /^[0-9a-f]{48}$/.test(state) ? (await rpc('gcal_state_take', { p_state: state }))?.[0] : null;
      if (!taken) return home('/next/', 'gcal_error=expired');
      if (taken.kind === 'signin') { signingIn = true; return await signIn(taken.return_to); }
      if (url.searchParams.get('error') || !url.searchParams.get('code')) return home(taken.return_to, 'gcal_error=denied');
      const tok = await google.exchange(url.searchParams.get('code'));
      if (!String(tok.scope || '').includes('calendar.events')) return home(taken.return_to, 'gcal_error=scope');
      const who = await google.userinfo(tok.access_token);
      const device = 'gcd_' + randomHex(24);
      await rpc('gcal_link_save', { p_person: taken.person_id, p_email: who.email || '', p_refresh: tok.refresh_token || '', p_device: device });
      return home(taken.return_to, `gcal=${device}`);
    }

    if (req.method !== 'POST') return json({ error: 'not found' }, 404);

    // Every POST comes from a signed-in browser: a Google session, or the team code with a person on the team.
    const session = req.headers.get('x-session') || '';
    const actor = await rpc('auth_who', { p_session: session, p_code: req.headers.get('x-team-code') || '', p_actor: req.headers.get('x-actor') || '' });
    if (!actor || !UUID.test(actor)) fail('צריך להיכנס לפלטפורמה.', 401);
    const me = (await db(`people?select=id,name,team_id,is_team,archived&id=eq.${actor}`))[0];
    if (!me || !me.is_team || me.archived) fail('רק אדם מהצוות.', 403);
    const device = req.headers.get('x-gcal-device') || '';
    const link = (await rpc('gcal_link_get', { p_person: me.id, p_device: device }))?.[0] || null;
    if (link && session) link.device_ok = true;
    let body = {};
    try { body = await req.json(); } catch (e) { /* empty body */ }

    if (route === 'events') {
      const from = Date.parse(body.from) ? new Date(body.from).toISOString() : new Date(Date.now() - 7 * DAY).toISOString();
      const to = Date.parse(body.to) ? new Date(body.to).toISOString() : new Date(Date.now() + 21 * DAY).toISOString();
      if (Date.parse(to) - Date.parse(from) > 62 * DAY) fail('טווח ארוך מדי.');
      const out = { configured, connected: !!link?.device_ok, linked_elsewhere: !!link && !link.device_ok, email: link?.device_ok ? link.email : null, events: [], team: [] };
      if (!configured) return json(out);
      // Everyone's busy times, each read with that person's own access (no titles leave their calendar).
      const links = await rpc('gcal_links_team');
      const people = await db(`people?select=id,team_id&team_id=eq.${me.team_id}&archived=is.false`);
      const mine = new Set(people.map((p) => p.id));
      const reads = links.filter((l) => mine.has(l.person_id)).map(async (l) => {
        try {
          const token = await google.access(l.refresh_token);
          if (l.person_id === me.id && link?.device_ok) {
            const r = await google.events(token, from, to);
            out.events = (r.items || []).filter((e) => e.status !== 'cancelled').map(shape);
          } else if (l.person_id !== me.id) {
            const r = await google.busy(token, from, to);
            out.team.push({ person_id: l.person_id, busy: r.calendars?.primary?.busy || [] });
          }
        } catch (e) {
          if (l.person_id === me.id) { out.connected = false; out.error = e instanceof Fail ? e.message : 'לא הצלחתי לקרוא את היומן מגוגל.'; }
          else out.team.push({ person_id: l.person_id, busy: [], error: true });
        }
      });
      await Promise.all(reads);
      return json(out);
    }

    if (route === 'create') {
      if (!configured) fail('חיבור יומן גוגל עוד לא הוגדר לצוות.', 409);
      if (!link?.device_ok) fail('צריך לחבר את יומן גוגל במכשיר הזה.', 409);
      const title = String(body.title || '').trim().slice(0, 200);
      const notes = String(body.notes || '').trim().slice(0, 2000);
      const start = Date.parse(body.start);
      const mins = Math.min(Math.max(parseInt(body.mins, 10) || 30, 5), 600);
      if (!title) fail('חסרה כותרת לאירוע.');
      if (!start) fail('חסר מועד לאירוע.');
      const settings = (await db(`team_settings?select=word_hashes&team_id=eq.${me.team_id}`))[0];
      if (await sensitiveHits(textsIn({ title, notes }).join('\n'), settings?.word_hashes || [])) {
        fail('נמצאה מילה מרשימת המילים הרגישות של הצוות. הפלטפורמה בלמ״ס בלבד, אז האירוע לא נוצר. כדאי לנסח מחדש בלי הפרט הרגיש.');
      }
      let project = null;
      if (body.project_id) {
        if (!UUID.test(body.project_id)) fail('פרויקט לא מוכר.');
        project = (await db(`projects?select=id,name&id=eq.${body.project_id}&team_id=eq.${me.team_id}`))[0] || null;
      }
      const invite = Array.isArray(body.invite) ? body.invite.filter((id) => UUID.test(id) && id !== me.id) : [];
      const emails = invite.length ? (await rpc('gcal_links_team')).filter((l) => invite.includes(l.person_id)).map((l) => l.email).filter(Boolean) : [];
      const token = await google.access(link.refresh_token);
      const ev = await google.insert(token, {
        summary: title,
        description: [notes, project ? `פרויקט: ${project.name}` : '', 'נקבע מפלטפורמת הצוות'].filter(Boolean).join('\n\n'),
        start: { dateTime: new Date(start).toISOString() },
        end: { dateTime: new Date(start + mins * 6e4).toISOString() },
        attendees: emails.map((email) => ({ email })),
        extendedProperties: { private: { cto: '1', ...(project ? { cto_project: project.id } : {}) } },
      });
      return json({ event: shape(ev), invited: emails.length, not_invited: invite.length - emails.length });
    }

    if (route === 'disconnect') {
      if (link && !link.device_ok) fail('אפשר לנתק רק מהמכשיר שחיבר את היומן.', 403);
      const refresh = await rpc('gcal_link_delete', { p_person: me.id });
      if (refresh) await google.revoke(refresh);
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);

    // Back from Google's sign-in: who this is, their calendar if they allowed it, and a session for this browser.
    async function signIn(ret) {
      if (url.searchParams.get('error') || !url.searchParams.get('code')) return account(ret, 'error=denied');
      const tok = await google.exchange(url.searchParams.get('code'));
      const who = await google.userinfo(tok.access_token);
      if (!who.sub || !who.email || who.email_verified === false) return account(ret, 'error=email');
      let acc;
      try {
        acc = (await rpc('auth_google_signin', { p_sub: who.sub, p_email: who.email, p_name: who.name || '', p_picture: who.picture || null }))?.[0];
      } catch (e) {
        console.error(e);
        return account(ret, 'error=taken');
      }
      const token = 'cts_' + randomHex(32);
      await rpc('auth_session_create', { p_account: acc.account_id, p_token: token });
      if (tok.refresh_token && String(tok.scope || '').includes('calendar.events')) {
        if (acc.status === 'active' && acc.person_id) await rpc('gcal_link_save', { p_person: acc.person_id, p_email: who.email, p_refresh: tok.refresh_token, p_device: 'gcd_' + randomHex(24) });
        else if (acc.status === 'pending') await rpc('auth_pending_refresh', { p_account: acc.account_id, p_refresh: tok.refresh_token });
      }
      return account(ret, `session=${token}`);
    }
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status);
    console.error(e);
    if (req.method === 'GET') return signingIn ? account('/', 'error=failed') : home('/next/', 'gcal_error=failed');
    return json({ error: 'תקלה בחיבור ליומן גוגל.' }, 500);
  }
}
