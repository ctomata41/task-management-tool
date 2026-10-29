// "המפקד בדקה": the commander's one-minute phone screen (spec). The decisions waiting for them with a one-tap answer,
// only what rose (each with why it rose), and one line per project, with one-tap open or stop for command.
import { useEffect, useState } from 'preact/hooks';
import {
  person, isCommand, openTask, openDecision, openModal, setProjectStage, clearFlag, redactItem, loadFlaggedComments,
} from '../store.js';
import { html, Icon, Avatar, HealthPill, Empty, AgeChip, ConfirmButton, navigate } from '../ui.js';
import { DecisionCard } from './decisions.js';
import {
  openDecisions, decidesFor, significant, visibleProjects, projectLine, STAGE,
} from '../model.js';
import { longDate } from '../util.js';

const RISE_ICON = { decision: 'decision', stuck: 'octagon', review: 'sparkle', commitment: 'swap', project: 'folder' };

function riseTitle(x) {
  if (x.d) return x.d.title;
  if (x.t) return x.t.title;
  if (x.c) return x.c.title;
  if (x.p) return x.p.name;
  return '';
}
function openRise(x) {
  if (x.d) openDecision(x.d.id);
  else if (x.t) openTask(x.t.id);
  else if (x.c) openModal('commitment', { id: x.c.id });
  else if (x.p) navigate('#/project/' + x.p.id);
}
// The person an item rose about: who decides, who owns the work, or who keeps the commitment.
function riseWho(x) {
  if (x.d) return person(x.d.assignee_id);
  if (x.t) return person(x.t.kind === 'claude' ? x.t.accountable_id : x.t.owner_id);
  if (x.c) return person(x.c.owner_id);
  if (x.p) return person(x.p.owner_id);
  return null;
}

export function RiseList({ items, empty, prefix = 'עלה כי ' }) {
  if (!items.length) return html`<p class="none">${empty}</p>`;
  return html`<ul class="rise">${items.map((x) => html`<li key=${x.key}>
    <button type="button" class=${'rise-row r-' + x.type} onClick=${() => openRise(x)}>
      <span class="rise-ic"><${Icon} name=${RISE_ICON[x.type] || 'alert'} size=${16} /></span>
      <span class="rise-main"><span class="rise-title">${riseTitle(x)}</span><span class="rise-why">${prefix}${x.why}</span></span>
      <span class="rise-side">${riseWho(x) ? html`<${Avatar} p=${riseWho(x)} size=${22} />` : null}<${AgeChip} at=${x.at} prefix="" /></span>
    </button></li>`)}</ul>`;
}

export function ProjectLines({ projects, actions }) {
  return html`<ul class="plines">${projects.map((p) => {
    const { text } = projectLine(p);
    const lead = person(p.owner_id);
    const stage = p.stage || 'active';
    return html`<li key=${p.id} class=${'pline st-' + stage}>
      <a class="pline-main" href=${'#/project/' + p.id}>
        <span class="pline-name"><i style=${`background:${p.color || 'var(--accent)'}`}></i>${p.name}</span>
        <span class="pline-text">${text}</span>
      </a>
      <span class="pline-side">
        ${stage === 'active' ? html`<${HealthPill} p=${p} />` : html`<span class=${'stage-chip s-' + stage}>${STAGE[stage].label}</span>`}
        ${lead ? html`<${Avatar} p=${lead} size=${22} title=${'מוביל: ' + lead.name} />` : null}
        ${actions && stage === 'proposed' ? html`<button type="button" class="btn btn-primary sm" onClick=${() => setProjectStage(p, 'open')}>לפתוח</button>` : null}
        ${actions && stage === 'active' ? html`<${ConfirmButton} label="לעצור" confirm="לעצור את הפרויקט?" cls="btn sm" onConfirm=${() => setProjectStage(p, 'stop')} />` : null}
        ${actions && stage === 'stopped' ? html`<${ConfirmButton} label="לפתוח מחדש" confirm="לפתוח מחדש?" cls="btn sm" onConfirm=${() => setProjectStage(p, 'open')} />` : null}
      </span>
    </li>`;
  })}</ul>`;
}

