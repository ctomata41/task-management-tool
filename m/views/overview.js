// The commander's picture: first only what needs the commander (four kinds, each with its reason), then one fixed line
// per project read off its ID card, then the load on each person. Nothing here asks anyone for a report.
import { html, Icon, Avatar, Pill, Classified, Health, StageStrip, Empty, ago, dueWord } from '../ui.js';
import { useStore, teamProjects, commanderQueue, isCommander, person, project, team, openSheet, approveGate, getState } from '../store.js';
import { status, HILL, cardFill } from '../card.js';
import { dayDiff } from '../ui.js';

const KIND = {
  gate: { icon: 'shield', color: 'var(--s-waiting)' },
  senior: { icon: 'flag', color: 'var(--h-off)' },
  late: { icon: 'clock', color: 'var(--h-risk)' },
  commit: { icon: 'send', color: 'var(--h-off)' },
};

export function Overview() {
  const s = useStore();
  const cmd = isCommander();
  const queue = cmd ? commanderQueue() : [];
  const projects = teamProjects().filter((p) => p.phase !== 'stopped' && p.phase !== 'done');
  const counts = { on: 0, risk: 0, stuck: 0 };
  projects.forEach((p) => { const h = status(p).health; if (counts[h] !== undefined) counts[h]++; });
  const byProject = queue.reduce((m, q) => { (m[q.project] = m[q.project] || []).push(q); return m; }, {});
  return html`<div class="page">
    <header class="page-head2"><div><h1>תמונת מצב</h1>
      <p class="sub">${projects.length} פרויקטים פעילים · <b class="ok-t">${counts.on} במסלול</b>${counts.risk ? html` · <b class="warn-t">${counts.risk} בסיכון</b>` : null}${counts.stuck ? html` · <b class="bad-t">${counts.stuck} תקועים</b>` : null}</p></div></header>

    ${cmd ? html`<section class="sec">
      <div class="sec-head"><h2>צריך אותך</h2><span class="muted small">רק מה שרק את/ה יכול/ה לפתור. השאר אצל מנהלי הפרויקטים</span></div>
      ${queue.length ? Object.entries(byProject).map(([pid, items]) => html`<div class="qcard2" key=${pid} style=${`--bar:${project(pid).color}`}>
        <a class="qc-proj" href=${`#/project/${pid}`}><strong>${project(pid).name}</strong><${Classified} p=${project(pid)} small /><span class="muted small">${person(project(pid).manager).name}</span><${Icon} name="chevronLeft" size=${16} /></a>
        ${items.map((q) => html`<${QueueRow} q=${q} />`)}
      </div>`) : html`<${Empty}>אין כרגע שום דבר שמחכה לך. הפרויקטים מתנהלים בלעדייך.</${Empty}>`}
    </section>` : null}

    <section class="sec">
      <div class="sec-head"><h2>כל הפרויקטים</h2><span class="muted small">נקרא מתעודת הזהות של כל פרויקט</span></div>
      ${projects.length ? html`<div class="group ov-list">${projects.map((p) => html`<${ProjectLine} key=${p.id} p=${p} />`)}</div>` : html`<${Empty} icon="layers">אין פרויקטים פעילים.</${Empty}>`}
    </section>

    ${cmd ? html`<section class="sec">
      <div class="sec-head"><h2>הצוות</h2><span class="muted small">משימות פתוחות לכל אחד ואחת</span></div>
      <div class="load-grid">${team().map((x) => html`<${Load} key=${x.id} id=${x.id} />`)}</div>
    </section>` : null}
  </div>`;
}

function QueueRow({ q }) {
  const k = KIND[q.kind];
  const acts = {
    gate: html`<button type="button" class="btn btn-primary sm" onClick=${() => approveGate(q.project)}>לאשר</button>
      <button type="button" class="btn sm" onClick=${() => openSheet('return', { id: q.project })}>להחזיר עם הכוונה</button>`,
    senior: html`<button type="button" class="btn btn-primary sm" onClick=${() => openSheet('resolve', { id: q.project })}>טיפלתי</button>`,
    late: html`<button type="button" class="btn sm" onClick=${() => openSheet('direct', { id: q.project })}>להוריד משימה</button>`,
    commit: q.task ? html`<button type="button" class="btn sm" onClick=${() => openSheet('task', { id: q.task })}>לפתוח</button>` : null,
  }[q.kind];
  return html`<div class="qrow">
    <span class="q-ic" style=${`--c:${k.color}`}><${Icon} name=${k.icon} size=${16} /></span>
    <div class="grow"><div class="q-why">${q.why}${q.by ? html` <span class="muted">· עד ${dueWord(q.by)}</span>` : null}</div><div>${q.text}</div></div>
    <div class="q-acts">${acts}</div>
  </div>`;
}

function ProjectLine({ p }) {
  const st = status(p);
  const fill = cardFill(p);
  return html`<a class="ov-line" href=${`#/project/${p.id}`} style=${`--bar:${p.color}`}>
    <div class="ovl-name"><strong>${p.name}</strong><span class="ovl-sub"><${Avatar} id=${p.manager} size=${18} /><span class="muted small">${person(p.manager).name}</span><${Classified} p=${p} small /></span></div>
    <div class="ovl-stage"><${StageStrip} p=${p} /><span class="small">${st.where}${st.pending ? html` · <b class="wait-t">מחכה לאישור</b>` : null}</span></div>
    <div class="ovl-state"><${Health} p=${p} /><span class="muted small"><${Icon} name="hill" size=${12} /> ${HILL[p.hill || 'up'].short}</span></div>
    <div class="ovl-meta"><span class=${'small' + (st.stale ? ' bad-t' : ' muted')}>${st.stale ? 'לא עודכן ' : 'עודכן '}${ago(p.lastUpdate)}</span><span class="muted small">${fill.done}/${fill.of} בתעודה</span></div>
  </a>`;
}

function Load({ id }) {
  const s = getState();
  const open = s.tasks.filter((t) => t.owner === id && !t.personal && t.status !== 'done');
  const late = open.filter((t) => t.due && dayDiff(t.due) < 0).length;
  const stuck = open.filter((t) => t.status === 'stuck').length;
  const lead = teamProjects().filter((p) => p.manager === id && p.phase !== 'stopped' && p.phase !== 'done').length;
  return html`<div class="load2"><${Avatar} id=${id} size=${34} /><div class="grow"><strong>${person(id).name}</strong>
    <span class="muted small">${open.length} פתוחות${lead ? ` · מוביל/ה ${lead}` : ''}</span></div>
    ${late ? html`<${Pill} color="var(--h-off)">${late} באיחור</${Pill}>` : null}${stuck ? html`<${Pill} color="var(--h-risk)">${stuck} תקועות</${Pill}>` : null}</div>`;
}
