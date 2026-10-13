// "דיילי": the five-minute morning stand-up, run in front of the screen.
// One card per team member: what got done since the last workday, what is on today, and what is stuck.
import { useEffect, useState } from 'preact/hooks';
import { visibleTasks, team, person, openTask } from '../store.js';
import { html, Icon, Avatar, StatusPill, DueButton, navigate } from '../ui.js';
import { byUrgency, isOverdue, today, longDate } from '../util.js';

// Switch between the team board and the daily view (both live under the "צוות" tab on phones).
export function TeamSwitch({ on }) {
  return html`<div class="seg" role="tablist">
    <button type="button" role="tab" aria-selected=${on === 'team' ? 'true' : 'false'} class=${on === 'team' ? 'on' : ''} onClick=${() => navigate('#/team')}><${Icon} name="users" size=${16} />לוח</button>
    <button type="button" role="tab" aria-selected=${on === 'daily' ? 'true' : 'false'} class=${on === 'daily' ? 'on' : ''} onClick=${() => navigate('#/daily')}><${Icon} name="sun" size=${16} />דיילי</button>
  </div>`;
}

// Israeli work week: on Sunday (and Saturday) the previous workday is Thursday.
function lastWorkdayStart() {
  const d = new Date();
  const back = d.getDay() === 0 ? 3 : d.getDay() === 6 ? 2 : 1;
  d.setDate(d.getDate() - back);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dailyFor(p, tasks, since = lastWorkdayStart()) {
  const td = today();
  const mine = tasks.filter((t) => t.owner_id === p.id);
  const open = mine.filter((t) => t.status !== 'done');
  return {
    done: mine.filter((t) => t.status === 'done' && t.done_at && new Date(t.done_at) >= since),
    today: open.filter((t) => t.status !== 'blocked' && t.status !== 'waiting' && (t.status === 'in_progress' || t.focus || (t.due && t.due <= td))).sort(byUrgency),
    stuck: open.filter((t) => t.status === 'blocked' || t.status === 'waiting').sort(byUrgency),
    waitingOn: tasks.filter((t) => t.status !== 'done' && t.blocked_by_person === p.id && t.owner_id !== p.id),
  };
}

function Item({ t, owner }) {
  return html`<li><div class=${'ditem' + (t.status === 'done' ? ' is-done' : '')} role="button" tabindex="0" onClick=${() => openTask(t.id)}
    onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
    <${StatusPill} t=${t} size="sm" />
    <span class="ditem-title">${t.title}${t.blocked_reason && t.status !== 'done' ? html`<span class="ditem-reason">${t.blocked_reason}</span>` : null}</span>
    ${owner ? html`<span class="ditem-owner"><${Avatar} p=${person(t.owner_id)} size=${20} />${person(t.owner_id)?.name || ''}</span>` : null}
    ${t.status !== 'done' && t.due ? html`<${DueButton} t=${t} />` : null}
  </div></li>`;
}

function Part({ title, icon, tone, items, empty, owner, max = 6 }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, max);
  return html`<div class=${'dpart ' + tone}>
    <h3><${Icon} name=${icon} size=${15} />${title}<span class="count">${items.length}</span></h3>
    ${items.length ? html`<ul class="dlist">${shown.map((t) => html`<${Item} key=${t.id} t=${t} owner=${owner} />`)}</ul>`
      : html`<p class="dempty">${empty}</p>`}
    ${items.length > max && !all ? html`<button type="button" class="link sm" onClick=${() => setAll(true)}>עוד ${items.length - max}</button>` : null}
  </div>`;
}

