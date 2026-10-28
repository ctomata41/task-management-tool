// "יומן": my week, and a Gantt of the projects I run. The week holds my tasks by their deadline, the targets of stages
// in my projects, the meetings recorded there and, once connected, my own Google Calendar: seven columns on desktop,
// a list of days on a phone. The Gantt shows only the projects the person manages (the commander sees every team
// project), each stage a capsule in time; tapping one sets its target.
import { useState, useEffect, useRef } from 'preact/hooks';
import { html, Icon, Seg, Empty, ProjectTag, isoDay, dueWord, dateInput } from '../ui.js';
import { useStore, myTasks, teamProjects, personalProjects, project, canManage, isCommander, isOpen, openSheet, closeSheet, setStage,
  STATUS, PRIORITY_ORDER } from '../store.js';
import { schedule, dayStart, addDays, plausibleDay, STAGE_DAYS, DAY } from '../card.js';
import { useGcal, GcalCard, GcalChip } from '../gcal.js';

const VIEW_KEY = 'm.cal.view';
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const dm = (t) => { const d = new Date(t); return `${d.getDate()}/${d.getMonth() + 1}`; };
const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function useNarrow() {
  const q = '(max-width: 900px)';
  const [narrow, setNarrow] = useState(() => matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q); const f = () => setNarrow(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return narrow;
}

export function Calendar() {
  useStore();
  const [view, setViewRaw] = useState(() => { try { return localStorage.getItem(VIEW_KEY) || 'week'; } catch (e) { return 'week'; } });
  const setView = (v) => { setViewRaw(v); try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* storage blocked */ } };
  return html`<div class="page mcal">
    <header class="page-head2 mcal-head"><h1>יומן</h1>
      <${Seg} label="תצוגה" value=${view} onChange=${setView} cls="cal-seg" options=${[{ id: 'week', label: 'השבוע שלי' }, { id: 'gantt', label: 'גאנט' }]} /></header>
    ${view === 'gantt' ? html`<${Gantt} />` : html`<${Week} />`}
  </div>`;
}