// Items marked as possibly classified wait here for command: keep (clear the mark) or remove from the tool.
function FlaggedReview({ s }) {
  const [comments, setComments] = useState([]);
  useEffect(() => { loadFlaggedComments().then(setComments); }, [s.lastSync]);
  const items = [
    ...s.decisions.filter((d) => d.flagged).map((d) => ({ kind: 'decision', id: d.id, what: 'החלטה', title: d.title, open: () => openDecision(d.id) })),
    ...s.tasks.filter((t) => t.flagged).map((t) => ({ kind: 'task', id: t.id, what: t.kind === 'claude' ? 'משימת Claude' : 'מטלה', title: t.title, open: () => openTask(t.id) })),
    ...s.commitments.filter((c) => c.flagged).map((c) => ({ kind: 'commitment', id: c.id, what: 'התחייבות', title: c.title, open: () => openModal('commitment', { id: c.id }) })),
    ...s.projects.filter((p) => p.flagged).map((p) => ({ kind: 'project', id: p.id, what: 'פרויקט', title: p.name, open: () => navigate('#/project/' + p.id) })),
    ...s.ideas.filter((i) => i.flagged).map((i) => ({ kind: 'idea', id: i.id, what: 'רעיון', title: i.title, open: () => navigate('#/weekly') })),
    ...comments.map((c) => ({ kind: 'comment', id: c.id, what: 'תגובה', title: c.body, open: () => c.task_id && openTask(c.task_id) })),
  ];
  if (!items.length) return null;
  return html`<section class="card flagged">
    <header class="card-head"><h2><${Icon} name="alert" size=${17} />לבדיקת הפיקוד</h2><span class="count">${items.length}</span></header>
    <p class="muted small">פריטים שסומנו כחשודים במידע מסווג. הם מוסתרים משאר הצוות עד שבודקים אותם.</p>
    <ul class="flag-list">${items.map((x) => html`<li key=${x.kind + x.id}>
      <button type="button" class="flag-main" onClick=${x.open}><span class="flag-chip">${x.what}</span><span class="flag-title">${x.title}</span></button>
      <span class="flag-actions">
        <button type="button" class="btn sm" onClick=${() => clearFlag(x.kind, x.id)}>תקין, להחזיר</button>
        <${ConfirmButton} label="הסרה מהכלי" confirm="להסיר לצמיתות?" cls="btn sm danger" onConfirm=${() => redactItem(x.kind, x.id)} />
      </span></li>`)}</ul>
  </section>`;
}

export function Command({ s }) {
  const my = s.auth?.me;
  const cmd = isCommand(s);
  const mine = openDecisions(s).filter((d) => decidesFor(d, my, s)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const rose = significant(s).filter((x) => !(x.type === 'decision' && decidesFor(x.d, my, s)));
  const order = { proposed: 0, active: 1, stopped: 2 };
  const health = { off_track: 0, at_risk: 1, on_track: 2 };
  const projects = visibleProjects(s).filter((p) => (p.stage || 'active') !== 'stopped')
    .sort((a, b) => order[a.stage || 'active'] - order[b.stage || 'active'] || (health[a.health] ?? 3) - (health[b.health] ?? 3));
  const stopped = visibleProjects(s).filter((p) => p.stage === 'stopped');
  return html`<div class="page command">
    <header class="page-head">
      <div><p class="eyebrow">${longDate()}</p><h1>המפקד בדקה</h1>
        <p class="sub">ההחלטות שמחכות לך, רק מה שעלה, ושורה אחת לכל פרויקט.</p></div>
      <div class="head-actions">
        <a class="btn" href="#/weekly"><${Icon} name="users" size=${16} />פגישה שבועית</a>
        <button type="button" class="btn" onClick=${() => openModal('report')}><${Icon} name="report" size=${16} />דוח שבועי</button>
      </div>
    </header>

    <section class="cmd-sec">
      <header class="section-head"><h2>מחכה להחלטה שלך</h2><span class="count">${mine.length}</span></header>
      ${mine.length ? html`<div class="qlist">${mine.map((d) => html`<${DecisionCard} key=${d.id} d=${d} />`)}</div>`
        : html`<${Empty} title="אין החלטות שמחכות לך" icon="check">כשמישהו יבקש החלטה ממך, למשל פתיחה או עצירה של פרויקט, היא תופיע כאן.<//>`}
    </section>

    <section class="cmd-sec">
      <header class="section-head"><h2>מה עלה</h2><span class="count">${rose.length}</span>
        <span class="muted small">רק מה שמחכה יותר משני ימי עבודה, באיחור מול גורם חיצוני, או בסיכון</span></header>
      <${RiseList} items=${rose} empty="שום דבר לא עלה. הכל זורם אצל המובילים." />
    </section>

    <section class="cmd-sec">
      <header class="section-head"><h2>הפרויקטים</h2><span class="count">${projects.length}</span></header>
      ${projects.length ? html`<${ProjectLines} projects=${projects} actions=${cmd} />` : html`<p class="none">אין פרויקטים פעילים.</p>`}
      ${stopped.length ? html`<details class="stopped"><summary>נעצרו (${stopped.length})</summary><${ProjectLines} projects=${stopped} actions=${cmd} /></details>` : null}
      ${!cmd ? html`<p class="muted small">פתיחה ועצירה של פרויקט הן החלטה של הפיקוד. אפשר לבקש עצירה מעמוד הפרויקט.</p>` : null}
    </section>

    ${cmd ? html`<${FlaggedReview} s=${s} />` : null}
  </div>`;
}
