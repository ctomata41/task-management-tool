// Projects: one card each, with progress and state worked out from what Claude reported, never typed in.
import { useState } from 'preact/hooks';
import { html, Icon, Faces, Ring, ClaudeMark, Seg, ProjectTag, ago } from '../ui.js';
import { DecisionCard, HumanTaskRow, OutputCard, AgentRow } from '../parts.js';
import { Gantt } from './gantt.js';
import {
  useStore, myProjects, projectProgress, projectHealth, projectAgents, project, person, openSheet,
} from '../store.js';

const HC = { on: 'var(--h-on)', wait: 'var(--s-review)', risk: 'var(--h-risk)' };

export function Projects() {
  const s = useStore();
  const [scope, setScope] = useState('mine');
  const list = scope === 'mine' ? myProjects() : s.projects;
  return html`<div class="page">
    <header class="page-head"><div><h1>פרויקטים</h1><p class="sub">ההתקדמות והמצב מחושבים לבד ממה ש-Claude מדווח</p></div>
      <${Seg} value=${scope} onChange=${setScope} label="אילו פרויקטים" options=${[{ id: 'mine', label: 'שלי' }, { id: 'all', label: 'כל הצוות' }]} /></header>
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
      <div class="grow"><h3>${p.name}</h3><span class="muted small">${p.stage} · ${next ? `הבא: ${next.title}` : 'כל אבני הדרך הושלמו'}</span></div>
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
  return html`<div class="page">
    <a class="back2" href="#/projects"><${Icon} name="chevronRight" size=${16} />פרויקטים</a>
    <header class="phero" style=${`--c:${p.color}`}>
      <${Ring} value=${projectProgress(p)} size=${84} stroke=${8} color=${p.color} />
      <div class="grow">
        <p class="eyebrow">${p.stage} · מוביל: ${person(p.lead).name}${p.partners.length ? ` · שותפים: ${p.partners.map((x) => person(x).name).join(', ')}` : ''}</p>
        <h1>${p.name}</h1>
        <p class="sub"><${Icon} name="target" size=${15} /> ${p.goal}</p>
        <p class="pc-health" style=${`--c:${HC[h.id]}`}><span class="spill" style=${`--c:${HC[h.id]}`}>${h.label}</span>${h.why}</p>
      </div>
      <div class="phero-act">
        <button type="button" class="btn btn-primary" onClick=${() => openSheet('launch', { project: p.id })}><${ClaudeMark} size=${18} />הפעלת Claude</button>
        ${iv ? html`<a class="btn" href=${`#/interview/${p.id}`}><${Icon} name="message" size=${15} />ראיון</a>` : null}
      </div>
    </header>
    <${Seg} value=${tab} onChange=${setTab} label="תצוגה" options=${[
      { id: 'overview', label: 'סקירה' }, { id: 'outputs', label: 'תוצרים', n: outs.length }, { id: 'agents', label: 'סוכנים', n: ags.filter((a) => a.state !== 'done').length },
      { id: 'gantt', label: 'גאנט' }, { id: 'decisions', label: 'החלטות', n: decs.filter((d) => !d.choice).length },
    ]} />
    ${tab === 'overview' ? html`<div class="today-grid">
      <div class="col-main">
        ${tasks.length ? html`<section class="sec"><div class="sec-head"><h2>Claude מחכה לאנשים</h2></div><div class="group">${tasks.map((t) => html`<${HumanTaskRow} t=${t} />`)}</div></section>` : null}
        ${decs.some((d) => !d.choice) ? html`<section class="sec"><div class="sec-head"><h2>החלטות פתוחות</h2></div><div class="dgrid">${decs.filter((d) => !d.choice).map((d) => html`<${DecisionCard} d=${d} />`)}</div></section>` : null}
        <section class="sec"><div class="sec-head"><h2>תוצרים אחרונים</h2></div><div class="ostrip">${outs.slice(0, 4).map((o) => html`<${OutputCard} o=${o} />`)}</div></section>
      </div>
      <aside class="col-side">
        <section class="card side-card"><div class="sec-head"><h2>מה קרה</h2><span class="muted small">נכתב לבד</span></div>
          <ol class="tline">${feed.map((f) => html`<li class=${"k-" + f.kind}><i></i><div><span>${f.text}</span><span class="muted small">${ago(f.at)}</span></div></li>`)}</ol>
        </section>
        <section class="card side-card"><div class="sec-head"><h2>אבני דרך</h2></div>
          ${p.milestones.map((m) => html`<div class="ms-row ${m.done ? 'done' : ''}"><span class="cbx">${m.done ? html`<${Icon} name="check" size=${13} />` : null}</span><span class="grow">${m.title}</span><span class="muted small">${new Date(m.end).getDate()}/${new Date(m.end).getMonth() + 1}</span></div>`)}
        </section>
      </aside>
    </div>` : null}
    ${tab === 'outputs' ? html`<div class="ogrid">${outs.map((o) => html`<${OutputCard} o=${o} wide />`)}</div>` : null}
    ${tab === 'agents' ? html`<div class="group">${ags.map((a) => html`<${AgentRow} a=${a} showProject=${false} />`)}</div>` : null}
    ${tab === 'gantt' ? html`<div class="card"><${Gantt} projects=${[p]} from=${p.start} days=${Math.max(21, Math.ceil((new Date(p.end) - new Date(p.start)) / 864e5) + 3)} /></div>` : null}
    ${tab === 'decisions' ? html`<div class="dgrid">${decs.map((d) => html`<${DecisionCard} d=${d} />`)}</div>` : null}
  </div>`;
}
export { ProjectTag };