// ---------- the week ----------
function Week() {
  const s = useStore();
  const [offset, setOffset] = useState(0);
  const today = dayStart(Date.now());
  const sunday = addDays(today, -new Date(today).getDay() + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
  const gc = useGcal(isoDay(new Date(days[0])), isoDay(new Date(days[6])));
  const a = new Date(days[0]);
  const b = new Date(days[6]);
  const label = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ב${MONTHS[a.getMonth()]}` : `${a.getDate()} ב${MONTHS[a.getMonth()]} – ${b.getDate()} ב${MONTHS[b.getMonth()]}`;
  return html`<div class="wk">
    <div class="wk-head">
      <button type="button" class="icon-btn" aria-label="השבוע הקודם" onClick=${() => setOffset(offset - 1)}><${Icon} name="chevronRight" /></button>
      <h2>${label}</h2>
      <button type="button" class="icon-btn" aria-label="השבוע הבא" onClick=${() => setOffset(offset + 1)}><${Icon} name="chevronLeft" /></button>
      ${offset ? html`<button type="button" class="btn sm" onClick=${() => setOffset(0)}>חזרה להשבוע</button>` : null}
      <span class="grow"></span>
      <${GcalChip} gc=${gc} />
    </div>
    ${gc.state !== 'on' ? html`<${GcalCard} gc=${gc} />` : null}
    <div class="wk-grid">${days.map((t) => html`<${Day} key=${t} t=${t} today=${today} items=${dayItems(s, t, gc.events)} />`)}</div>
  </div>`;
}

function dayItems(s, t, events) {
  const key = isoDay(new Date(t));
  const out = [];
  for (const e of events) if (e.day === key) out.push({ kind: 'event', key: `e${e.id}`, time: e.time || '', title: e.title, link: e.link, rank: `0${e.allDay ? '00:00' : e.time}` });
  // My projects: the ones I run or am a partner in (the commander: every team project). Their meetings, and mine.
  const mine = [...teamProjects(), ...personalProjects()].filter((p) => p.manager === s.me || p.partners.includes(s.me) || (isCommander() && !p.personal));
  for (const m of s.meetings) {
    if (isoDay(new Date(m.at)) !== key || !(m.by === s.me || mine.some((p) => p.id === m.project))) continue;
    out.push({ kind: 'meeting', key: `m${m.id}`, time: hhmm(m.at), title: m.title, output: m.output, p: project(m.project), rank: `0${hhmm(m.at)}` });
  }
  // Stage targets only while a project runs: a stopped or finished project's target is no longer anyone's date.
  for (const p of mine.filter(isOpen)) {
    for (const st of p.stages) {
      if (st.target && st.target.slice(0, 10) === key && st.state !== 'done' && st.state !== 'skipped') out.push({ kind: 'target', key: `s${st.id}`, title: st.name, p, rank: '1' });
    }
  }
  for (const x of myTasks()) {
    if (!x.due || x.due.slice(0, 10) !== key) continue;
    const r = x.status === 'done' ? 9 : x.priority ? PRIORITY_ORDER.indexOf(x.priority) : 5;
    out.push({ kind: 'task', key: `t${x.id}`, title: x.title, t: x, p: project(x.project), rank: `2${r}` });
  }
  return out.sort((x, y) => x.rank.localeCompare(y.rank));
}

function Day({ t, today, items }) {
  const d = new Date(t);
  const n = Math.round((t - today) / DAY);
  return html`<section class=${'wk-day' + (n === 0 ? ' is-today' : n < 0 ? ' past' : '')} aria-label=${`יום ${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`}>
    <header class="wk-dh">
      <span class="wk-dn"><span class="wide-only">${SHORT[d.getDay()]}</span><span class="m-only">יום ${DAYS[d.getDay()]}</span></span>
      <b class="wk-dd"><span class="wide-only">${d.getDate()}</span><span class="m-only">${d.getDate()}/${d.getMonth() + 1}</span></b>
      ${n === 0 ? html`<span class="wk-now">היום</span>` : null}
    </header>
    ${items.length ? html`<div class="wk-items">${items.map((it) => html`<${Item} key=${it.key} it=${it} />`)}</div>`
      : html`<div class="wk-none"><span aria-hidden="true">—</span><span class="sr">אין כלום</span></div>`}
  </section>`;
}

function Item({ it }) {
  if (it.kind === 'event') {
    const inner = html`<span class="ci-time">${it.time || 'כל היום'}</span><span class="ci-title">${it.title}</span>`;
    return it.link ? html`<a class="ci k-event" href=${it.link} target="_blank" rel="noopener">${inner}</a>` : html`<div class="ci k-event">${inner}</div>`;
  }
  if (it.kind === 'meeting') {
    return html`<button type="button" class="ci k-meet" style=${it.p ? `--c:${it.p.color}` : ''} onClick=${() => it.output && openSheet('output', { id: it.output })}>
      <span class="ci-time"><${Icon} name="mic" size=${12} />${it.time}</span><span class="ci-title">${it.title}</span></button>`;
  }
  if (it.kind === 'target') {
    return html`<a class="ci k-target" style=${`--c:${it.p.color}`} href=${`#/project/${it.p.id}`}>
      <span class="ci-time"><${Icon} name="flag" size=${12} />יעד שלב</span><span class="ci-title">${it.title} · ${it.p.name}</span></a>`;
  }
  // The status in words: a tinted capsule once the task has started, and always at the start of the button's name.
  const t = it.t;
  const st = STATUS[t.status];
  return html`<button type="button" class=${'ci k-task' + (t.status === 'done' ? ' is-done' : '')} style=${`--c:${it.p ? it.p.color : 'var(--fg-3)'}`} onClick=${() => openSheet('task', { id: t.id })}>
    <span class="sr">${st.label}: </span>${t.status === 'todo' ? null : html`<span class="spill ci-st" style=${`--c:${st.color}`} aria-hidden="true">${st.label}</span>`}<span class="ci-title">${t.title}</span></button>`;
}

// ---------- the Gantt ----------
const STATE_WORD = { done: 'נסגר', skipped: 'דילגנו', active: 'עכשיו', pending: 'מחכה לאישור', todo: 'בהמשך' };
// The day a stage's words end on: the day it closed, else the target people set, else the bar's own end. Words that
// start from the bar (r.start) start no later than this, so a target set before the stage ahead of it, or stages
// closed out of order, never read as a range that ends before it starts.
const stageEnd = (st, r) => (st.state === 'done' ? (st.closedAt ? dayStart(st.closedAt) : r.end)
  : st.state !== 'skipped' && plausibleDay(st.target) ? dayStart(st.target) : r.end);

function Gantt() {
  const s = useStore();
  const narrow = useNarrow();
  const scroller = useRef();
  const cmd = isCommander();
  const list = [...teamProjects().filter((p) => cmd || p.manager === s.me), ...personalProjects().filter((p) => p.manager === s.me)]
    .filter((p) => p.phase !== 'stopped' && p.stages.length);
  const now = Date.now();
  const today = dayStart(now);
  const rows = list.map((p) => ({ p, sch: schedule(p, now) }));
  // From three weeks back to eight ahead, wider to take in every stage, but never more than two years back or three
  // ahead, so a stray date can't stretch the chart over thousands of weeks. A stage beyond that is drawn to the edge.
  const ts = rows.flatMap((r) => r.sch.flatMap((s) => [s.start, s.end])).filter(Number.isFinite);
  const lo = Math.max(addDays(today, -730), Math.min(addDays(today, -21), ...ts));
  const hi = Math.min(addDays(today, 1095), Math.max(addDays(today, 56), ...ts));
  const start = addDays(lo, -new Date(lo).getDay());
  const weeks = [];
  for (let w = start; w <= hi; w = addDays(w, 7)) weeks.push(w);
  const px = narrow ? 9 : 14;
  const width = weeks.length * 7 * px;
  const x = (t) => Math.min(width, Math.max(0, Math.round((t - start) / DAY) * px));
  // Open with today in view: up to three weeks before it, less when the time area is narrow.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const vis = el.clientWidth - el.querySelector('.mg-name').offsetWidth;
    el.scrollLeft = -Math.max(0, x(today) - Math.min(21 * px, vis / 2));
  }, [narrow, rows.length]);
  if (!rows.length) return html`<${Empty} icon="layers">אין כאן פרויקטים בניהולך. הגאנט מראה רק פרויקטים שאת/ה מנהל/ת.</${Empty}>`;
  // Each month's label spans the month and stays beside the names while any of the month is in view.
  const months = weeks.filter((w, i) => i === 0 || new Date(w).getMonth() !== new Date(weeks[i - 1]).getMonth());
  const monthEnd = (i) => (i + 1 < months.length ? x(months[i + 1]) : width);
  return html`<div class="mg" style=${`--px:${px}px;--tw:${width}px`}>
    <p class="muted small mg-hint">${cmd ? 'כל פרויקטי הצוות.' : 'הפרויקטים שבניהולך.'} נגיעה בשלב פותחת אותו, ושם קובעים לו יעד. שלב בהיר עם מסגרת הוא הערכה לפי האורך הרגיל שלו, עד שנקבע יעד.</p>
    <div class="mg-scroll" ref=${scroller}>
      <div class="mg-canvas">
        <div class="mg-row mg-head">
          <div class="mg-name mg-corner"><span class="muted small">פרויקט ושלב</span></div>
          <div class="mg-time" aria-hidden="true">
            ${months.map((w, i) => html`<span class="mg-month" style=${`inset-inline-start:${x(w)}px;width:${monthEnd(i) - x(w)}px`}><span>${MONTHS[new Date(w).getMonth()]}</span></span>`)}
            ${weeks.map((w) => html`<span class="mg-week" style=${`inset-inline-start:${x(w)}px`}>${dm(w)}</span>`)}
            <span class="mg-now-tag" style=${`inset-inline-start:${x(today)}px`}>היום</span>
          </div>
        </div>
        ${rows.map(({ p, sch }) => html`<${GanttProject} key=${p.id} p=${p} sch=${sch} x=${x} today=${today} />`)}
        <div class="mg-lines" aria-hidden="true">
          ${weeks.map((w) => html`<i style=${`inset-inline-start:${x(w)}px`}></i>`)}
          <b style=${`inset-inline-start:${x(today)}px`}></b>
        </div>
      </div>
    </div>
  </div>`;
}

function GanttProject({ p, sch, x, today }) {
  const from = Math.min(...sch.map((r) => r.start));
  const to = Math.max(...sch.map((r) => r.end));
  const mgr = canManage(p);
  return html`<div class="mg-proj" style=${`--c:${p.color}`}>
    <div class="mg-row mg-prow">
      <a class="mg-name" href=${`#/project/${p.id}`}><i class="pdot" style=${`background:${p.color}`}></i><b>${p.name}</b>${p.personal ? html`<span class="me-chip">אישי</span>` : null}</a>
      <div class="mg-time"><span class="mg-pbar" style=${`inset-inline-start:${x(from)}px;width:${Math.max(x(to) - x(from), 6)}px`}></span></div>
    </div>
    ${p.stages.map((st, i) => {
      const r = sch[i];
      // The words carry the dates people set; r.start and r.end only place the bar.
      const end = stageEnd(st, r);
      const target = plausibleDay(st.target) ? dm(dayStart(st.target)) : '';
      const sub = st.state === 'done' ? `נסגר ${dm(end)}` : st.state === 'skipped' ? 'דילגנו' : st.state === 'pending' ? 'מחכה לאישור' : target ? `יעד ${target}` : 'בלי יעד';
      const cls = `mg-bar s-${st.state}${r.est ? ' est' : ''}${r.late ? ' late' : ''}`;
      const w = Math.max(x(r.end) - x(r.start), st.state === 'skipped' ? 2 : 8);
      const label = `${st.name}: ${STATE_WORD[st.state]}, ${dm(Math.min(r.start, end))} עד ${dm(end)}${r.est ? ' (הערכה)' : ''}${r.late ? ', באיחור' : ''}`;
      return html`<div class=${'mg-row mg-srow' + (r.late ? ' is-late' : '')} key=${st.id}>
        <div class="mg-name"><span class="mg-sname">${st.name}</span><span class=${'mg-sub' + (r.late ? ' bad-t' : '')}>${r.late ? 'באיחור · ' : ''}${sub}</span></div>
        <div class="mg-time">
          ${r.late ? html`<span class="mg-over" style=${`inset-inline-start:${x(r.end)}px;width:${Math.max(x(today) - x(r.end), 2)}px`}></span>` : null}
          <button type="button" class=${cls} style=${`inset-inline-start:${x(r.start)}px;width:${w}px`} aria-label=${label} title=${label}
            onClick=${() => openSheet('stage', { pid: p.id, sid: st.id })} disabled=${!mgr && st.state !== 'done' && false}></button>
        </div>
      </div>`;
    })}
  </div>`;
}

// ---------- one stage, from the Gantt ----------
export function StageBody({ pid, sid }) {
  useStore();
  // What the date field shows while it's being typed in. A store update (a toast going away) re-renders the sheet, and
  // the stored target would wipe a year typed halfway; on leaving the field, a year never finished gives way to it.
  const [draft, setDraft] = useState(null);
  const p = project(pid);
  const st = p?.stages.find((x) => x.id === sid);
  if (!p || !st) return html`<${Empty}>השלב לא נמצא.</${Empty}>`;
  const r = schedule(p).find((x) => x.id === sid);
  const end = stageEnd(st, r);
  const mgr = canManage(p);
  const closed = st.state === 'done' || st.state === 'skipped';
  // Saved when cleared or inside the field's range. While a year is typed the field passes through "0002-11-06", and
  // the Gantt behind the sheet would stretch back to reach it.
  const setTarget = (e) => { const f = e.currentTarget; setDraft(f.value); if (!f.validity.rangeUnderflow && !f.validity.rangeOverflow) setStage(p.id, st.id, { target: f.value || null }); };
  return html`<div class="form stage-sheet">
    <div class="ss-proj"><${ProjectTag} id=${p.id} /></div>
    <h3>${st.name}</h3>
    <div class="facts">
      <div class="fact-row"><span class="core-l">מצב</span><span>${STATE_WORD[st.state]}</span></div>
      <div class="fact-row"><span class="core-l">מתחיל</span><span>${dm(Math.min(r.start, end))}</span></div>
      <div class="fact-row"><span class="core-l">${closed ? 'נסגר' : 'יעד לסיום'}</span>
        ${closed ? html`<span>${st.state === 'skipped' ? 'דילגנו על השלב' : dm(end)}</span>`
          : html`<label class="fact-btn"><${Icon} name="calendar" size=${16} /><input type="date" value=${draft ?? dateInput(st.target)} disabled=${!mgr} aria-label="יעד לסיום השלב"
            min="2000-01-01" max="2100-12-31" onInput=${setTarget} onBlur=${() => setDraft(null)} />${st.target ? dueWord(st.target) : mgr ? 'לקבוע יעד' : 'עוד לא נקבע'}</label>`}</div>
    </div>
    ${!closed && !st.target ? html`<p class="muted small">עד שנקבע יעד, הגאנט מעריך את השלב לפי האורך הרגיל שלו: ${STAGE_DAYS[st.key] || 14} ימים.</p>` : null}
    ${r.late ? html`<p class="small bad-t">היעד עבר והשלב עוד פתוח.</p>` : null}
    <div class="form-actions"><a class="btn" href=${`#/project/${p.id}`} onClick=${closeSheet}>לפתוח את הפרויקט</a></div>
  </div>`;
}
