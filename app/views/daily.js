// "דיילי": the five-minute morning stand-up, run in front of the screen (spec). What got done is already filled in and is
// read quietly; the time goes to blockers, decisions coming due and hand-offs. The facilitator rotates every week.
import { useEffect, useState } from 'preact/hooks';
import { visibleTasks, team, person, openTask } from '../store.js';
import { html, Icon, Avatar, StatusPill, DueButton, navigate } from '../ui.js';
import { RiseList } from './command.js';
import { answerer, isClaude, isAgent, canSee, openDecisions, since } from '../model.js';
import { byUrgency, today, longDate, weekStart, diffDays, workdaysUntil, dueLabel } from '../util.js';

// The team board, the daily and the blockers live together under "צוות".
export function TeamSwitch({ on }) {
  const opts = [{ id: 'team', label: 'לוח', icon: 'users' }, { id: 'daily', label: 'דיילי', icon: 'sun' }, { id: 'blockers', label: 'חסמים', icon: 'octagon' }];
  return html`<div class="seg" role="tablist" aria-label="תצוגות הצוות">
    ${opts.map((o) => html`<button type="button" role="tab" key=${o.id} aria-selected=${on === o.id ? 'true' : 'false'} class=${on === o.id ? 'on' : ''}
      onClick=${() => navigate('#/' + o.id)}><${Icon} name=${o.icon} size=${16} />${o.label}</button>`)}
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

// The facilitator changes every week, in team order.
export function facilitator(people) {
  if (!people.length) return null;
  const weeks = Math.floor(diffDays('2026-01-04', weekStart()) / 7);
  return people[((weeks % people.length) + people.length) % people.length];
}

export function dailyFor(p, tasks, from = lastWorkdayStart()) {
  const td = today();
  const mine = tasks.filter((t) => answerer(t) === p.id);
  const open = mine.filter((t) => t.status !== 'done');
  return {
    done: mine.filter((t) => t.status === 'done' && t.done_at && new Date(t.done_at) >= from),
    today: open.filter((t) => t.status !== 'blocked' && t.status !== 'waiting' && (t.status === 'in_progress' || t.status === 'review' || t.focus || (t.due && t.due <= td))).sort(byUrgency),
    stuck: open.filter((t) => t.status === 'blocked' || t.status === 'waiting').sort(byUrgency),
    waitingOn: tasks.filter((t) => t.status !== 'done' && t.blocked_by_person === p.id && t.owner_id !== p.id),
  };
}

function Item({ t, owner }) {
  return html`<li><div class=${'ditem' + (t.status === 'done' ? ' is-done' : '')} role="button" tabindex="0" onClick=${() => openTask(t.id)}
    onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
    <${StatusPill} t=${t} size="sm" />
    <span class="ditem-title">${isClaude(t) ? html`<span class="claude-inline"><${Icon} name="sparkle" size=${12} />Claude</span>` : null}${t.title}${t.blocked_reason && t.status !== 'done' ? html`<span class="ditem-reason">${t.blocked_reason}</span>` : null}</span>
    ${owner ? html`<span class="ditem-owner"><${Avatar} p=${person(t.owner_id)} size=${20} />${person(t.owner_id)?.name || ''}</span>` : null}
    ${t.status !== 'done' && t.due ? html`<${DueButton} t=${t} />` : null}
  </div></li>`;
}

function Part({ title, icon, tone, items, empty, owner, max = 6 }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, max);
  return html`<div class=${'dpart ' + tone}>
    <h3><${Icon} name=${icon} size=${15} />${title}</h3>
    ${items.length ? html`<ul class="dlist">${shown.map((t) => html`<${Item} key=${t.id} t=${t} owner=${owner} />`)}</ul>`
      : html`<p class="dempty">${empty}</p>`}
    ${items.length > max && !all ? html`<button type="button" class="link sm" onClick=${() => setAll(true)}>להציג הכל</button>` : null}
  </div>`;
}

function PersonCard({ p, d, big }) {
  return html`<section class=${'dcard' + (big ? ' big' : '')}>
    <header class="dcard-head">
      <${Avatar} p=${p} size=${big ? 44 : 34} />
      <div class="dcard-who"><strong>${p.name}</strong><span class="muted">${p.role || ''}</span></div>
      <a class="link sm" href=${'#/home/' + p.id}>מה מחכה</a>
    </header>
    <div class="dparts">
      <${Part} title="מה הושלם" icon="check" tone="t-done" items=${d.done} empty="עוד לא סומן כלום כהושלם" />
      <${Part} title="מה היום" icon="sun" tone="t-today" items=${d.today} empty="אין עבודה בתהליך או להיום" />
      <${Part} title="מה תקוע" icon="octagon" tone="t-stuck" items=${d.stuck} empty="שום דבר לא תקוע" />
    </div>
    ${d.waitingOn.length ? html`<div class="dwait">
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

// What the stand-up talks about: decisions due within a workday, and everything stuck.
function talkItems(s, tasks) {
  const out = [];
  openDecisions(s).filter((d) => d.due && workdaysUntil(d.due) <= 1).forEach((d) => out.push({
    type: 'decision', key: 'd' + d.id, d, at: d.created_at, why: d.due < today() ? 'עבר המועד להחלטה' : `צריך להחליט ${dueLabel(d.due)}`,
  }));
  tasks.filter((t) => t.status === 'blocked' || t.status === 'waiting').forEach((t) => {
    const by = person(t.blocked_by_person);
    out.push({ type: 'stuck', key: 's' + t.id, t, at: since(t, ['blocked', 'waiting'], s), why: by ? `מחכה ל${by.name}` : t.blocked_reason || 'תקוע, בלי סיבה' });
  });
  return out.sort((a, b) => new Date(a.at) - new Date(b.at));
}

export function Daily({ s }) {
  const people = team().filter((p) => !isAgent(p));
  const tasks = visibleTasks(s).filter((t) => canSee(t, s));
  const from = lastWorkdayStart();
  const data = people.map((p) => ({ p, d: dailyFor(p, tasks, from) }));
  const [turn, setTurn] = useState(null); // index of the person speaking, or null for the overview grid
  const lead = facilitator(people);
  const talk = talkItems(s, tasks.filter((t) => t.status !== 'done'));
  const fromLabel = from.getDay() === 4 && new Date().getDay() !== 5 ? 'מיום חמישי' : 'מאתמול';

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
        <p class="sub">5 דקות בבוקר. מה הושלם ${fromLabel} כבר כתוב, אז קוראים בשקט ומדברים על החסמים, על ההחלטות שמגיע מועדן ועל העברות.</p>
        ${lead ? html`<p class="facilitator"><${Avatar} p=${lead} size=${20} />מנחה השבוע: <b>${lead.name}</b><span class="muted small"> · בהיעדרות כותבים שורה עד 10:00</span></p>` : null}</div>
      <div class="head-actions">
        <${TeamSwitch} on="daily" />
        <button type="button" class="btn btn-primary" onClick=${() => setTurn(0)} disabled=${!data.length}><${Icon} name="play" size=${16} />התחלת דיילי</button>
      </div>
    </header>
    <section class="card talk">
      <header class="card-head"><h2>לדבר עליו היום</h2></header>
      <${RiseList} items=${talk} prefix="" empty="אין חסמים ואין החלטות שמגיע מועדן. אפשר לסיים מהר." />
    </section>
    <div class="dgrid">${data.map(({ p, d }) => html`<${PersonCard} key=${p.id} p=${p} d=${d} />`)}</div>
  </div>`;
}
