// Voice for the platform: Jarvis (an ElevenLabs agent that speaks Hebrew and acts through the platform in the
// browser) and meetings (live Hebrew transcription with ElevenLabs Scribe, then a discussion summary). The API key never
// leaves this function: the browser gets a short-lived signed address or a single-use token. Served as the Edge
// Function `voice` and, through the site's rewrite, at /voice/*:
//   POST /voice/status      what is set up: {agent, meetings, summary, missing: [secret names]}
//   POST /voice/agent       {signed_url} for a Jarvis conversation (valid 15 minutes to start)
//   POST /voice/scribe      {token} for one realtime transcription (single use, 15 minutes)
//   POST /voice/summarize   {title, project, transcript}: the summary as {tldr, decisions, actions, open, next}
// The browser sends the team code (x-team-code) and the person (x-actor), as for the calendar.
import { sensitiveHits, textsIn } from './guard.js';

const XI = 'https://api.elevenlabs.io';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
class Fail extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const fail = (msg, status) => { throw new Fail(msg, status); };

function makeRpc(base, key) {
  return async (fn, args = {}) => {
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const text = await res.text();
    if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
}
const makeDb = (base, key) => async (path) => {
  const res = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]}: ${res.status}`);
  return res.json();
};

export const SUMMARY_PROMPT = `התפקיד: לכתוב סיכומי דיון לצוות CTO. מקבלים תמלול של פגישה בעברית (תמלול אוטומטי, עם טעויות) ומחזירים JSON בלבד, בלי טקסט לפניו או אחריו, במבנה:
{"tldr": "שתיים-שלוש שורות: על מה דיברו ומה יצא", "decisions": ["החלטה שהתקבלה, במשפט"], "actions": [{"what": "מה צריך לעשות", "who": "שם, אם נאמר", "due": "YYYY-MM-DD, אם נאמר"}], "open": ["שאלה שנשארה פתוחה"], "next": "הצעד הבא, במשפט"}
כללים: לכתוב בעברית פשוטה וקצרה, בלשון ניטרלית. רק מה שנאמר בפגישה, בלי להמציא. החלטה היא רק מה שהוסכם במפורש; הצעה שלא הוסכמה הולכת ל-open. שמות כפי שנאמרו. רשימה ריקה כשאין.`;

// The summary as the platform keeps it, whatever shape the model returned.
export function shapeSummary(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/\{[\s\S]*\}/);
  let o = null;
  try { o = m ? JSON.parse(m[0]) : null; } catch (e) { o = null; }
  if (!o) return { tldr: raw.slice(0, 2000), decisions: [], actions: [], open: [], next: '' };
  const list = (x) => (Array.isArray(x) ? x : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 30);
  return {
    tldr: String(o.tldr || '').trim().slice(0, 2000),
    decisions: list(o.decisions),
    actions: (Array.isArray(o.actions) ? o.actions : []).map((a) => (typeof a === 'string' ? { what: a } : a || {}))
      .map((a) => ({ what: String(a.what || '').trim(), who: String(a.who || '').trim(), due: /^\d{4}-\d{2}-\d{2}$/.test(a.due || '') ? a.due : '' }))
      .filter((a) => a.what).slice(0, 30),
    open: list(o.open),
    next: String(o.next || '').trim().slice(0, 500),
  };
}

export function makeEleven(env) {
  const base = env.xiBase || XI;
  async function call(path, opts = {}) {
    const res = await fetch(`${base}${path}`, { ...opts, headers: { 'xi-api-key': env.xiKey, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const why = body?.detail?.message || body?.detail || res.status;
      if (res.status === 401) fail('מפתח ה-API של ElevenLabs לא תקין.', 502);
      if (res.status === 429 || /quota|credits/i.test(String(why))) fail('נגמרה המכסה של ElevenLabs לחודש הזה.', 429);
      throw new Error(`elevenlabs ${res.status}: ${String(typeof why === 'string' ? why : JSON.stringify(why)).slice(0, 200)}`);
    }
    return body;
  }
  return {
    signedUrl: async (agentId) => (await call(`/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`)).signed_url,
    scribeToken: async () => (await call('/v1/single-use-token/realtime_scribe', { method: 'POST' })).token,
    // A text-only conversation with the summary agent: one message in, one answer out. The agent runs Claude inside
    // ElevenLabs, so the cost stays on the team's ElevenLabs account.
    ask: async (agentId, text, { WS = globalThis.WebSocket, ms = 120000 } = {}) => {
      const url = await call(`/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`).then((b) => b.signed_url);
      return new Promise((resolve, reject) => {
        const ws = new WS(url);
        const done = (fn, v) => { clearTimeout(timer); try { ws.close(); } catch (e) { /* closed */ } fn(v); };
        const timer = setTimeout(() => done(reject, new Error('elevenlabs: no answer in time')), ms);
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'conversation_initiation_client_data', conversation_config_override: { conversation: { text_only: true } } }));
          ws.send(JSON.stringify({ type: 'user_message', text }));
        };
        ws.onmessage = (e) => {
          let m; try { m = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data)); } catch (x) { return; }
          if (m.type === 'ping') ws.send(JSON.stringify({ type: 'pong', event_id: m.ping_event?.event_id }));
          if (m.type === 'agent_response' && m.agent_response_event?.agent_response) done(resolve, m.agent_response_event.agent_response);
        };
        ws.onerror = () => done(reject, new Error('elevenlabs: connection failed'));
        ws.onclose = () => done(reject, new Error('elevenlabs: closed before answering'));
      });
    },
  };
}

async function claudeSummary(env, text) {
  const res = await fetch(env.anthropicBase || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 3000, system: SUMMARY_PROMPT, messages: [{ role: 'user', content: text }] }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return (body.content || []).map((c) => c.text || '').join('');
}

export async function handle(req, env) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  const rpc = makeRpc(env.base, env.serviceKey);
  const db = makeDb(env.base, env.serviceKey);
  const xi = makeEleven(env);
  const has = { agent: !!(env.xiKey && env.agentId), meetings: !!env.xiKey, summary: !!(env.anthropicKey || (env.xiKey && env.summaryAgentId)) };

  try {
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    const code = req.headers.get('x-team-code') || '';
    const actor = req.headers.get('x-actor') || '';
    if (!code || !UUID.test(actor) || !(await rpc('check_team_code', { code }))) fail('צריך להיכנס עם קוד הצוות.', 401);
    const me = (await db(`people?select=id,name,team_id,is_team,archived&id=eq.${actor}`))[0];
    if (!me || !me.is_team || me.archived) fail('רק אדם מהצוות.', 403);
    let body = {};
    try { body = await req.json(); } catch (e) { /* empty body */ }

    // Names of the secrets that are not set (never their values), so the screen can say what to add.
    if (route === 'status') {
      const missing = [['ELEVENLABS_API_KEY', env.xiKey], ['ELEVENLABS_AGENT_ID', env.agentId], ['ELEVENLABS_SUMMARY_AGENT_ID', env.summaryAgentId || env.anthropicKey]].filter(([, v]) => !v).map(([k]) => k);
      return json({ ...has, missing });
    }

    if (route === 'agent') {
      if (!has.agent) fail('ג׳ארביס עוד לא הוגדר: חסר מפתח או סוכן ב-ElevenLabs.', 409);
      return json({ signed_url: await xi.signedUrl(env.agentId) });
    }

    if (route === 'scribe') {
      if (!has.meetings) fail('התמלול עוד לא הוגדר: חסר מפתח ElevenLabs.', 409);
      return json({ token: await xi.scribeToken() });
    }

    if (route === 'summarize') {
      if (!has.summary) fail('הסיכום עוד לא הוגדר.', 409);
      const transcript = String(body.transcript || '').trim();
      if (transcript.length < 40) fail('התמלול קצר מדי לסיכום.');
      if (transcript.length > 200000) fail('התמלול ארוך מדי לסיכום אחד.');
      // The unclassified check, on the server too: nothing that matches the team's list goes to a model.
      const s = (await db(`team_settings?select=word_hashes&team_id=eq.${me.team_id}`))[0];
      const hits = await sensitiveHits(textsIn({ title: body.title, transcript }).join('\n'), s?.word_hashes || []);
      if (hits) fail('בתמלול יש מילים מרשימת המילים הרגישות, ולכן הוא לא נשלח לסיכום. אפשר לערוך ולנסות שוב.', 422);
      const text = `פגישה: ${String(body.title || '').slice(0, 200)}${body.project ? `\nפרויקט: ${String(body.project).slice(0, 200)}` : ''}\nתאריך: ${new Date().toISOString().slice(0, 10)}\n\nתמלול:\n${transcript}`;
      const out = env.anthropicKey ? await claudeSummary(env, text) : await xi.ask(env.summaryAgentId, `${SUMMARY_PROMPT}\n\n${text}`, { WS: env.WebSocket });
      return json({ summary: shapeSummary(out), engine: env.anthropicKey ? 'anthropic' : 'elevenlabs' });
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status);
    throw e;
  }
}
