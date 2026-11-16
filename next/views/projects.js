// Projects: one card each, with progress and state worked out from what Claude reported, never typed in.
import { useState } from 'preact/hooks';
import { html, Icon, Avatar, Faces, Ring, ClaudeMark, Seg, ProjectTag, ago } from '../ui.js';
import { DecisionCard, HumanTaskRow, OutputCard, AgentRow } from '../parts.js';
import { Gantt } from './gantt.js';
import { MilestoneTrack } from './newproject.js';
import {
  useStore, myProjects, projectProgress, projectHealth, projectAgents, project, person, openSheet, launch, planBrief, PLAN_TOOL,
  setPersonal, setClaudeUrl, toast,
  needsClaude, continueInClaude,
} from '../store.js';
import { haptic } from '../../app/motion.js';

const HC = { on: 'var(--h-on)', wait: 'var(--s-review)', risk: 'var(--h-risk)' };

export function Projects() {
  const s = useStore();
  const [scope, setScope] = useState('mine');
  const list = scope === 'mine' ? myProjects() : s.projects;
  return html`<div class="page">
    <header class="page-head"><div><h1>פרויקטים</h1><p class="sub">ההתקדמות והמצב מחושבים לבד ממה ש-Claude מדווח</p></div>
      <div class="head-act"><${Seg} value=${scope} onChange=${setScope} label="אילו פרויקטים" options=${[{ id: 'mine', label: 'שלי' }, { id: 'all', label: 'כל הצוות' }]} />
        <button type="button" class="btn btn-primary" onClick=${() => openSheet('newproject')}><${Icon} name="plus" size=${16} />פרויקט חדש</button></div></header>
    <div class="pgrid">${list.map((p) => html`<${ProjectCard} key=${p.id} p=${p} />`)}</div>
  </div>`;
}

