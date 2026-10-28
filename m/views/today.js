// "היום שלי": the first screen for everyone. Up to three tasks in focus, then everything that is mine by date, with team
// work and personal work kept apart by one switch. Above them, only what waits for me: weekly updates of projects I
// manage, stages ready to close, and (for the commander) what the overview raised.
import { useState } from 'preact/hooks';
import { html, Icon, Seg, Pill, Empty, ProjectTag } from '../ui.js';
import { TaskRow, QuickAdd } from '../parts.js';
import { useStore, myTasks, updatesDue, managedProjects, openSheet, isCommander, commanderQueue, person, getState } from '../store.js';
import { stageReady, currentStage } from '../card.js';
import { dayDiff } from '../ui.js';

const MODE_KEY = 'm.today.mode';
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
const hello = () => { const h = new Date().getHours(); return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : 'ערב טוב'; };
const savedMode = () => { try { return localStorage.getItem(MODE_KEY) || 'team'; } catch (e) { return 'team'; } };

function groupTasks(list) {
  const g = { late: [], today: [], week: [], later: [], none: [] };
  for (const t of list) {
    if (!t.due) { g.none.push(t); continue; }
    const n = dayDiff(t.due);
    if (n < 0) g.late.push(t); else if (n === 0) g.today.push(t); else if (n <= 6) g.week.push(t); else g.later.push(t);
  }
  for (const k of Object.keys(g)) g[k].sort((a, b) => String(a.due).localeCompare(String(b.due)));
  return g;
}
const GROUPS = [['late', 'באיחור'], ['today', 'היום'], ['week', 'השבוע'], ['later', 'בהמשך'], ['none', 'בלי תאריך']];

export function Today() {
  const s = useStore();
  const [mode, setModeRaw] = useState(savedMode);
  const [showDone, setShowDone] = useState(false);
  const setMode = (m) => { setModeRaw(m); try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* storage blocked */ } };
  const mine = myTasks().filter((t) => (mode === 'personal' ? t.personal : !t.personal));
  const open = mine.filter((t) => t.status !== 'done');
  const focus = open.filter((t) => t.focus);
  const rest = open.filter((t) => !t.focus);
  const doneToday = mine.filter((t) => t.status === 'done' && t.doneAt && dayDiff(t.doneAt) === 0);
  const g = groupTasks(rest);
  const due = updatesDue();
  const ready = managedProjects().filter((p) => stageReady(p, s.tasks));
  const queue = isCommander() ? commanderQueue() : [];
  const d = new Date();
  const lateN = open.filter((t) => t.due && dayDiff(t.due) < 0).length;
  const todayN = open.filter((t) => t.due && dayDiff(t.due) === 0).length;
  const waiting = mode === 'team' ? due.length + ready.length + (queue.length ? 1 : 0) : 0;
  return html`<div class="page today2">
    <header class="hello">
      <div class="eyebrow">יום ${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}</div>
      <h1>${hello()}, ${person(s.me).name}</h1>
      <p class="hello-sum">${open.length === 0 ? 'אין משימות פתוחות. יום שקט.' : html`${todayN ? html`<b>${todayN}</b> להיום` : 'אין משימות להיום'}${lateN ? html`, <b class="bad">${lateN} באיחור</b>` : null}${focus.length ? html`, ${focus.length} בפוקוס` : null}.`}</p>
    </header>
    <${Seg} label="איזו עבודה" value=${mode} onChange=${setMode} cls="mode-seg" options=${[{ id: 'team', label: 'עבודת הצוות', n: waiting || null }, { id: 'personal', label: 'אישי' }]} />

    ${mode === 'team' && (queue.length || due.length || ready.length) ? html`<section class="sec">
      <div class="sec-head"><h2>מחכה לך</h2></div>
      <div class="group">
        ${queue.length ? html`<a class="wait-row" href="#/overview"><span class="wait-ic red"><${Icon} name="flag" /></span>
          <div class="grow"><strong>${queue.length} דברים בפרויקטים צריכים אותך</strong><span class="muted small">${queue.slice(0, 2).map((x) => x.text).join(' · ')}</span></div><${Icon} name="chevronLeft" /></a>` : null}
        ${ready.map((p) => html`<button type="button" class="wait-row" onClick=${() => openSheet('gate', { id: p.id })}><span class="wait-ic green"><${Icon} name="check" /></span>
          <div class="grow"><strong>כל המשימות של שלב ${currentStage(p).name} בוצעו</strong><span class="muted small">${p.name} · לסגור את השלב?</span></div><${Icon} name="chevronLeft" /></button>`)}
        ${due.map((p) => html`<button type="button" class="wait-row" onClick=${() => openSheet('weekly', { id: p.id })}><span class="wait-ic"><${Icon} name="hill" /></span>
          <div class="grow"><strong>עדכון שבועי</strong><span class="muted small">${p.name} · שלוש נגיעות, חצי דקה</span></div><${Icon} name="chevronLeft" /></button>`)}
      </div>
    </section>` : null}

    <section class="sec">
      <div class="sec-head"><h2><${Icon} name="star" size=${18} cls="focus-ic" />הפוקוס של היום</h2><span class="muted small">${focus.length}/3</span></div>
      ${focus.length ? html`<div class="group">${focus.map((t) => html`<${TaskRow} key=${t.id} t=${t} star showOwner=${false} />`)}</div>`
        : html`<div class="focus-empty">בוחרים עד שלוש משימות שהן הכי חשובות היום. לוחצים על הכוכב ליד משימה, או בתוך המשימה עצמה.</div>`}
    </section>

    <${QuickAdd} key=${mode} personal=${mode === 'personal'} placeholder=${mode === 'personal' ? 'משימה אישית חדשה…' : 'משימה חדשה…'} />

    ${GROUPS.map(([k, label]) => (g[k].length ? html`<section class="sec" key=${k}>
      <div class="sec-head"><h2 class=${k === 'late' ? 'bad' : ''}>${label}</h2><span class="muted small">${g[k].length}</span></div>
      <div class="group">${g[k].map((t) => html`<${TaskRow} key=${t.id} t=${t} star showOwner=${false} />`)}</div>
    </section>` : null))}
    ${!open.length ? html`<${Empty}>${mode === 'personal' ? 'אין משימות אישיות פתוחות.' : 'אין משימות צוות פתוחות.'}</${Empty}>` : null}

    ${doneToday.length ? html`<section class="sec">
      <button type="button" class="link-btn" onClick=${() => setShowDone(!showDone)}><${Icon} name=${showDone ? 'chevronUp' : 'chevronDown'} size=${16} />בוצעו היום · ${doneToday.length}</button>
      ${showDone ? html`<div class="group">${doneToday.map((t) => html`<${TaskRow} key=${t.id} t=${t} showOwner=${false} />`)}</div>` : null}
    </section>` : null}
  </div>`;
}
