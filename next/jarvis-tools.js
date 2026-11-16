// What Jarvis can do, as client tools: the ElevenLabs agent calls them by name, they run here in the browser through the
// same store actions as a tap (so the same permissions, the unclassified check and the same live writes), and what they
// return is what Jarvis says next. Reading needs nothing; every change is said back first and done only after a "yes"
// (the agent's prompt says so, and each write tool also takes confirmed=true). Jarvis never decides, approves or closes
// anything for a person on its own: an answer to a decision is the person's own words, said to it.
import {
  getState, myProjects, project, person, projectProgress, projectHealth, myDecisions, myHumanTasks, myAgents, projectAgents,
  decide, completeHuman, addStep, addEvent, toggleMilestone, launch, needsClaude, toast,
} from './store.js';
import { tools as CAPS } from './data.js';
import { gcal } from './live.js';
import { haptic } from '../app/motion.js';

const norm = (t) => String(t || '').toLowerCase().replace(/["'`׳״]/g, '').replace(/\s+/g, ' ').trim();
const day = (iso) => (iso ? `${new Date(iso).getDate()}/${new Date(iso).getMonth() + 1}` : '');
const hhmm = (iso) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
const pct = (x) => `${Math.round(x * 100)}%`;

// Names as people say them: a full name, a first name, or part of a project's name.
export function findProject(name) {
  const q = norm(name);
  if (!q) return null;
  const list = myProjects();
  return list.find((p) => norm(p.name) === q) || list.find((p) => norm(p.name).includes(q) || q.includes(norm(p.name)))
    || list.find((p) => q.split(' ').filter((w) => w.length > 2).some((w) => norm(p.name).includes(w))) || null;
}
export function findPerson(name) {
  const q = norm(name);
  if (!q) return null;
  if (/^(אני|אותי|לי|עצמי|me)$/.test(q)) return person(getState().me);
  const ppl = getState().people.filter((p) => p.isTeam !== false && !p.agent);
  return ppl.find((p) => norm(p.name) === q) || ppl.find((p) => norm(p.name).split(' ')[0] === q.split(' ')[0]) || ppl.find((p) => norm(p.name).includes(q)) || null;
}
const yes = (c) => c === true || c === 'true';
const missing = (what) => ({ ok: false, error: what });
const needYes = (summary) => ({ ok: false, needs_confirmation: true, say: `לפני שאני עושה את זה, לאשר: ${summary}? אחרי "כן", לקרוא שוב עם confirmed=true.` });

// A time said as an ISO string, or as a day and an hour.
function when(start) {
  const d = new Date(start);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function makeTools({ onAction = () => {}, startMeeting: startRec = null, open = (h) => { location.hash = h; } } = {}) {
  const did = (label, ok = true) => { onAction({ label, ok, at: Date.now() }); if (ok) haptic('success'); };
  const t = {
    // ---- reading ----
    whats_waiting: async () => {
      const s = getState();
      const decisions = myDecisions().map((d) => ({ question: d.q, project: project(d.project)?.name, options: d.options.map((o) => o.label), open_answer: !d.options.length, from: d.source === 'claude' ? 'Claude' : person(d.by)?.name }));
      const steps = myHumanTasks().map((x) => ({ title: x.title, project: project(x.project)?.name, due: x.due || null, blocks_claude: !!x.blocks }));
      const review = s.outputs.filter((o) => o.review && myProjects().some((p) => p.id === o.project)).map((o) => ({ title: o.title, project: project(o.project)?.name }));
      const back = myAgents().filter(needsClaude).map((a) => ({ title: a.title, project: project(a.project)?.name }));
      return { decisions, steps, outputs_to_review: review, claude_waiting_to_be_continued: back, running_now: myAgents().filter((a) => a.state === 'run').length };
    },
    list_projects: async () => myProjects().map((p) => {
      const next = p.milestones.find((m) => !m.done);
      const h = projectHealth(p);
      return { name: p.name, lead: person(p.lead).name, stage: p.stage, progress: pct(projectProgress(p)), health: h.label, why: h.why, next_milestone: next ? `${next.title} עד ${day(next.end)}` : null, personal: !!p.personal };
    }),
    project_status: async ({ project: name }) => {
      const p = findProject(name);
      if (!p) return missing(`לא מצאתי פרויקט בשם "${name}". הפרויקטים: ${myProjects().map((x) => x.name).join(', ')}`);
      const s = getState();
      const h = projectHealth(p);
      return {
        name: p.name, goal: p.goal, lead: person(p.lead).name, partners: p.partners.map((id) => person(id).name), progress: pct(projectProgress(p)), health: h.label, why: h.why,
        milestones: p.milestones.map((m) => ({ title: m.title, due: day(m.end), done: m.done })),
        plan: p.plan || null,
        open_decisions: s.decisions.filter((d) => d.project === p.id && !d.choice).map((d) => ({ question: d.q, owner: person(d.owner).name })),
        people_steps: s.humanTasks.filter((x) => x.project === p.id && !x.done).map((x) => ({ title: x.title, owner: person(x.owner).name, due: x.due || null })),
        claude: projectAgents(p.id).filter((a) => a.state !== 'done').map((a) => ({ title: a.title, state: a.state, step: a.step, progress: pct(a.progress || 0) })),
        recent: s.feed.filter((f) => f.project === p.id).slice(0, 6).map((f) => f.text),
        meetings: (s.meetings || []).filter((m) => m.project === p.id).slice(0, 3).map((m) => ({ title: m.title, when: day(m.start), summary: m.summary?.tldr || null })),
      };
    },
    calendar: async ({ day: d } = {}) => {
      const s = getState();
      const from = d ? new Date(d) : new Date();
      if (Number.isNaN(from.getTime())) return missing('לא הבנתי איזה יום');
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 864e5);
      const mine = s.events.filter((e) => new Date(e.start) >= from && new Date(e.start) < to).map((e) => ({ title: e.title, at: hhmm(e.start), minutes: e.mins }));
      const busy = (s.teamBusy || []).map((b) => ({ person: person(b.person).name, busy: b.busy.filter((x) => new Date(x.start) >= from && new Date(x.start) < to).map((x) => `${hhmm(x.start)} (${x.mins} דק׳)`) })).filter((b) => b.busy.length);
      return { day: from.toISOString().slice(0, 10), my_events: mine, team_busy: busy, calendar_connected: !!s.gcal };
    },

    // ---- changing (each one only after the person said yes) ----
    schedule_meeting: async ({ title, start, minutes = 30, with: who = [], project: pname = '', confirmed = false }) => {
      const at = when(start);
      if (!title || !at) return missing('צריך נושא ושעה');
      const people = (Array.isArray(who) ? who : String(who).split(/[,،]| ו/)).map((n) => n && findPerson(n)).filter(Boolean).filter((p) => p.id !== getState().me);
      const p = pname ? findProject(pname) : null;
      const say = `פגישה "${title}" ב-${day(at.toISOString())} ב-${hhmm(at.toISOString())}, ${minutes} דקות${people.length ? `, עם ${people.map((x) => x.name).join(' ו')}` : ''}${p ? `, בפרויקט ${p.name}` : ''}`;
      if (!yes(confirmed)) return needYes(say);
      const s = getState();
      if (s.mode === 'live') {
        if (!s.gcal) return missing('היומן של Google עוד לא מחובר. מחברים אותו בעמוד "יומן וגאנט"');
        const r = await gcal.create({ title, start: at.toISOString(), mins: +minutes, project_id: p?.id || null, invite: people.map((x) => x.id) });
        did(`נקבע: ${say}`);
        return { ok: true, done: say, invited: r?.invited || 0, not_invited: r?.not_invited || 0 };
      }
      addEvent({ title, start: at.toISOString(), mins: +minutes, project: p?.id, with: people.map((x) => x.id) });
      did(`נקבע: ${say}`);
      return { ok: true, done: say };
    },
    add_step: async ({ project: pname, title, owner = '', due = '', confirmed = false }) => {
      const p = findProject(pname);
      if (!p) return missing(`לא מצאתי פרויקט בשם "${pname}"`);
      const who = owner ? findPerson(owner) : person(getState().me);
      if (!who?.id) return missing(`לא מצאתי אדם בשם "${owner}"`);
      if (!title) return missing('מה המטלה?');
      const d = due && /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) : '';
      const say = `מטלה ל${who.name} ב${p.name}: ${title}${d ? `, עד ${day(d)}` : ''}`;
      if (!yes(confirmed)) return needYes(say);
      addStep({ project: p.id, title, owner: who.id, due: d });
      did(say);
      return { ok: true, done: say };
    },
    complete_milestone: async ({ project: pname, milestone, confirmed = false }) => {
      const p = findProject(pname);
      if (!p) return missing(`לא מצאתי פרויקט בשם "${pname}"`);
      const m = p.milestones.find((x) => norm(x.title) === norm(milestone)) || p.milestones.find((x) => norm(x.title).includes(norm(milestone)));
      if (!m) return missing(`אבני הדרך ב${p.name}: ${p.milestones.map((x) => x.title).join(', ')}`);
      const say = `${m.done ? 'לבטל את הסימון של' : 'לסמן שהושלם'} "${m.title}" ב${p.name}`;
      if (!yes(confirmed)) return needYes(say);
      toggleMilestone(p.id, m.id);
      did(say);
      return { ok: true, done: say };
    },
    finish_my_step: async ({ title, confirmed = false }) => {
      const x = myHumanTasks().find((t2) => norm(t2.title).includes(norm(title)) || norm(title).includes(norm(t2.title)));
      if (!x) return missing(`המטלות שלך: ${myHumanTasks().map((t2) => t2.title).join(', ') || 'אין'}`);
      const say = `לסמן שבוצע: ${x.title}`;
      if (!yes(confirmed)) return needYes(say);
      completeHuman(x.id);
      did(say);
      return { ok: true, done: say };
    },
    // The person answers a decision that waits for them, in their own words. Jarvis only carries the answer.
    answer_decision: async ({ question, answer, confirmed = false }) => {
      const list = myDecisions();
      const d = list.find((x) => norm(x.q).includes(norm(question)) || norm(question).includes(norm(x.q))) || (list.length === 1 ? list[0] : null);
      if (!d) return missing(`ההחלטות שמחכות לך: ${list.map((x) => x.q).join(' | ') || 'אין'}`);
      const opt = d.options.find((o) => norm(o.label) === norm(answer) || norm(answer).includes(norm(o.label)));
      const say = `לענות על "${d.q}": ${opt ? opt.label : answer}`;
      if (!yes(confirmed)) return needYes(say);
      if (opt) decide(d.id, opt.id); else decide(d.id, 'text', String(answer));
      did(say);
      return { ok: true, done: say };
    },
    launch_claude: async ({ project: pname, kind = 'doc', brief, confirmed = false }) => {
      const p = findProject(pname);
      if (!p) return missing(`לא מצאתי פרויקט בשם "${pname}"`);
      const tool = CAPS.find((c) => c.id === kind) || CAPS.find((c) => norm(c.label) === norm(kind)) || CAPS.find((c) => c.id === 'doc');
      if (!brief) return missing('מה Claude צריך לעשות?');
      const say = `להפעיל את Claude ב${p.name}: ${tool.label}, "${brief}"`;
      if (!yes(confirmed)) return needYes(say);
      launch({ tool, projectId: p.id, title: `${tool.label}: ${p.name}`, brief });
      did(say);
      return { ok: true, done: say, note: getState().mode === 'live' ? 'Claude נפתח בחלון חדש עם התדריך' : 'Claude התחיל' };
    },
    open_screen: async ({ screen, project: pname = '' }) => {
      const map = { today: '#/today', projects: '#/projects', calendar: '#/calendar', outputs: '#/outputs', insights: '#/insights', interview: '#/interview', meetings: '#/meeting' };
      const p = pname ? findProject(pname) : null;
      const h = p ? `#/project/${p.id}` : map[screen];
      if (!h) return missing(`מסכים: ${Object.keys(map).join(', ')}, או שם של פרויקט`);
      open(h);
      return { ok: true, done: `פתחתי ${p ? p.name : screen}` };
    },
    start_meeting_recording: async ({ title = 'פגישה', project: pname = '', confirmed = false }) => {
      const p = pname ? findProject(pname) : null;
      const say = `להתחיל להקליט ולתמלל את "${title}"${p ? ` בפרויקט ${p.name}` : ''}. כולם בחדר צריכים לדעת שמקליטים`;
      if (!yes(confirmed)) return needYes(say);
      if (!startRec) return missing('אי אפשר להתחיל הקלטה מכאן');
      startRec({ title, project: p?.id || null });
      did('התחלתי להקליט את הפגישה');
      return { ok: true, done: 'ההקלטה התחילה. השיחה איתי נסגרת כדי שהמיקרופון יתפנה לפגישה', end_conversation: true };
    },
  };
  return t;
}

// The tools as the ElevenLabs agent knows them: names and parameters must match exactly (they are set on the agent).
export const TOOL_DEFS = [
  { name: 'whats_waiting', description: 'מה מחכה עכשיו לאדם שמדבר: החלטות, מטלות, תוצרים לבדיקה, ו-Claude שמחכה שימשיכו אותו.', params: {} },
  { name: 'list_projects', description: 'כל הפרויקטים של האדם: התקדמות, מצב, אבן הדרך הבאה.', params: {} },
  { name: 'project_status', description: 'כל מה שידוע על פרויקט אחד: אבני דרך, תוכנית, החלטות פתוחות, מטלות, מה Claude עושה, פגישות אחרונות.', params: { project: 'שם הפרויקט, כפי שנאמר' } },
  { name: 'calendar', description: 'האירועים של האדם ביום מסוים, והזמנים התפוסים של הצוות.', params: { day: 'YYYY-MM-DD. ריק = היום' } },
  { name: 'schedule_meeting', description: 'לקבוע פגישה ביומן Google של האדם ולהזמין אנשים מהצוות. רק אחרי אישור.', params: { title: 'נושא', start: 'ISO 8601 עם אזור זמן ישראל', minutes: 'מספר', with: 'שמות, מופרדים בפסיק', project: 'שם פרויקט, לא חובה', confirmed: 'true רק אחרי שהאדם אמר כן' } },
  { name: 'add_step', description: 'להוסיף מטלה לאדם בפרויקט. רק אחרי אישור.', params: { project: 'שם הפרויקט', title: 'המטלה', owner: 'שם האחראי. ריק = מי שמדבר', due: 'YYYY-MM-DD, לא חובה', confirmed: 'true רק אחרי כן' } },
  { name: 'complete_milestone', description: 'לסמן אבן דרך כהושלמה (או לבטל). רק אחרי אישור.', params: { project: 'שם הפרויקט', milestone: 'שם אבן הדרך', confirmed: 'true רק אחרי כן' } },
  { name: 'finish_my_step', description: 'לסמן שמטלה של האדם בוצעה. רק אחרי אישור.', params: { title: 'המטלה', confirmed: 'true רק אחרי כן' } },
  { name: 'answer_decision', description: 'להעביר את התשובה של האדם להחלטה שמחכה לו. התשובה היא המילים שלו, לא שלך. רק אחרי אישור.', params: { question: 'ההחלטה', answer: 'מה האדם בחר או אמר', confirmed: 'true רק אחרי כן' } },
  { name: 'launch_claude', description: 'להפעיל את Claude על משימה בפרויקט (מחקר, מסמך, מצגת, סרטון, אפליקציה). רק אחרי אישור.', params: { project: 'שם הפרויקט', kind: 'research | doc | deck | video | app | data', brief: 'מה לעשות, במשפט או שניים', confirmed: 'true רק אחרי כן' } },
  { name: 'open_screen', description: 'לפתוח מסך בפלטפורמה.', params: { screen: 'today | projects | calendar | outputs | insights | interview | meetings', project: 'שם פרויקט, כדי לפתוח אותו' } },
  { name: 'start_meeting_recording', description: 'להתחיל להקליט ולתמלל פגישה. רק אחרי אישור.', params: { title: 'שם הפגישה', project: 'שם פרויקט, לא חובה', confirmed: 'true רק אחרי כן' } },
];
