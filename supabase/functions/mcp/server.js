// The connector: an MCP server (Streamable HTTP, stateless JSON) that lets each person's Claude work with the platform.
// Claude → platform: start a run, report progress, publish an output with its link, ask a person for a decision or for a
// step only a person can do. Platform → Claude: what waits, what people decided, which steps are done, feedback on an
// output, a stop, and runs launched from the app that wait for a Claude session to pick them up.
// Each person has their own key. Writes go in as the team's Claude agent, so the database rules for agents apply
// (an agent never deletes, never closes, never decides, never approves) and the log shows that Claude did it.
// Plain JavaScript with no Deno APIs, so the same file runs in the Edge Function and in tests under Node.
import { sensitiveHits, textsIn } from './guard.js';

export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'cto-platform', title: 'פלטפורמת הצוות', version: '0.1.0' };

const INSTRUCTIONS = `This connector links you to the CTO team's platform: the shared record of every project, the decisions people owe, the steps only a person can do, and what Claude produced.
Work rules:
- At the start of a session, and whenever you pick work back up, call whats_waiting (or get_updates for a run you already started). People answer you in the platform, not in this chat.
- When you start real work on a project, call start_run (pass run_id if the person launched you from the platform). Keep the run_id.
- Report progress with report_progress at real milestones (not every step): a short step text and a progress between 0 and 1. Its answer tells you if a person asked you to stop and what changed; follow it.
- Every deliverable goes to publish_output with a link the team can open (an artifact, a doc, a PR, a file). Set final=true with the last one.
- Any question for the person goes to the platform, not only to this chat: call ask_decision with 2 to 4 options, your recommendation and why, or with no options for an open question they answer in their own words. Say in the chat that the question waits in the platform, and when they say they answered (or before you go on), read the answer with get_updates.
- A new project, or a Claude Project that is not in the platform yet: create_project. A work plan: write a first one at once with set_plan, on assumptions you state, then ask only what is missing and update it; never stop to wait for answers before the first plan. Write it with set_plan (phases with dates, and steps: each step is for Claude or for a named person, with a date). When the plan changes, call set_plan again with the steps you change or add; people get their steps in "what waits for me". When you need something only a person can do (a meeting, a file, an API key or account, a login, a payment), call request_human_step. Then keep working on anything that does not depend on it, and check get_updates.
- You never decide for people, never close tasks and never approve outputs: a person does that in the platform.
- Unclassified only. Never send classified information. Text that matches the team's sensitive-word list is refused.
- Write titles and texts in Hebrew, short and plain, the way the team talks.`;

const STATE_WORDS = { queued: 'מחכה ל-Claude', running: 'עובד', waiting: 'מחכה לאדם', review: 'מוכן לבדיקה', done: 'הסתיים', stopped: 'נעצר' };
const HTYPES = ['meeting', 'file', 'connect', 'auth', 'payment', 'other'];
const PHASE_STEP = ['claude', 'person'];
const KINDS = ['doc', 'video', 'research', 'code', 'app', 'deck', 'chart', 'report', 'image', 'other'];

