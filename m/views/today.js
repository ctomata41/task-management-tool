// "היום שלי": the first screen for everyone, as one table of my tasks (Monday's "My work"). The focus group comes
// first, then the rest by date (or project, status, priority), with team and personal work kept apart by one switch.
// Above it, a line of counts and only what waits for me: the commander's asks to answer or to close, a new place for a
// project I run, weekly updates, stages ready to close, the commander's queue.
import { useState } from 'preact/hooks';
import { html, Icon, Seg, dueWord, dayDiff, keepFocus } from '../ui.js';
import { TaskTable, BoardBar, groupTasks, matches, byFocus } from '../table.js';
import { useStore, myTasks, updatesDue, stagesReady, openSheet, isCommander, commanderQueue, person, project, asksWaiting, asksReady, movedProjects,
  waitingCount, focusCount, ackAsk, ackRank, setStatus } from '../store.js';
import { currentStage } from '../card.js';

const MODE_KEY = 'm.today.mode';
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
const hello = () => { const h = new Date().getHours(); return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : 'ערב טוב'; };
const savedMode = () => { try { return localStorage.getItem(MODE_KEY) || 'team'; } catch (e) { return 'team'; } };

const GROUP_KEY = 'm.today.group';
const savedGroup = () => { try { return localStorage.getItem(GROUP_KEY) || 'date'; } catch (e) { return 'date'; } };
const GROUP_OPTIONS = [{ id: 'date', label: 'תאריך' }, { id: 'project', label: 'פרויקט' }, { id: 'status', label: 'סטטוס' }, { id: 'priority', label: 'עדיפות' }];

export function Today() {
  const s = useStore();
  const [mode, setModeRaw] = useState(savedMode);
  const [groupBy, setGroupRaw] = useState(savedGroup);
  const [search, setSearch] = useState('');
  const [showDone, setShowDone] = useState(false);
  const setMode = (m) => { setModeRaw(m); try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* storage blocked */ } };
  const setGroupBy = (g) => { setGroupRaw(g); try { localStorage.setItem(GROUP_KEY, g); } catch (e) { /* storage blocked */ } };
  const personal = mode === 'personal';
  const mine = myTasks().filter((t) => (personal ? t.personal : !t.personal));
  const open = mine.filter((t) => t.status !== 'done');
  const list = mine.filter((t) => (showDone ? t.status !== 'done' || (t.doneAt && dayDiff(t.doneAt) > -7) : t.status !== 'done') && matches(t, search));
  // The focus in the order its owner should take it (byFocus), whoever starred or pinned each task.
  const focus = list.filter((t) => t.focus && t.status !== 'done').sort(byFocus);
  // The cap of three counts team and personal work together (focusCount), so the group says how much is in the other.
  const inFocus = focusCount(s.me);
  const elsewhere = inFocus - open.filter((t) => t.focus).length;
  const focusHint = inFocus ? `${inFocus} מתוך 3${elsewhere > 0 ? ` · עוד ${elsewhere} ${personal ? 'בצוות' : 'באישי'}` : ''}` : 'מסמנים בכוכב עד שלוש משימות';
  const base = { owner: s.me, personal };
  let groups;
  if (groupBy === 'date') {
    groups = [{ id: 'focus', name: 'הפוקוס של היום', hint: focusHint, color: 'var(--s-progress)', tasks: focus, add: null },
      ...groupTasks(list.filter((t) => !focus.includes(t)), 'date', base)];
  } else groups = groupTasks(list, groupBy, base);
  const due = updatesDue();
  const ready = stagesReady();
  const queue = isCommander() ? commanderQueue() : [];
  const asks = asksWaiting();
  const closing = asksReady();
  const moved = movedProjects();
  const d = new Date();
  const lateN = open.filter((t) => t.due && dayDiff(t.due) < 0).length;
  const todayN = open.filter((t) => t.due && dayDiff(t.due) === 0).length;
  // One count for what waits, row by row as מחכה לך lists it (the היום badge counts the same, store.waitingCount), and
  // the commander's queue on top of it.
  const waitN = !personal ? waitingCount() + queue.length : 0;
  return html`<div class="page today2">
    <header class="hello">
      <div class="eyebrow">יום ${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}</div>
      <h1>${hello()}, ${person(s.me).name}</h1>
    </header>
    <div class="stat-row">
      <div class=${'stat' + (lateN ? ' bad' : '')}><b>${lateN}</b><span>באיחור</span></div>
      <div class="stat"><b>${todayN}</b><span>להיום</span></div>
      <div class="stat"><b>${inFocus}<small>/3</small></b><span>בפוקוס</span></div>
      <div class="stat"><b>${open.length}</b><span>פתוחות</span></div>
      ${waitN ? html`<div class="stat wait"><b>${waitN}</b><span>מחכים לך</span></div>` : null}
    </div>

    ${!personal && (queue.length || asks.length || closing.length || moved.length || due.length || ready.length) ? html`<section class="group wait-group" aria-label="מחכה לך">
        ${queue.length ? html`<a class="wait-row" key="queue" href="#/overview"><span class="wait-ic red"><${Icon} name="flag" /></span>
          <div class="grow"><strong>${queue.length} דברים בפרויקטים צריכים אותך</strong><span class="muted small">${queue.slice(0, 2).map((x) => x.text).join(' · ')}</span></div><${Icon} name="chevronLeft" /></a>` : null}
        ${asks.map((t) => html`<${AskRow} key=${t.id} t=${t} />`)}
        ${closing.map((t) => html`<${ReadyAskRow} key=${`ready:${t.id}`} t=${t} />`)}
        ${moved.length ? html`<${MovedRow} key="moved" list=${moved} />` : null}
        ${ready.map((p) => html`<button type="button" class="wait-row" key=${`stage:${p.id}`} onClick=${() => openSheet('gate', { id: p.id })}><span class="wait-ic green"><${Icon} name="check" /></span>
          <div class="grow"><strong>כל המשימות של שלב ${currentStage(p).name} בוצעו</strong><span class="muted small">${p.name} · לסגור את השלב?</span></div><${Icon} name="chevronLeft" /></button>`)}
        ${due.map((p) => html`<button type="button" class="wait-row" key=${`weekly:${p.id}`} onClick=${() => openSheet('weekly', { id: p.id })}><span class="wait-ic"><${Icon} name="hill" /></span>
          <div class="grow"><strong>עדכון שבועי</strong><span class="muted small">${p.name} · שלוש נגיעות, חצי דקה</span></div><${Icon} name="chevronLeft" /></button>`)}
    </section>` : null}

    <${BoardBar} search=${search} setSearch=${setSearch} groupBy=${groupBy} setGroupBy=${setGroupBy} groupOptions=${GROUP_OPTIONS} showDone=${showDone} setShowDone=${setShowDone}>
      <${Seg} label="איזו עבודה" value=${mode} onChange=${setMode} cls="mode-seg" options=${[{ id: 'team', label: 'צוות' }, { id: 'personal', label: 'אישי' }]} />
    </${BoardBar}>
    <${TaskTable} key=${mode + groupBy} groups=${groups} star memory=${`m.today.${mode}.${groupBy}`}
      cols=${personal ? ['status', 'priority', 'due'] : ['project', 'status', 'priority', 'due']}
      empty=${search ? 'לא נמצאו משימות.' : personal ? 'אין משימות אישיות פתוחות.' : 'אין משימות צוות פתוחות.'} />
  </div>`;
}

