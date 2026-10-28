// "היום שלי": the first screen for everyone, as one table of my tasks (Monday's "My work"). The focus group comes
// first, then the rest by date (or project, status, priority), with team and personal work kept apart by one switch.
// Above it, a line of counts and only what waits for me: weekly updates, stages ready to close, the commander's queue.
import { useState } from 'preact/hooks';
import { html, Icon, Seg } from '../ui.js';
import { TaskTable, BoardBar, groupTasks, matches } from '../table.js';
import { useStore, myTasks, updatesDue, managedProjects, openSheet, isCommander, commanderQueue, person, getState } from '../store.js';
import { stageReady, currentStage } from '../card.js';
import { dayDiff } from '../ui.js';

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
  const focus = list.filter((t) => t.focus && t.status !== 'done');
  const base = { owner: s.me, personal };
  let groups;
  if (groupBy === 'date') {
    groups = [{ id: 'focus', name: 'הפוקוס של היום', hint: focus.length ? `${focus.length} מתוך 3` : 'מסמנים בכוכב עד שלוש משימות', color: 'var(--s-progress)', tasks: focus, add: null },
      ...groupTasks(list.filter((t) => !focus.includes(t)), 'date', base)];
  } else groups = groupTasks(list, groupBy, base);
  const due = updatesDue();
  const ready = managedProjects().filter((p) => stageReady(p, s.tasks));
  const queue = isCommander() ? commanderQueue() : [];
  const d = new Date();
  const lateN = open.filter((t) => t.due && dayDiff(t.due) < 0).length;
  const todayN = open.filter((t) => t.due && dayDiff(t.due) === 0).length;
  const waitN = !personal ? due.length + ready.length + queue.length : 0;
  return html`<div class="page today2">
    <header class="hello">
      <div class="eyebrow">יום ${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}</div>
      <h1>${hello()}, ${person(s.me).name}</h1>
    </header>
    <div class="stat-row">
      <div class=${'stat' + (lateN ? ' bad' : '')}><b>${lateN}</b><span>באיחור</span></div>
      <div class="stat"><b>${todayN}</b><span>להיום</span></div>
      <div class="stat"><b>${open.filter((t) => t.focus).length}<small>/3</small></b><span>בפוקוס</span></div>
      <div class="stat"><b>${open.length}</b><span>פתוחות</span></div>
      ${waitN ? html`<div class="stat wait"><b>${waitN}</b><span>מחכים לך</span></div>` : null}
    </div>

    ${!personal && (queue.length || due.length || ready.length) ? html`<section class="group wait-group" aria-label="מחכה לך">
        ${queue.length ? html`<a class="wait-row" href="#/overview"><span class="wait-ic red"><${Icon} name="flag" /></span>
          <div class="grow"><strong>${queue.length} דברים בפרויקטים צריכים אותך</strong><span class="muted small">${queue.slice(0, 2).map((x) => x.text).join(' · ')}</span></div><${Icon} name="chevronLeft" /></a>` : null}
        ${ready.map((p) => html`<button type="button" class="wait-row" onClick=${() => openSheet('gate', { id: p.id })}><span class="wait-ic green"><${Icon} name="check" /></span>
          <div class="grow"><strong>כל המשימות של שלב ${currentStage(p).name} בוצעו</strong><span class="muted small">${p.name} · לסגור את השלב?</span></div><${Icon} name="chevronLeft" /></button>`)}
        ${due.map((p) => html`<button type="button" class="wait-row" onClick=${() => openSheet('weekly', { id: p.id })}><span class="wait-ic"><${Icon} name="hill" /></span>
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
