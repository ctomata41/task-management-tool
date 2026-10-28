// מצב: first only what needs the commander (the kinds in card.KIND_ORDER, each with its reason, then by the project's
// place), then the order of the team's projects: one fixed line each, read off its ID card, with the asks the
// commander sent under it. The deputy reads all of it without acting on it; the team reads the order and the asks.
// Nothing here asks anyone for a report.
import { useState, useRef } from 'preact/hooks';
import { html, Icon, Avatar, Classified, Health, StageStrip, Empty, ProjectTag, RankCap, AskPill, useFlip, ago, dueWord } from '../ui.js';
import { useStore, orderedProjects, commanderQueue, isCommander, isCommand, commander, person, project, me, openSheet, approveGate, talked,
  projectAsks, orderStamp, leads, canSeeDetail } from '../store.js';
import { status, HILL, cardFill, inOrder } from '../card.js';

const KIND = {
  gate: { icon: 'shield', color: 'var(--s-waiting)' },
  senior: { icon: 'flag', color: 'var(--h-off)' },
  late: { icon: 'clock', color: 'var(--h-risk)' },
  commit: { icon: 'send', color: 'var(--h-off)' },
  talk: { icon: 'message', color: 'var(--s-waiting)' },
  asklate: { icon: 'clock', color: 'var(--h-off)' },
};

// Who set the order and when, for the line under its title here and on the portfolio.
export function orderLine() {
  const st = orderStamp();
  return st ? `נקבע ע״י ${person(st.by).name} · עודכן ${ago(st.at)}` : 'עוד לא נקבע סדר';
}

export function Overview() {
  useStore();
  const cmd = isCommander();
  const boss = commander();
  // The deputy sees the commander's queue as it is, with nothing to press.
  const queue = isCommand() ? commanderQueue() : [];
  const projects = orderedProjects();
  const ext = me().role === 'external';
  const counts = { on: 0, risk: 0, stuck: 0 };
  projects.forEach((p) => { const h = status(p).health; if (counts[h] !== undefined) counts[h]++; });
  return html`<div class="page">
    <header class="page-head2"><div><h1>תמונת מצב</h1>
      <p class="sub">${projects.length} פרויקטים פעילים · <b class="ok-t">${counts.on} במסלול</b>${counts.risk ? html` · <b class="warn-t">${counts.risk} בסיכון</b>` : null}${counts.stuck ? html` · <b class="bad-t">${counts.stuck} תקועים</b>` : null}</p></div></header>

    ${isCommand() ? html`<section class="sec">
      <div class="sec-head"><h2>${cmd ? 'צריך אותך' : `מחכה ל${boss.name}`}</h2><span class="muted small">${cmd ? 'רק מה שרק את/ה יכול/ה לפתור. השאר אצל מנהלי הפרויקטים' : `לקריאה בלבד. ההחלטות אצל ${boss.name}`}</span></div>
      ${queue.length ? html`<${Queue} queue=${queue} act=${cmd} />`
        : html`<${Empty}>${cmd ? 'אין כרגע שום דבר שמחכה לך. הכול אצל מנהלי הפרויקטים.' : `אין כרגע שום דבר שמחכה ל${boss.name}.`}</${Empty}>`}
    </section>` : null}

    <section class="sec">
      <div class="sec-head"><h2>${ext ? 'הפרויקטים שלי' : 'סדר העדיפויות'}</h2><span class="muted small">${ext ? 'נקרא מתעודת הזהות של כל פרויקט' : orderLine()}</span></div>
      ${projects.length ? html`<${Order} projects=${projects} ext=${ext} />` : html`<${Empty} icon="layers">אין פרויקטים פעילים.</${Empty}>`}
    </section>
  </div>`;
}

// Three rows, then the rest behind "ועוד N", so the most pressing ones fit on one screen.
function Queue({ queue, act }) {
  const [all, setAll] = useState(false);
  const more = queue.length - 3;
  return html`<div class="group">
    ${(all ? queue : queue.slice(0, 3)).map((q) => html`<${QueueRow} key=${`${q.kind}:${q.project}:${q.task || q.stage || ''}`} q=${q} act=${act} />`)}
    ${more > 0 ? html`<button type="button" class="q-more" aria-expanded=${all} onClick=${() => setAll(!all)}>${all ? 'להציג פחות' : `ועוד ${more}`}</button>` : null}
  </div>`;
}