// ---------- tool definitions ----------
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const PROJECT = str('The project: its id, or its name (or a clear part of it).');
const RUN = str('The run_id you got from start_run.');
export const TOOLS = [
  {
    name: 'whats_waiting',
    title: 'מה מחכה',
    description: 'What waits right now for the person you work for, and for you: decisions they owe, steps only they can do, your outputs waiting for their review, runs they launched from the platform for Claude to pick up, and your runs that wait on people. Call it at the start of every session.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_projects',
    title: 'הפרויקטים שלי',
    description: "The projects the person leads or is a partner in, with each one's stage, lead and what is open.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_project',
    title: 'פרויקט',
    description: "Everything you need to work on one project: its goal and brief for Claude, milestones, links, the decision log (what was decided and why), open decisions and human steps, active Claude runs, recent outputs, and the team's shared context for Claude.",
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'start_run',
    title: 'התחלת עבודה',
    description: 'Register that you are starting work on a project, so the team sees it live. If the person launched you from the platform, pass that run_id to pick it up (its brief comes back). Returns the run_id to use in every later call.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: str('A run launched from the platform, to pick up. Leave out to start a new one.'),
        project: PROJECT,
        title: str('What you are doing, in a few Hebrew words, for example "סרטון הסבר, גרסה 2".'),
        brief: str('What you were asked to do, in one or two sentences.'),
        surface: str('Where you run.', { enum: ['claude.ai', 'claude-code', 'cowork', 'other'] }),
        session_url: str('A link back to this conversation or session, if you have one.'),
      },
      additionalProperties: false,
    },
  },
  {
    name: 'report_progress',
    title: 'עדכון התקדמות',
    description: 'Report where a run stands, at real milestones. The answer says whether a person asked you to stop, and what changed for this run since your last report (decisions made, steps done, feedback). Follow it.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: RUN,
        progress: { type: 'number', minimum: 0, maximum: 1, description: 'How far along, from 0 to 1.' },
        step: str('What you are doing now, in a few Hebrew words.'),
        state: str('running while you work; waiting when you cannot go on without a person.', { enum: ['running', 'waiting'] }),
      },
      required: ['run_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'publish_output',
    title: 'פרסום תוצר',
    description: 'Put a deliverable in front of the team with a link they can open. It waits for a person to approve it or ask for changes. Set final=true on the last output of a run.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: RUN,
        project: str('The project, when there is no run_id.'),
        title: str('The output, in a few Hebrew words.'),
        url: str('A link the team can open: an artifact, a document, a pull request, a file.'),
        kind: str('What it is.', { enum: KINDS }),
        summary: str('One or two sentences: what is in it and what to look at.'),
        needs_review: { type: 'boolean', description: 'false for something to read only, with nothing to approve. Default true.' },
        final: { type: 'boolean', description: 'true when this finishes the run: it moves to "ready for review".' },
      },
      required: ['title', 'url'],
      additionalProperties: false,
    },
  },
  {
    name: 'ask_decision',
    title: 'בקשת החלטה',
    description: 'Ask a person to decide, or ask them anything, as a card in the platform (and a phone notification), instead of asking only in chat. Give 2 to 4 options, mark one recommended and say why; or no options for an open question they answer in words. Your run waits until it is answered; read the answer with get_updates or report_progress.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: RUN,
        project: str('The project, when there is no run_id.'),
        question: str('The question, in Hebrew, short.'),
        options: {
          type: 'array', minItems: 0, maxItems: 4,
          items: {
            type: 'object',
            properties: { label: str('The option, in a few words.'), note: str('What happens if it is chosen, one line.'), recommended: { type: 'boolean' } },
            required: ['label'], additionalProperties: false,
          },
        },
        reason: str('Why you recommend the option you marked.'),
        unblocks: str('What waits on this decision.'),
        context: str('Anything the person needs to know to decide.'),
        due: str('By when, as YYYY-MM-DD.'),
        assignee: str('Who decides, by name. Default: the person you work for.'),
      },
      required: ['question'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_human_step',
    title: 'בקשת פעולה מאדם',
    description: 'Ask a person for something only a person can do and without which you cannot go on: set a meeting, upload a file, connect a tool or API key, log in or approve access, or pay. It shows in their "what waits for me" and on their phone. Your run waits; read the outcome with get_updates.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: RUN,
        project: str('The project, when there is no run_id.'),
        type: str('What kind of step.', { enum: HTYPES }),
        title: str('The step, as an action in Hebrew, for example "לחבר מפתח API של ElevenLabs".'),
        details: str('Exactly what you need and where to put it.'),
        assignee: str('Who should do it, by name. Default: the person you work for.'),
        due: str('By when, as YYYY-MM-DD.'),
      },
      required: ['type', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_updates',
    title: 'מה השתנה',
    description: 'What people did that concerns you: decisions answered (with the choice and the reason), steps done, outputs approved or sent back with feedback, stop requests, and runs launched for Claude. Pass run_id for one run, or nothing for everything of the person you work for.',
    inputSchema: {
      type: 'object',
      properties: { run_id: RUN, since: str('Only what changed after this time (ISO). Default: the last 3 days.') },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_project',
    title: 'פרויקט חדש',
    description: 'Add a project to the platform, led by the person you work for. Use it for a new project, or to bring in a Claude Project that is not in the platform yet (pass its link). Returns the project id; then build the plan with set_plan.',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('A short Hebrew name.'),
        goal: str('What the project should achieve, in one or two sentences.'),
        personal: { type: 'boolean', description: 'true for a personal project only the person sees. Default false.' },
        partners: { type: 'array', items: { type: 'string' }, description: 'Teammates who work on it with them, by name.' },
        claude_project_url: str('The link to the Claude Project (claude.ai/project/...), if there is one.'),
        target_date: str('By when, as YYYY-MM-DD.'),
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_plan',
    title: 'תוכנית עבודה',
    description: "Write or update a project's work plan. Phases become the project's milestones (shown on the Gantt). Each step is for Claude or for a person by name: a person's step shows in their \"what waits for me\" and on their phone. Steps you pass with an id are updated; steps without an id are added. You cannot mark a step done; a person does.",
    inputSchema: {
      type: 'object',
      properties: {
        run_id: RUN,
        project: PROJECT,
        summary: str('The plan in two to four Hebrew sentences: the approach and what comes first.'),
        phases: {
          type: 'array', maxItems: 12,
          items: { type: 'object', properties: { title: str('The phase, in a few words.'), due: str('Its end date, YYYY-MM-DD.') }, required: ['title'], additionalProperties: false },
          description: "The phases, in order. Passing phases replaces the milestones; the ones already done stay done. Start from the project's current milestones (get_project): the person may have picked them from a template or edited them; keep their titles unless the person agrees to change them.",
        },
        steps: {
          type: 'array', maxItems: 40,
          items: {
            type: 'object',
            properties: {
              id: str('To update a step you added before.'),
              title: str('The step, as an action in Hebrew.'),
              who: str('"Claude", or the name of the person who does it.'),
              type: str('For a person: what kind of step.', { enum: HTYPES }),
              due: str('By when, YYYY-MM-DD.'),
              details: str('What exactly, and how to know it is done.'),
              phase: str('Which phase it belongs to, by its title.'),
            },
            required: ['title'], additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'finish_run',
    title: 'סיום עבודה',
    description: 'End your part of a run with a hand-off: where it stands and what comes next. If outputs still wait for review it shows as "ready for review"; a person closes it. Also use it after a stop request, with stopped=true.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: RUN,
        summary: str('Where it stands, in two or three Hebrew sentences.'),
        next_step: str('What should happen next, and who does it.'),
        stopped: { type: 'boolean', description: 'true when you stop because a person asked.' },
      },
      required: ['run_id', 'summary'],
      additionalProperties: false,
    },
  },
];

// ---------- helpers ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = encodeURIComponent;
class UserError extends Error {}
const fail = (msg) => { throw new UserError(msg); };
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const day = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
const short = (s, n = 4000) => (typeof s === 'string' ? s.trim().slice(0, n) : s);

export function makeDb(base, key, actor) {
  return async function db(path, { method = 'GET', body, prefer } = {}) {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (actor) headers['x-actor'] = actor;
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${base}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      // The database rules for agents speak Hebrew to people; pass them on as they are.
      let msg = text;
      try { msg = JSON.parse(text).message || text; } catch (e) { /* not JSON */ }
      if (res.status >= 400 && res.status < 500 && /[֐-׿]/.test(msg)) fail(msg);
      throw new Error(`${method} ${path.split('?')[0]}: ${res.status} ${msg.slice(0, 200)}`);
    }
    return text ? JSON.parse(text) : null;
  };
}

// ---------- the tools ----------
export function makeTools(db, me) {
  const people = async () => db(`people?select=id,name,is_agent,is_team,archived&team_id=eq.${me.team_id}`);
  const myProjects = async () => {
    const rows = await db(`projects?select=id,name,stage,owner_id,partner_ids,description,flagged,classified,personal,claude_project_url&team_id=eq.${me.team_id}&archived=is.false&order=name`);
    return rows.filter((p) => !p.flagged && (p.owner_id === me.person_id || (!p.personal && (p.partner_ids || []).includes(me.person_id))));
  };
  async function project(ref) {
    if (!ref) fail('חסר פרויקט. אפשר לבחור מתוך list_projects.');
    const mine = await myProjects();
    if (UUID.test(ref)) {
      const p = mine.find((x) => x.id === ref);
      if (!p) fail('הפרויקט לא נמצא בין הפרויקטים שלך.');
      return p;
    }
    const q = String(ref).trim();
    const hits = mine.filter((p) => p.name === q);
    const loose = hits.length ? hits : mine.filter((p) => p.name.includes(q) || q.includes(p.name));
    if (loose.length === 1) return loose[0];
    if (!loose.length) fail(`לא מצאתי פרויקט בשם "${q}". הפרויקטים שלך: ${mine.map((p) => p.name).join(', ') || 'אין'}.`);
    fail(`יש כמה פרויקטים שמתאימים ל"${q}": ${loose.map((p) => p.name).join(', ')}. כדאי לשלוח את ה-id.`);
  }
  async function run(id) {
    if (!id || !UUID.test(id)) fail('חסר run_id תקין. מקבלים אותו מ-start_run.');
    const r = (await db(`runs?select=*&id=eq.${id}&team_id=eq.${me.team_id}`))[0];
    if (!r) fail('הריצה לא נמצאה.');
    if (r.person_id !== me.person_id) fail('הריצה הזו שייכת לאדם אחר.');
    return r;
  }
  async function personNamed(name, fallback) {
    if (!name) return fallback;
    const all = (await people()).filter((p) => !p.archived && !p.is_agent);
    const p = all.find((x) => x.name === name.trim()) || all.find((x) => x.name.includes(name.trim()));
    if (!p) fail(`לא מצאתי בצוות את "${name}". אפשר: ${all.filter((x) => x.is_team).map((x) => x.name).join(', ')}.`);
    return p.id;
  }
  // Classified information never enters the platform: check every text against the team's word list first.
  async function guard(value) {
    const s = (await db(`team_settings?select=word_hashes&team_id=eq.${me.team_id}`))[0];
    const hits = await sensitiveHits(textsIn(value).join('\n'), s?.word_hashes || []);
    if (hits) fail('נמצאה מילה מרשימת המילים הרגישות של הצוות. הפלטפורמה בלמ״ס בלבד, אז זה לא נשמר. כדאי לנסח מחדש בלי הפרט הרגיש.');
  }
  const touchRun = (id, patch) => db(`runs?id=eq.${id}`, { method: 'PATCH', body: { ...patch, last_seen_at: new Date().toISOString() }, prefer: 'return=representation' }).then((r) => r[0]);

  // What changed for a set of runs, or for everything Claude asked of this person.
  async function updates({ run_id, since }) {
    const from = since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : new Date(Date.now() - 3 * 864e5).toISOString();
    const runs = run_id ? [await run(run_id)]
      : await db(`runs?select=*&person_id=eq.${me.person_id}&archived=is.false&order=updated_at.desc&limit=50`);
    const ids = runs.map((r) => r.id);
    // One run: what it opened. Everything: what this person's runs opened, and what Claude asked of this person.
    const inRuns = ids.length ? `run_id.in.(${ids.join(',')})` : 'run_id.is.null';
    const scope = (who) => (run_id ? `run_id=eq.${run_id}` : `or=(${inRuns},and(created_by.eq.${me.agent_id},${who}.eq.${me.person_id}))`);
    const [decided, steps, reviewed] = await Promise.all([
      db(`decisions?select=id,title,chosen_label,rationale,status,decided_at,run_id,project_id&status=in.(decided,cancelled)&updated_at=gte.${enc(from)}&${scope('assignee_id')}`),
      db(`tasks?select=id,title,status,htype,done_at,run_id,notes&kind=eq.human&status=eq.done&updated_at=gte.${enc(from)}&${scope('owner_id')}`),
      db(`outputs?select=id,title,status,feedback,reviewed_at,run_id,url&status=in.(approved,changes)&reviewed_at=gte.${enc(from)}&${run_id ? `run_id=eq.${run_id}` : `created_by=eq.${me.person_id}`}`),
    ]);
    const stops = runs.filter((r) => r.stop_requested && !['stopped', 'done'].includes(r.state));
    const queued = run_id ? [] : runs.filter((r) => r.state === 'queued');
    return {
      since: from,
      stop_requested: stops.map((r) => ({ run_id: r.id, title: r.title })),
      decisions_answered: decided.map((d) => ({ id: d.id, question: d.title, status: d.status, chosen: d.chosen_label, why: d.rationale, run_id: d.run_id })),
      human_steps_done: steps.map((t) => ({ id: t.id, title: t.title, type: t.htype, notes: t.notes, run_id: t.run_id })),
      outputs_reviewed: reviewed.map((o) => ({ id: o.id, title: o.title, status: o.status, feedback: o.feedback, run_id: o.run_id })),
      launched_for_claude: queued.map((r) => ({ run_id: r.id, title: r.title, brief: r.brief, project_id: r.project_id })),
    };
  }
  const pendingFor = async (r) => {
    const [decs, steps] = await Promise.all([
      db(`decisions?select=id&run_id=eq.${r.id}&status=eq.open`),
      db(`tasks?select=id&run_id=eq.${r.id}&kind=eq.human&status=neq.done&archived=is.false`),
    ]);
    return decs.length + steps.length;
  };

  return {
    async whats_waiting() {
      const mine = await myProjects();
      const [decs, steps, outs, runs, plan] = await Promise.all([
        db(`decisions?select=id,title,unblocks,due,project_id,run_id&status=eq.open&archived=is.false&assignee_id=eq.${me.person_id}&order=created_at`),
        db(`tasks?select=id,title,htype,due,project_id,run_id&kind=eq.human&owner_id=eq.${me.person_id}&status=neq.done&archived=is.false&order=created_at`),
        db(`outputs?select=id,title,url,project_id,run_id&status=eq.review&archived=is.false&created_by=eq.${me.person_id}&order=created_at.desc`),
        db(`runs?select=id,title,state,step,progress,brief,project_id&person_id=eq.${me.person_id}&archived=is.false&state=in.(queued,running,waiting,review)&order=updated_at.desc`),
        mine.length ? db(`tasks?select=id,title,due,project_id&kind=eq.claude&status=neq.done&archived=is.false&project_id=in.(${mine.map((p) => p.id).join(',')})&order=due.asc.nullslast&limit=30`) : [],
      ]);
      const name = (id) => mine.find((p) => p.id === id)?.name || null;
      return {
        person: me.person_name,
        launched_for_claude: runs.filter((r) => r.state === 'queued').map((r) => ({ run_id: r.id, title: r.title, brief: r.brief, project: name(r.project_id) })),
        my_runs: runs.filter((r) => r.state !== 'queued').map((r) => ({ run_id: r.id, title: r.title, state: r.state, state_he: STATE_WORDS[r.state], step: r.step, progress: r.progress, project: name(r.project_id) })),
        decisions_owed_by_person: decs.map((d) => ({ id: d.id, question: d.title, unblocks: d.unblocks, due: d.due, project: name(d.project_id) })),
        steps_owed_by_person: steps.map((t) => ({ id: t.id, title: t.title, type: t.htype, due: t.due, project: name(t.project_id) })),
        outputs_waiting_review: outs.map((o) => ({ id: o.id, title: o.title, url: o.url, project: name(o.project_id) })),
        claude_plan_steps: plan.map((t) => ({ id: t.id, title: t.title, due: t.due, project: name(t.project_id) })),
        hint: runs.some((r) => r.state === 'queued') ? 'יש ריצות שהופעלו מהפלטפורמה ומחכות ל-Claude. אפשר להמשיך אחת מהן עם start_run ו-run_id.' : undefined,
      };
    },

    async list_projects() {
      const mine = await myProjects();
      const ids = mine.map((p) => p.id);
      if (!ids.length) return { projects: [] };
      const pin = `project_id=in.(${ids.join(',')})`;
      const [ppl, decs, steps, runs] = await Promise.all([
        people(),
        db(`decisions?select=project_id&status=eq.open&archived=is.false&${pin}`),
        db(`tasks?select=project_id&kind=eq.human&status=neq.done&archived=is.false&${pin}`),
        db(`runs?select=project_id,state&archived=is.false&state=in.(queued,running,waiting,review)&${pin}`),
      ]);
      const count = (rows, id) => rows.filter((r) => r.project_id === id).length;
      return {
        projects: mine.map((p) => ({
          id: p.id, name: p.name, stage: p.stage, goal: p.classified ? null : p.description,
          lead: ppl.find((x) => x.id === p.owner_id)?.name, my_role: p.owner_id === me.person_id ? 'lead' : 'partner',
          open_decisions: count(decs, p.id), open_human_steps: count(steps, p.id), active_runs: count(runs, p.id),
        })),
      };
    },

    async get_project({ project: ref }) {
      const p = await project(ref);
      const [full, ppl, decs, steps, runs, outs, ctx, claude] = await Promise.all([
        db(`projects?select=id,name,stage,description,brief,milestones,links,stakeholders,risks,classified,owner_id,partner_ids,target_date,personal,claude_project_url,plan_summary,plan_updated_at&id=eq.${p.id}`).then((r) => r[0]),
        people(),
        db(`decisions?select=id,title,status,chosen_label,rationale,decided_at,options,due,assignee_id&project_id=eq.${p.id}&archived=is.false&status=neq.cancelled&order=created_at.desc&limit=40`),
        db(`tasks?select=id,title,htype,status,owner_id,due&project_id=eq.${p.id}&kind=eq.human&status=neq.done&archived=is.false&private=is.false`),
        db(`runs?select=id,title,state,step,progress,person_id,updated_at&project_id=eq.${p.id}&archived=is.false&state=in.(queued,running,waiting,review)`),
        db(`outputs?select=id,title,kind,url,status,feedback,created_at&project_id=eq.${p.id}&archived=is.false&order=created_at.desc&limit=15`),
        db(`team_settings?select=context&team_id=eq.${me.team_id}`).then((r) => r[0]?.context || null),
        db(`tasks?select=id,title,status,due&project_id=eq.${p.id}&kind=eq.claude&status=neq.done&archived=is.false&order=due.asc.nullslast`),
      ]);
      const who = (id) => ppl.find((x) => x.id === id)?.name || null;
      return {
        id: full.id, name: full.name, stage: full.stage, target_date: full.target_date,
        classified_note: full.classified ? 'הפרטים של הפרויקט נמצאים ברשת המסווגת. כאן רק השם הבלמ״סי. אין לבקש או לכתוב פרטים.' : undefined,
        goal: full.classified ? null : full.description,
        brief_for_claude: full.classified ? null : full.brief,
        lead: who(full.owner_id), partners: (full.partner_ids || []).map(who).filter(Boolean),
        milestones: full.milestones, links: full.links, stakeholders: full.stakeholders, risks: full.risks,
        decision_log: decs.filter((d) => d.status === 'decided').map((d) => ({ question: d.title, chosen: d.chosen_label, why: d.rationale, at: d.decided_at })),
        open_decisions: decs.filter((d) => d.status === 'open').map((d) => ({ id: d.id, question: d.title, assignee: who(d.assignee_id), due: d.due })),
        open_human_steps: steps.map((t) => ({ id: t.id, title: t.title, type: t.htype, owner: who(t.owner_id), due: t.due })),
        active_runs: runs.map((r) => ({ run_id: r.id, title: r.title, state: r.state, step: r.step, progress: r.progress, for: who(r.person_id) })),
        recent_outputs: outs,
        personal: full.personal || false,
        claude_project_url: full.claude_project_url || null,
        plan: full.plan_summary ? { summary: full.plan_summary, updated_at: full.plan_updated_at } : null,
        claude_steps: claude.map((t) => ({ id: t.id, title: t.title, status: t.status, due: t.due })),
        team_context: ctx,
      };
    },

    async start_run({ run_id, project: ref, title, brief, surface, session_url }) {
      const now = new Date().toISOString();
      if (run_id) {
        const r = await run(run_id);
        if (r.state === 'done') fail('הריצה הזו כבר הסתיימה. אפשר לפתוח ריצה חדשה.');
        if (r.stop_requested || r.state === 'stopped') fail('אדם עצר את הריצה הזו. רק אדם ממשיך אותה מהפלטפורמה, או שפותחים ריצה חדשה.');
        const up = await touchRun(r.id, clean({ state: 'running', surface, session_url: short(session_url, 500), step: r.state === 'queued' ? 'מתחיל לעבוד' : 'ממשיך' }));
        const p = up.project_id ? await this.get_project({ project: up.project_id }).catch(() => null) : null;
        return { run_id: up.id, title: up.title, brief: up.brief, project: p, note: 'הריצה נאספה. מעכשיו report_progress ו-publish_output עם ה-run_id הזה.' };
      }
      if (!title) fail('חסרה כותרת לריצה.');
      const p = await project(ref);
      await guard({ title, brief });
      const [r] = await db('runs', {
        method: 'POST', prefer: 'return=representation',
        body: clean({ team_id: me.team_id, project_id: p.id, person_id: me.person_id, title: short(title, 140), brief: short(brief, 2000), state: 'running', progress: 0, step: 'מתחיל לעבוד', surface, session_url: short(session_url, 500), source: 'claude', created_by: me.agent_id, last_seen_at: now }),
      });
      return { run_id: r.id, project: p.name, note: 'הריצה נרשמה והצוות רואה אותה. לדווח בכל אבן דרך עם report_progress.' };
    },

    async report_progress({ run_id, progress, step, state }) {
      const r = await run(run_id);
      if (['done', 'stopped'].includes(r.state)) fail('הריצה הזו כבר הסתיימה או נעצרה.');
      await guard({ step });
      const p = typeof progress === 'number' ? Math.max(0, Math.min(1, progress > 1 ? progress / 100 : progress)) : undefined;
      const next = state || (r.state === 'queued' || r.state === 'review' ? 'running' : undefined);
      const up = await touchRun(r.id, clean({ progress: p, step: short(step, 160), state: next }));
      const since = r.last_seen_at || r.created_at;
      const u = await updates({ run_id: r.id, since });
      return {
        ok: true, state: up.state, progress: up.progress,
        stop_requested: up.stop_requested,
        instruction: up.stop_requested ? 'אדם ביקש לעצור את הריצה. לעצור עכשיו ולקרוא ל-finish_run עם stopped=true וסיכום.' : undefined,
        changed_since_last_report: u,
      };
    },

    async publish_output({ run_id, project: ref, title, url, kind, summary, needs_review, final }) {
      const r = run_id ? await run(run_id) : null;
      const p = r ? { id: r.project_id } : await project(ref);
      if (!/^https?:\/\//i.test(url || '')) fail('צריך קישור מלא (https://...) שהצוות יכול לפתוח.');
      await guard({ title, summary });
      const [o] = await db('outputs', {
        method: 'POST', prefer: 'return=representation',
        body: clean({ team_id: me.team_id, project_id: p.id, run_id: r?.id, task_id: r?.task_id, kind: KINDS.includes(kind) ? kind : 'other', title: short(title, 160), summary: short(summary, 600), url: short(url, 1000), status: needs_review === false ? 'info' : 'review', created_by: me.person_id }),
      });
      if (r) await touchRun(r.id, final ? { state: 'review', progress: 1, step: 'מוכן לבדיקה' } : { step: `פורסם: ${short(title, 100)}` });
      return { output_id: o.id, status: o.status, note: final ? 'התוצר פורסם והריצה מוכנה לבדיקה. אדם יאשר או יבקש שינויים, והתשובה תגיע ב-get_updates.' : 'התוצר פורסם ומופיע אצל הצוות עם הקישור.' };
    },

    async ask_decision({ run_id, project: ref, question, options, reason, unblocks, context, due, assignee }) {
      const r = run_id ? await run(run_id) : null;
      const p = r ? { id: r.project_id } : await project(ref);
      options = Array.isArray(options) ? options : [];
      if (options.length === 1 || options.length > 4) fail('צריך בין 2 ל-4 אפשרויות, או בלי אפשרויות בכלל לשאלה פתוחה.');
      await guard({ question, options, reason, unblocks, context });
      const who = await personNamed(assignee, me.person_id);
      const opts = options.map((o, i) => clean({ key: String.fromCharCode(97 + i), label: short(o.label, 120), note: short(o.note, 240), recommended: !!o.recommended }));
      if (opts.length && !opts.some((o) => o.recommended)) opts[0].recommended = true;
      const [d] = await db('decisions', {
        method: 'POST', prefer: 'return=representation',
        body: clean({ team_id: me.team_id, project_id: p.id, run_id: r?.id, title: short(question, 200), context: short(context, 2000), kind: 'direction', options: opts, reason: short(reason, 600), unblocks: short(unblocks, 300), due: day(due), assignee_id: who, source: 'claude', created_by: me.agent_id }),
      });
      if (r) await touchRun(r.id, { state: 'waiting', step: `מחכה להחלטה: ${short(question, 100)}` });
      return { decision_id: d.id, note: `${opts.length ? 'ההחלטה' : 'השאלה'} נשלחה כרטיס בפלטפורמה ובהתראה לטלפון. בינתיים אפשר להמשיך במה שלא תלוי בה, ולבדוק get_updates.` };
    },

    async request_human_step({ run_id, project: ref, type, title, details, assignee, due }) {
      const r = run_id ? await run(run_id) : null;
      const p = r ? { id: r.project_id } : await project(ref);
      await guard({ title, details });
      const who = await personNamed(assignee, me.person_id);
      const [t] = await db('tasks', {
        method: 'POST', prefer: 'return=representation',
        body: clean({ team_id: me.team_id, project_id: p.id, run_id: r?.id, title: short(title, 200), notes: short(details, 2000), kind: 'human', htype: HTYPES.includes(type) ? type : 'other', owner_id: who, due: day(due), status: 'todo', created_by: me.agent_id }),
      });
      if (r) await touchRun(r.id, { state: 'waiting', step: `מחכה ל: ${short(title, 100)}` });
      return { task_id: t.id, note: 'הבקשה מופיעה אצל האדם ב"מה מחכה לי" ובטלפון. אפשר להמשיך במה שלא תלוי בה, ולבדוק get_updates.' };
    },

    async get_updates(args) { return updates(args || {}); },

    async create_project({ name, goal, personal, partners, claude_project_url, target_date }) {
      name = short(name, 80);
      if (!name) fail('חסר שם לפרויקט.');
      await guard({ name, goal });
      const url = short(claude_project_url, 500);
      if (url && !/^https:\/\/claude\.ai\//.test(url)) fail('הקישור לפרויקט ב-Claude צריך להתחיל ב-https://claude.ai/');
      const mine = await myProjects();
      const same = mine.find((x) => x.name === name || (url && x.claude_project_url === url));
      if (same) return { project_id: same.id, name: same.name, existed: true, note: 'הפרויקט כבר בפלטפורמה. אפשר להמשיך עם set_plan.' };
      const partnerIds = personal ? [] : await Promise.all((partners || []).slice(0, 8).map((n) => personNamed(n)));
      const [p] = await db('projects', {
        method: 'POST', prefer: 'return=representation',
        body: clean({ team_id: me.team_id, name, description: short(goal, 1000), owner_id: me.person_id, partner_ids: partnerIds.filter((x) => x !== me.person_id),
          personal: !!personal, claude_project_url: url, target_date: day(target_date), stage: 'proposed', start_date: new Date().toISOString().slice(0, 10), milestones: [] }),
      });
      return { project_id: p.id, name: p.name, personal: p.personal, note: 'הפרויקט נוסף לפלטפורמה. השלב הבא: לבנות איתו תוכנית עבודה ולכתוב אותה ב-set_plan.' };
    },

    async set_plan({ run_id, project: ref, summary, phases, steps }) {
      const r = run_id ? await run(run_id) : null;
      const p = r ? await project(r.project_id) : await project(ref);
      await guard({ summary, phases, steps });
      const full = (await db(`projects?select=milestones&id=eq.${p.id}`))[0];
      const patch = {};
      if (summary) Object.assign(patch, { plan_summary: short(summary, 1500), plan_updated_at: new Date().toISOString() });
      if (Array.isArray(phases) && phases.length) {
        const old = full.milestones || [];
        patch.milestones = phases.slice(0, 12).map((ph) => {
          const was = old.find((m) => m.title === ph.title);
          return clean({ title: short(ph.title, 80), due: day(ph.due) || was?.due, done: was?.done || false });
        });
        const last = patch.milestones.map((m) => m.due).filter(Boolean).sort().at(-1);
        if (last) patch.target_date = last;
      }
      if (Object.keys(patch).length) await db(`projects?id=eq.${p.id}`, { method: 'PATCH', body: patch });
      const added = []; const updated = [];
      const ppl = await people();
      for (const st of (steps || []).slice(0, 40)) {
        const forClaude = !st.who || /^claude$/i.test(st.who.trim());
        const owner = forClaude ? me.agent_id : await personNamed(st.who);
        const notes = [short(st.details, 1500), st.phase ? `שלב: ${short(st.phase, 80)}` : null].filter(Boolean).join('\n') || undefined;
        const body = clean({ title: short(st.title, 200), notes, owner_id: owner, due: day(st.due),
          kind: forClaude ? 'claude' : 'human', htype: forClaude ? 'general' : (HTYPES.includes(st.type) ? st.type : 'other') });
        if (st.id) {
          if (!UUID.test(st.id)) fail(`מזהה שלב לא תקין: ${st.id}`);
          const [t] = await db(`tasks?id=eq.${st.id}&project_id=eq.${p.id}`, { method: 'PATCH', prefer: 'return=representation', body });
          if (!t) fail(`לא מצאתי בפרויקט את השלב ${st.id}.`);
          updated.push({ id: t.id, title: t.title });
        } else {
          const [t] = await db('tasks', { method: 'POST', prefer: 'return=representation', body: { ...body, team_id: me.team_id, project_id: p.id, run_id: r?.id, status: 'todo', created_by: me.agent_id } });
          added.push({ id: t.id, title: t.title, who: forClaude ? 'Claude' : ppl.find((x) => x.id === owner)?.name });
        }
      }
      if (r) await touchRun(r.id, { step: 'התוכנית עודכנה' });
      return { project_id: p.id, added, updated, note: 'התוכנית בפלטפורמה. השלבים של אנשים מופיעים אצלם ב"מה מחכה לי" ובטלפון. את השלבים שלך מבצעים ומדווחים עם report_progress ו-publish_output.' };
    },

    async finish_run({ run_id, summary, next_step, stopped }) {
      const r = await run(run_id);
      await guard({ summary, next_step });
      const hand = [short(summary, 1500), next_step ? `הבא: ${short(next_step, 400)}` : null].filter(Boolean).join('\n');
      if (stopped) {
        await touchRun(r.id, { state: 'stopped', summary: hand, step: 'נעצר לבקשת אדם' });
        return { ok: true, state: 'stopped' };
      }
      const waiting = await pendingFor(r);
      const reviewing = (await db(`outputs?select=id&run_id=eq.${r.id}&status=eq.review`)).length;
      const state = reviewing ? 'review' : waiting ? 'waiting' : 'done';
      await touchRun(r.id, { state, summary: hand, progress: state === 'done' || state === 'review' ? 1 : r.progress, step: STATE_WORDS[state] });
      return { ok: true, state, state_he: STATE_WORDS[state] };
    },
  };
}

// ---------- the HTTP side: JSON-RPC over one POST ----------
const json = (data, status = 200, extra = {}) => new Response(data === null ? null : JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
});
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export function keyFrom(req) {
  const auth = req.headers.get('authorization') || '';
  if (/^bearer cto_/i.test(auth)) return auth.slice(7).trim();
  const url = new URL(req.url);
  const seg = url.pathname.split('/').filter(Boolean).find((s) => s.startsWith('cto_'));
  return seg || url.searchParams.get('key') || null;
}

// env: { base, serviceKey }. Returns a Response.
export async function handle(req, env) {
  if (req.method === 'GET') return json({ name: SERVER.name, note: 'MCP endpoint: POST JSON-RPC here.' }, 405, { Allow: 'POST' });
  if (req.method === 'DELETE') return json(null, 204);
  if (req.method !== 'POST') return json(rpcError(null, -32600, 'POST only'), 405, { Allow: 'POST' });
  let msg;
  try { msg = await req.json(); } catch (e) { return json(rpcError(null, -32700, 'Parse error'), 400); }
  if (Array.isArray(msg)) return json(rpcError(null, -32600, 'Batches are not supported'), 400);
  const { id, method, params } = msg || {};
  const isNote = id === undefined || id === null;

  const key = keyFrom(req);
  if (!key) return json(rpcError(id, -32001, 'חסר מפתח אישי. כתובת המחבר נראית כך: .../mcp/cto_...'), 401);
  const sys = makeDb(env.base, env.serviceKey, null);
  const who = (await sys('rpc/connector_whoami', { method: 'POST', body: { p_key: key } }))?.[0];
  if (!who) return json(rpcError(id, -32001, 'המפתח לא מוכר או בוטל. אפשר ליצור מפתח חדש בפלטפורמה.'), 401);
  if (!who.enabled) return json(rpcError(id, -32002, 'החיבור ל-Claude עוד לא הופעל לצוות. מפעילים אותו בהגדרות של הפלטפורמה.'), 403);
  if (!who.agent_id) return json(rpcError(id, -32603, 'לצוות אין עדיין משתמש Claude בפלטפורמה.'), 500);

  if (isNote) return json(null, 202); // notifications/initialized and friends: nothing to answer
  if (method === 'initialize') {
    const asked = params?.protocolVersion;
    return json({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: `${INSTRUCTIONS}\nYou work for ${who.person_name}.`,
      },
    });
  }
  if (method === 'ping') return json({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  if (method === 'tools/call') {
    const name = params?.name;
    if (!TOOLS.some((t) => t.name === name)) return json(rpcError(id, -32602, `Unknown tool: ${name}`));
    const me = { person_id: who.person_id, person_name: who.person_name, team_id: who.team_id, agent_id: who.agent_id };
    const tools = makeTools(makeDb(env.base, env.serviceKey, who.agent_id), me);
    try {
      const out = await tools[name](params?.arguments || {});
      return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: out } });
    } catch (e) {
      if (e instanceof UserError) return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: e.message }], isError: true } });
      console.error(name, e);
      return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'תקלה בפלטפורמה. אפשר לנסות שוב בעוד רגע.' }], isError: true } });
    }
  }
  return json(rpcError(id, -32601, `Method not found: ${method}`));
}