function ProjectCard({ p }) {
  const s = useStore();
  const ags = projectAgents(p.id);
  const run = ags.filter((a) => a.state === 'run').length;
  const wait = ags.filter((a) => a.state === 'wait').length;
  const review = ags.filter((a) => a.state === 'review').length;
  const h = projectHealth(p);
  const next = p.milestones.find((m) => !m.done);
  const decs = s.decisions.filter((d) => d.project === p.id && !d.choice).length;
  const last = s.feed.find((f) => f.project === p.id);
  return html`<a class="pcard2" href=${`#/project/${p.id}`} style=${`--bar:${p.color}`}>
    <div class="pc-top">
      <${Ring} value=${projectProgress(p)} size=${52} stroke=${5} color=${p.color} />
      <div class="grow"><h3>${p.personal ? html`<${Icon} name="lock" size=${14} /> ` : null}${p.name}</h3><span class="muted small">${p.stage} · ${next ? `הבא: ${next.title}` : 'כל אבני הדרך הושלמו'}</span></div>
      <${Faces} ids=${[p.lead, ...p.partners]} size=${24} />
    </div>
    <p class="pc-health" style=${`--c:${HC[h.id]}`}><span class="spill" style=${`--c:${HC[h.id]}`}>${h.label}</span>${h.why}</p>
    <div class="pc-agents">
      ${run ? html`<span class="ag-chip run"><${ClaudeMark} size=${16} live />${run} עובדים</span>` : null}
      ${wait ? html`<span class="ag-chip wait">${wait} מחכים לאדם</span>` : null}
      ${review ? html`<span class="ag-chip review">${review} לבדיקה</span>` : null}
      ${decs ? html`<span class="ag-chip">${decs} החלטות פתוחות</span>` : null}
    </div>
    ${last ? html`<p class="pc-last muted small">${ago(last.at)}: ${last.text}</p>` : null}
  </a>`;
}

export function ProjectPage({ id }) {
  const s = useStore();
  const p = project(id);
  const [tab, setTab] = useState('overview');
  if (!p) return html`<div class="page"><p>הפרויקט לא נמצא</p></div>`;
  const ags = projectAgents(p.id);
  const outs = s.outputs.filter((o) => o.project === p.id).sort((a, b) => b.at.localeCompare(a.at));
  const decs = s.decisions.filter((d) => d.project === p.id);
  const tasks = s.humanTasks.filter((t) => t.project === p.id && !t.done);
  const h = projectHealth(p);
  const feed = s.feed.filter((f) => f.project === p.id);
  const iv = s.interviews[p.id];
  const canEdit = p.lead === s.me || p.partners.includes(s.me);
  return html`<div class="page">
    <a class="back2" href="#/projects"><${Icon} name="chevronRight" size=${16} />פרויקטים</a>
    <header class="phero" style=${`--c:${p.color}`}>
      <${Ring} value=${projectProgress(p)} size=${84} stroke=${8} color=${p.color} />
      <div class="grow">
        <p class="eyebrow">${p.personal ? html`<span class="spill lockpill"><${Icon} name="lock" size=${12} />אישי</span> ` : null}${p.stage} · מוביל: ${person(p.lead).name}${p.partners.length ? ` · שותפים: ${p.partners.map((x) => person(x).name).join(', ')}` : ''}</p>
        <h1>${p.name}</h1>
        <p class="sub"><${Icon} name="target" size=${15} /> ${p.goal}</p>
        <p class="pc-health" style=${`--c:${HC[h.id]}`}><span class="spill" style=${`--c:${HC[h.id]}`}>${h.label}</span>${h.why}</p>
      </div>
      <div class="phero-act">
        <button type="button" class="btn btn-primary" onClick=${() => openSheet('launch', { project: p.id })}><${ClaudeMark} size=${18} />הפעלת Claude</button>
        ${p.claudeUrl ? html`<a class="btn" href=${p.claudeUrl} target="_blank" rel="noopener"><${Icon} name="external" size=${15} />הפרויקט ב-Claude</a>` : null}
        ${iv ? html`<a class="btn" href=${`#/interview/${p.id}`}><${Icon} name="message" size=${15} />ראיון</a>` : null}
      </div>
    </header>
    <${MilestoneTrack} p=${p} edit=${canEdit} />
    <${Seg} value=${tab} onChange=${setTab} label="תצוגה" options=${[
      { id: 'overview', label: 'סקירה' }, { id: 'outputs', label: 'תוצרים', n: outs.length }, { id: 'agents', label: 'סוכנים', n: ags.filter((a) => a.state !== 'done').length },
      { id: 'gantt', label: 'גאנט' }, { id: 'decisions', label: 'החלטות', n: decs.filter((d) => !d.choice).length },
    ]} />
    ${tab === 'overview' ? html`<div class="today-grid">
      <div class="col-main">
        <${PlanSection} p=${p} canEdit=${canEdit} />
        ${tasks.length ? html`<section class="sec"><div class="sec-head"><h2>Claude מחכה לאנשים</h2></div><div class="group">${tasks.map((t) => html`<${HumanTaskRow} t=${t} />`)}</div></section>` : null}
        ${decs.some((d) => !d.choice) ? html`<section class="sec"><div class="sec-head"><h2>החלטות פתוחות</h2></div><div class="dgrid">${decs.filter((d) => !d.choice).map((d) => html`<${DecisionCard} d=${d} />`)}</div></section>` : null}
        ${outs.length ? html`<section class="sec"><div class="sec-head"><h2>תוצרים אחרונים</h2></div><div class="ostrip">${outs.slice(0, 4).map((o) => html`<${OutputCard} o=${o} />`)}</div></section>` : null}
      </div>
      <aside class="col-side">
        <section class="card side-card"><div class="sec-head"><h2>מה קרה</h2><span class="muted small">נכתב לבד</span></div>
          <ol class="tline">${feed.map((f) => html`<li class=${"k-" + f.kind}><i></i><div><span>${f.text}</span><span class="muted small">${ago(f.at)}</span></div></li>`)}</ol>
        </section>
        ${p.lead === s.me ? html`<${VisibilityCard} p=${p} />` : null}
        <${ClaudeProjectCard} p=${p} canEdit=${canEdit} />
      </aside>
    </div>` : null}
    ${tab === 'outputs' ? html`<div class="ogrid">${outs.map((o) => html`<${OutputCard} o=${o} wide />`)}</div>` : null}
    ${tab === 'agents' ? html`<div class="group">${ags.map((a) => html`<${AgentRow} a=${a} showProject=${false} />`)}</div>` : null}
    ${tab === 'gantt' ? html`<div class="card"><${Gantt} projects=${[p]} from=${p.start} days=${Math.max(21, Math.ceil((new Date(p.end) - new Date(p.start)) / 864e5) + 3)} /></div>` : null}
    ${tab === 'decisions' ? html`<div class="dgrid">${decs.map((d) => html`<${DecisionCard} d=${d} />`)}</div>` : null}
  </div>`;
}
// The work plan Claude wrote with the person (set_plan): the summary, then each phase with its steps, Claude's and
// people's. People's steps also wait for them in "what waits for me".
function PlanSection({ p, canEdit }) {
  const s = useStore();
  const claude = s.planSteps.filter((x) => x.project === p.id).map((x) => ({ ...x, who: 'claude' }));
  const human = s.humanTasks.filter((t) => t.project === p.id && t.phase !== undefined && (t.phase || t.due)).map((t) => ({ ...t, who: t.owner }));
  const steps = [...claude, ...human].sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const planning = s.agents.find((a) => a.project === p.id && /^תוכנית עבודה/.test(a.title) && !['done', 'stopped'].includes(a.state));
  const build = () => launch({ tool: PLAN_TOOL, projectId: p.id, title: `תוכנית עבודה: ${p.name}`, brief: planBrief(p) });
  const stuck = needsClaude(planning) && planning.owner === s.me;
  const resume = stuck ? html`<button type="button" class="btn btn-primary" onClick=${() => continueInClaude(planning)}><${ClaudeMark} size=${16} />להמשיך ב-Claude</button>` : null;
  if (!p.plan && !steps.length) {
    return html`<section class="sec"><div class="card plan-empty">
      <${ClaudeMark} size=${34} live=${!!planning} />
      <div class="grow"><strong>${planning ? 'Claude בונה את התוכנית' : 'עוד אין תוכנית עבודה'}</strong>
        <span class="muted small">${stuck ? (planning.state === 'queued' ? 'השיחה עם Claude לא התחילה. אפשר לפתוח אותה מכאן.' : 'כל התשובות שלך נשמרו. Claude לא חוזר לבד, אז פותחים שיחה שממשיכה מהן וכותבת את התוכנית.')
          : planning ? 'Claude כותב תוכנית ראשונה. שאלות, אם יהיו, יחכו לך כאן בהחלטות.' : 'Claude יכתוב שלבים, צעדים ותאריכים, וישאל רק מה שחסר. הצעדים של אנשים יגיעו אליהם לבד.'}</span></div>
      ${resume || (!planning && canEdit ? html`<button type="button" class="btn btn-primary" onClick=${build}>בניית תוכנית עם Claude</button>` : null)}
    </div></section>`;
  }
  const phases = [...p.milestones.map((m) => m.title), ...new Set(steps.map((x) => x.phase).filter((x) => x && !p.milestones.some((m) => m.title === x)))];
  const groups = [...phases.map((ph) => ({ ph, list: steps.filter((x) => x.phase === ph) })), { ph: '', list: steps.filter((x) => !x.phase || !phases.includes(x.phase)) }].filter((g) => g.list.length);
  return html`<section class="sec"><div class="sec-head"><h2>תוכנית העבודה</h2>
      ${stuck ? html`<button type="button" class="btn sm" onClick=${() => continueInClaude(planning)}><${ClaudeMark} size=${15} />להמשיך ב-Claude</button>`
        : canEdit ? html`<button type="button" class="btn sm" onClick=${build}><${ClaudeMark} size=${15} />לעדכן עם Claude</button>` : null}</div>
    <div class="card plan">
      ${p.plan ? html`<p class="plan-sum">${p.plan}${p.planAt ? html` <span class="muted small">· ${ago(p.planAt)}</span>` : null}</p>` : null}
      ${groups.map((g) => html`<div class="plan-ph">${g.ph ? html`<h3>${g.ph}</h3>` : groups.length > 1 ? html`<h3>עוד</h3>` : null}
        ${g.list.map((x) => html`<div class=${'plan-step' + (x.done ? ' done' : '')}>
          <span class="cbx">${x.done ? html`<${Icon} name="check" size=${13} />` : null}</span>
          <span class="grow">${x.title}</span>
          ${x.who === 'claude' ? html`<span class="plan-who"><${ClaudeMark} size=${16} />Claude</span>` : html`<span class="plan-who"><${Avatar} id=${x.who} size=${18} />${person(x.who).name}</span>`}
          ${x.due ? html`<span class="muted small plan-due">${new Date(x.due).getDate()}/${new Date(x.due).getMonth() + 1}</span>` : null}
        </div>`)}</div>`)}
    </div></section>`;
}

function VisibilityCard({ p }) {
  return html`<section class="card side-card"><div class="sec-head"><h2>מי רואה</h2></div>
    <${Seg} value=${p.personal ? 'me' : 'team'} label="מי רואה" options=${[{ id: 'team', label: 'כל הצוות' }, { id: 'me', label: 'רק אני' }]}
      onChange=${(v) => setPersonal(p.id, v === 'me')} />
    <p class="muted small">${p.personal ? 'רק לך מופיעים הפרויקט, ההחלטות, השלבים והתוצרים שלו.' : 'כל הצוות רואה את הפרויקט. אפשר להפוך אותו לאישי בכל רגע.'}</p>
  </section>`;
}

// The link to the project in Claude, and the instructions to paste into it, so every chat there keeps the platform up
// to date and asks its questions here.
export function projectInstructions(p) {
  return [
    `הפרויקט הזה מחובר לפלטפורמת הצוות (המחבר "פלטפורמת הצוות"), לפרויקט "${p.name}".`,
    `- בתחילת כל שיחה: לקרוא ל-whats_waiting ול-get_project עם "${p.name}".`,
    '- תוכנית העבודה ואבני הדרך נשמרות בפלטפורמה עם set_plan. כשמשהו משתנה, לעדכן אותן שם.',
    '- כל שאלה אליי: דרך ask_decision (גם שאלה פתוחה, בלי אפשרויות), כדי שאוכל לענות בפלטפורמה. אחרי שאלה לבדוק get_updates.',
    '- עבודה: start_run בהתחלה, report_progress באבני דרך, publish_output עם קישור לכל תוצר, finish_run בסוף.',
    '- משהו שרק אדם יכול לעשות (פגישה, קובץ, הרשאה, תשלום): request_human_step.',
  ].join('\n');
}
function ClaudeProjectCard({ p, canEdit }) {
  const [url, setUrl] = useState(p.claudeUrl || '');
  const bad = url.trim() && !/^https:\/\/claude\.ai\//.test(url.trim());
  const copy = () => (navigator.clipboard?.writeText(projectInstructions(p)) || Promise.reject()).then(() => { haptic(); toast('ההוראות הועתקו. מדביקים אותן בהוראות של הפרויקט ב-Claude'); }, () => toast('לא הצלחתי להעתיק'));
  return html`<section class="card side-card cproj"><div class="sec-head"><h2>הפרויקט ב-Claude</h2></div>
    ${canEdit ? html`<form class="cproj-form" onSubmit=${(e) => { e.preventDefault(); if (!bad) setClaudeUrl(p.id, url.trim()); }}>
      <input class="input" type="url" dir="ltr" aria-label="קישור לפרויקט ב-Claude" placeholder="https://claude.ai/project/…" value=${url} onInput=${(e) => setUrl(e.currentTarget.value)} />
      <button type="submit" class="btn sm" disabled=${bad || url.trim() === (p.claudeUrl || '')}>שמירה</button>
    </form>${bad ? html`<p class="err small" role="alert">הקישור צריך להתחיל ב-https://claude.ai/</p>` : null}`
      : p.claudeUrl ? html`<a class="small" href=${p.claudeUrl} target="_blank" rel="noopener" dir="ltr">${p.claudeUrl}</a>` : html`<p class="muted small">עוד לא קושר.</p>`}
    <p class="muted small">כדי שכל שיחה בפרויקט ב-Claude תעדכן כאן ותשאל כאן, מדביקים את ההוראות האלה בהוראות הפרויקט שם (Project instructions).</p>
    <button type="button" class="btn sm" onClick=${copy}><${Icon} name="copy" size=${14} />העתקת ההוראות</button>
  </section>`;
}
export { ProjectTag };