function QueueRow({ q, act }) {
  const k = KIND[q.kind];
  const p = project(q.project);
  const mgr = person(p.manager);
  const acts = act ? {
    gate: html`<button type="button" class="btn btn-primary sm" onClick=${() => approveGate(q.project)}>לאשר</button>
      <button type="button" class="btn sm" onClick=${() => openSheet('return', { id: q.project })}>להחזיר עם הכוונה</button>`,
    senior: html`<button type="button" class="btn btn-primary sm" onClick=${() => openSheet('resolve', { id: q.project })}>טיפלתי</button>`,
    late: leads(p) ? null : html`<button type="button" class="btn sm" onClick=${() => openSheet('ask', { id: q.project })}>בקשה ל${mgr.name}</button>`,
    commit: q.task ? html`<button type="button" class="btn sm" onClick=${() => openSheet('task', { id: q.task })}>לפתוח</button>` : null,
    talk: html`<button type="button" class="btn btn-primary sm" onClick=${() => talked(q.task)}>דיברנו</button>`,
    asklate: html`<button type="button" class="btn sm" onClick=${() => openSheet('task', { id: q.task })}>לפתוח</button>`,
  }[q.kind] : null;
  return html`<div class="qrow">
    <span class="q-ic" style=${`--c:${k.color}`}><${Icon} name=${k.icon} size=${16} /></span>
    <div class="grow"><div class="q-why">${q.why}${q.by ? html` <span class="muted">· עד ${dueWord(q.by)}</span>` : null}</div><div>${q.text}</div>
      <div class="q-proj"><${ProjectTag} id=${p.id} /><${Classified} p=${p} small /><span class="muted small">${mgr.name}</span></div></div>
    ${acts ? html`<div class="q-acts">${acts}</div>` : null}
  </div>`;
}

// The order moves on a spring when the commander gives a project a new place (useFlip).
function Order({ projects, ext }) {
  const ref = useRef();
  useFlip(ref);
  return html`<div class="group ov-list" ref=${ref}>${projects.map((p) => html`<${ProjectLine} key=${p.id} p=${p} ext=${ext} />`)}</div>`;
}

// The project's one line as a stretched link to its page; its place, its asks and the commander's + sit above the link.
function ProjectLine({ p, ext }) {
  const st = status(p);
  const open = canSeeDetail(p); // a restricted project shows those outside it no more than this line
  const fill = cardFill(p);
  const asks = projectAsks(p.id);
  const ask = isCommander() && !leads(p);
  const mgr = person(p.manager);
  return html`<div class=${'ov-line' + (ext ? '' : ' capped') + (ask ? ' can-ask' : '')} style=${`--bar:${p.color}`}>
    <div class="ovl-name">
      ${ext ? null : inOrder(p) ? html`<${RankCap} p=${p} />` : html`<span class="cap-gap" aria-hidden="true"></span>`}
      <div class="ovl-id"><a class="ovl-link" href=${`#/project/${p.id}`}><strong>${p.name}</strong></a>
        <span class="ovl-sub"><${Avatar} id=${p.manager} size=${18} /><span class="muted small">${mgr.name}</span><${Classified} p=${p} small /></span></div>
    </div>
    <div class="ovl-stage"><${StageStrip} p=${p} /><span class="small">${st.where}${st.pending ? html` · <b class="wait-t">מחכה לאישור</b>` : null}</span></div>
    <div class="ovl-state"><${Health} p=${p} /><span class="muted small"><${Icon} name="hill" size=${12} /> ${HILL[p.hill || 'up'].short}</span></div>
    <div class="ovl-meta"><span class=${'small' + (st.stale ? ' bad-t' : ' muted')}>${st.stale ? 'לא עודכן ' : 'עודכן '}${ago(p.lastUpdate)}</span>${open ? html`<span class="muted small">${fill.done}/${fill.of} בתעודה</span>` : null}</div>
    ${ask ? html`<button type="button" class="ov-add" aria-label=${`בקשה חדשה ל${mgr.name}`} title=${`בקשה ל${mgr.name}`} onClick=${() => openSheet('ask', { id: p.id })}><${Icon} name="plus" size=${16} /></button>` : null}
    ${asks.length ? html`<div class="ovl-asks">${asks.map((t) => html`<button type="button" class="ov-ask" key=${t.id} onClick=${() => openSheet('task', { id: t.id })}>
      <${AskPill} t=${t} /><span class="ov-ask-t">${t.title}</span></button>`)}</div>` : null}
  </div>`;
}