// A button on a row of מחכה לך that takes its own row away hands focus to the next row (ui.keepFocus).
const thenNext = (f) => (e) => { keepFocus(e, '.wait-row'); f(); };

// An ask from the commander that waits for my answer, answered right on the row; the rest of the row opens the ask.
function AskRow({ t }) {
  const p = project(t.project);
  const meta = [t.why, p?.name, t.due ? `עד ${dueWord(t.due)}` : null].filter(Boolean).join(' · ');
  return html`<div class="wait-row wait-ask">
    <span class="wait-ic cmd"><${Icon} name="flag" /></span>
    <button type="button" class="grow wait-open" onClick=${() => openSheet('task', { id: t.id })}><strong>בקשה מ${person(t.by).name}</strong><span>${t.title}</span>
      ${meta ? html`<span class="muted small">${meta}</span>` : null}</button>
    <div class="wait-acts">
      <button type="button" class="btn btn-primary sm" onClick=${thenNext(() => ackAsk(t.id, 'ok'))}>קיבלתי</button>
      <button type="button" class="btn sm" onClick=${thenNext(() => ackAsk(t.id, 'talk'))}>צריך לדבר</button>
    </div>
  </div>`;
}

// An ask whose tasks are all done (store.asksReady), until I close it: a partner may have finished the last of them, so
// the row stays rather than a toast only they would see. The rest of the row opens the ask.
function ReadyAskRow({ t }) {
  const p = project(t.project);
  return html`<div class="wait-row wait-ask">
    <span class="wait-ic green"><${Icon} name="check" /></span>
    <button type="button" class="grow wait-open" onClick=${() => openSheet('task', { id: t.id })}><strong>כל המשימות של הבקשה בוצעו · לסגור?</strong><span>${t.title}</span>
      <span class="muted small">${[`בקשה מ${person(t.by).name}`, p?.name].filter(Boolean).join(' · ')}</span></button>
    <div class="wait-acts"><button type="button" class="btn btn-primary sm" onClick=${thenNext(() => setStatus(t.id, 'done'))}>לסגירה</button></div>
  </div>`;
}

// One row for every project I run that the commander moved, until "הבנתי"; the rest of the row opens the order.
function MovedRow({ list }) {
  return html`<div class="wait-row wait-moved">
    <span class="wait-ic"><${Icon} name="list" /></span>
    <a class="grow wait-open" href="#/overview"><strong>סדר העדיפויות השתנה</strong>
      ${list.map((p) => html`<span class="small" key=${p.id}>${p.name}: עכשיו במקום ${p.rank} (${p.rankSeen ? `היה ${p.rankSeen}` : 'קודם בלי מקום'})</span>`)}</a>
    <div class="wait-acts"><button type="button" class="btn sm" onClick=${thenNext(() => ackRank())}>הבנתי</button></div>
  </div>`;
}