function PersonCard({ p, d, big }) {
  const late = d.today.filter(isOverdue).length;
  return html`<section class=${'dcard' + (big ? ' big' : '')}>
    <header class="dcard-head">
      <${Avatar} p=${p} size=${big ? 44 : 34} />
      <div class="dcard-who"><strong>${p.name}</strong><span class="muted">${p.role || ''}</span></div>
      <div class="dcard-sum">
        ${late ? html`<span class="badge bad">${late} באיחור</span>` : null}
        ${d.stuck.length ? html`<span class="badge warn">${d.stuck.length} תקועות</span>` : null}
      </div>
    </header>
    <div class="dparts">
      <${Part} title="מה הושלם" icon="check" tone="t-done" items=${d.done} empty="עוד לא סומן כלום כהושלם" />
      <${Part} title="מה היום" icon="sun" tone="t-today" items=${d.today} empty="אין משימות בתהליך או להיום" />
      <${Part} title="מה תקוע" icon="octagon" tone="t-stuck" items=${d.stuck} empty="שום דבר לא תקוע" />
    </div>
    ${d.waitingOn.length ? html`<div class="dwait"><${Icon} name="clock" size=${15} />
      <span>מחכים ל${p.name}:</span>
      <ul class="dlist">${d.waitingOn.map((t) => html`<${Item} key=${t.id} t=${t} owner />`)}</ul></div>` : null}
  </section>`;
}

function Timer({ k }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    setSec(0);
    const id = setInterval(() => setSec((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [k]);
  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, '0');
  return html`<span class=${'dtimer' + (sec >= 75 ? ' over' : '')} title="דקה ורבע לכל אחד">${mm}:${ss}</span>`;
}

export function Daily({ s }) {
  const people = team();
  const tasks = visibleTasks(s);
  const since = lastWorkdayStart();
  const data = people.map((p) => ({ p, d: dailyFor(p, tasks, since) }));
  const [turn, setTurn] = useState(null); // index of the person speaking, or null for the overview grid
  const totals = data.reduce((a, { d }) => ({ done: a.done + d.done.length, today: a.today + d.today.length, stuck: a.stuck + d.stuck.length }), { done: 0, today: 0, stuck: 0 });
  const sinceLabel = since.getDay() === 4 && new Date().getDay() !== 5 ? 'מיום חמישי' : 'מאתמול';

  if (turn !== null && data[turn]) {
    const { p, d } = data[turn];
    return html`<div class="page daily">
      <header class="page-head">
        <div><p class="eyebrow">דיילי · ${turn + 1} מתוך ${data.length}</p><h1>${p.name}</h1></div>
        <div class="daily-ctl">
          <${Timer} k=${turn} />
          <button type="button" class="btn" disabled=${turn === 0} onClick=${() => setTurn(turn - 1)}><${Icon} name="chevronRight" size=${16} />הקודם</button>
          ${turn < data.length - 1
            ? html`<button type="button" class="btn btn-primary" onClick=${() => setTurn(turn + 1)}>הבא: ${data[turn + 1].p.name}<${Icon} name="chevronLeft" size=${16} /></button>`
            : html`<button type="button" class="btn btn-primary" onClick=${() => setTurn(null)}><${Icon} name="check" size=${16} />סיום</button>`}
        </div>
      </header>
      <${PersonCard} p=${p} d=${d} big />
    </div>`;
  }

  return html`<div class="page daily">
    <header class="page-head">
      <div><p class="eyebrow">${longDate()}</p><h1>דיילי</h1>
        <p class="sub">5 דקות בבוקר: מה הושלם ${sinceLabel}, מה היום ומה תקוע. לוחצים על משימה כדי לעדכן אותה תוך כדי.</p></div>
      <div class="head-actions">
        <${TeamSwitch} on="daily" />
        <button type="button" class="btn btn-primary" onClick=${() => setTurn(0)} disabled=${!data.length}><${Icon} name="play" size=${16} />התחלת דיילי</button>
      </div>
    </header>
    <div class="daily-sum">
      <span><b>${totals.done}</b> הושלמו ${sinceLabel}</span>
      <span><b>${totals.today}</b> על השולחן היום</span>
      <span class=${totals.stuck ? 'warn' : ''}><b>${totals.stuck}</b> תקועות</span>
    </div>
    <div class="dgrid">${data.map(({ p, d }) => html`<${PersonCard} key=${p.id} p=${p} d=${d} />`)}</div>
  </div>`;
}
