// Projects: the portfolio as one table (a row per project, in the commander's order: stage, health, how much is done,
// what is next), and a project's page. The page opens on its board (tasks grouped by stage, Monday style); the ID card,
// outputs, the log of decisions and assumptions, and the people are one tab away. A restricted project shows a team
// member outside it only its one line (canSeeDetail).
import { useState, useRef } from 'preact/hooks';
import { html, Icon, Avatar, Faces, Pill, Seg, Classified, Health, StageStrip, Empty, RankCap, useFlip, openMenu, dueWord, dayDiff, ago } from '../ui.js';
import { TaskTable, BoardBar, Battery, DueLines, groupTasks, matches } from '../table.js';
import { useStore, project, person, me, canManage, canSee, canSeeDetail, canAddOutput, inProject, leads, isCommander, actsAsCommander, teamProjects, orderedProjects, personalProjects, projectTasks, projectOutputs, projectLog, openSheet,
  updateProject, addLog, team, getState, isOpen, typeOf } from '../store.js';
import { status, currentStage, inOrder, HILL, CONFIDENCE, HEALTH, CLASSIFICATION, needsCommander, placeOf, isRestricted, lockedWhere, domainName } from '../card.js';
import { OutputCard } from './outputs.js';
import { orderLine, pyramidGroups, ClaudeCap, Brief } from './overview.js';
import { CoreCard } from './core.js';
import { StagesCard } from './stages.js';

// The groups' colors on "פירמידה": the four tiers, the two side areas, and "בלי רובד".
const PYRAMID_COLOR = { tier: 'var(--accent)', side: 'var(--s-review)', none: 'var(--s-todo)' };

export function Projects() {
  const s = useStore();
  const [filter, setFilter] = useState('all');
  const all = teamProjects();
  const live = orderedProjects(); // placed, then not placed yet, then held
  const isMine = (p) => p.manager === s.me || p.partners.includes(s.me);
  const ext = me().role === 'external'; // outside partners see only their own projects, and no places or pyramid
  const view = ext && filter === 'pyramid' ? 'all' : filter;
  const personal = personalProjects();
  let groups;
  if (view === 'closed') groups = [{ id: 'closed', name: 'נסגרו', color: 'var(--s-todo)', list: all.filter((p) => !isOpen(p)) }];
  // The active team projects by the pyramid, each group in the order; personal projects are not part of it.
  else if (view === 'pyramid') groups = pyramidGroups(live).map((g) => ({ ...g, color: PYRAMID_COLOR[g.tier ? 'tier' : g.id === 'none' ? 'none' : 'side'] }));
  else {
    groups = [
      { id: 'order', name: ext ? 'הפרויקטים שלי' : 'סדר העדיפויות', hint: ext ? null : orderLine(), color: 'var(--accent)', list: view === 'mine' ? live.filter(isMine) : live },
      { id: 'personal', name: 'אישי', hint: 'רק את/ה רואה', color: 'var(--s-progress)', list: personal },
    ];
  }
  return html`<div class="page">
    <header class="page-head2"><h1>פרויקטים</h1>
      <div class="head-acts py-acts"><a class="btn out-link" href="#/outputs"><${Icon} name="file" size=${16} />תוצרים</a>
        ${ext ? null : html`<a class="btn py-types" href="#/types"><${Icon} name="grid" size=${16} />סוגים</a>`}
        ${ext ? null : html`<button type="button" class="btn btn-primary" onClick=${() => openSheet('newproject')}><${Icon} name="plus" size=${16} />פרויקט חדש</button>`}</div></header>
    <${Seg} label="סינון" value=${view} onChange=${setFilter} options=${[{ id: 'all', label: 'פעילים', n: live.length }, ...(ext ? [] : [{ id: 'pyramid', label: 'פירמידה' }]), { id: 'mine', label: 'שלי' }, { id: 'closed', label: 'נסגרו' }]} />
    ${groups.some((g) => g.list.length) ? html`<div class="ttable ptable">${groups.filter((g) => g.list.length).map((g) => html`<${ProjectGroup} key=${g.id} g=${g} ext=${ext} />`)}</div>`
      : html`<${Empty} icon="layers">אין כאן פרויקטים.</${Empty}>`}
    ${view === 'pyramid' && live.length ? html`<p class="muted small py-foot">המספר ליד כל פרויקט הוא המקום שלו בסדר העדיפויות</p>` : null}
  </div>`;
}

// A group of the portfolio. When the commander gives a project a new place, its row moves there on a spring (useFlip).
function ProjectGroup({ g, ext }) {
  const ref = useRef();
  useFlip(ref);
  return html`<section class="tgrp" style=${`--gc:${g.color}`}>
    <header class="tgrp-head"><span class="tgrp-tog"><h3>${g.name}</h3></span><span class="tgrp-n">${g.list.length}</span>${g.hint ? html`<span class="muted small">${g.hint}</span>` : null}</header>
    <div class="tt" role="table" aria-label=${g.name} ref=${ref}>
      <div class="tt-row tt-th" role="row"><span class="tc-bar"></span><span class="tc th-title">פרויקט</span><span class="tc th c-owner">מוביל/ה</span><span class="tc th c-pstage">שלב</span><span class="tc th c-status">מצב</span><span class="tc th c-prog">משימות</span><span class="tc th c-due">הבא בתור</span></div>
      ${g.list.map((p) => html`<${ProjectRow} key=${p.id} p=${p} ext=${ext} />`)}
    </div></section>`;
}

// One project as a row of the portfolio table: its place, where it stands, how it feels, how much of its work is done.
// The row is a stretched link to the project, so the place capsule can be a button of its own. With a pointer, the cells
// that carry a tooltip (the next date, the manager, the stages, the battery) sit above the link so it shows, and a click
// on them opens the project from the row (m.css). A locked project keeps to its one line: no battery, no next date, no
// stage names and no "לא עודכן" (canSeeDetail); its stage reads lockedWhere, and it has no brief line or valley mark.
function ProjectRow({ p, ext }) {
  const s = getState();
  const st = status(p);
  const locked = !canSeeDetail(p);
  const where = locked ? lockedWhere(st) : st.where;
  const h0 = HEALTH[st.health];
  const tasks = projectTasks(p.id);
  const done = tasks.filter((t) => t.status === 'done').length;
  const next = tasks.filter((t) => t.status !== 'done' && t.due).sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  const asks = isCommander() ? needsCommander(p, s.tasks) : [];
  // Held projects keep the room of a place they don't have, so the names stay in line.
  const cap = inOrder(p) ? html`<${RankCap} p=${p} />` : p.phase === 'hold' && !ext ? html`<span class="cap-gap" aria-hidden="true"></span>` : null;
  const go = (e) => { if (!e.target.closest('a, button')) location.hash = `#/project/${p.id}`; };
  return html`<div class=${'tt-row tt-task prow' + (locked ? ' locked' : '')} role="row" style=${`--pc:${p.color}`} onClick=${go}>
    <span class="tc-bar" aria-hidden="true"></span>
    <span class="tc tc-title" role="cell">${cap}<span class="pdot" style=${`background:${p.color}`}></span><a class="tt-open prow-link" href=${`#/project/${p.id}`}><span class="tt-name">${p.name}</span>
      <span class="tt-chips"><${Classified} p=${p} small /><${ClaudeCap} p=${p} />${st.pending ? html`<${Pill} color="var(--s-waiting)">מחכה לאישור</${Pill}>` : null}${asks.length ? html`<${Pill} color="var(--h-off)">צריך אותך · ${asks.length}</${Pill}>` : null}${st.stale && !locked ? html`<span class="stale">לא עודכן</span>` : null}</span></a></span>
    <span class="tc c-owner" role="cell"><${Avatar} id=${p.manager} size=${28} /></span>
    <span class="tc c-pstage" role="cell"><span class="small"><b>${where}</b>${st.n && where === st.where ? html` <span class="muted">${Math.min(st.idx, st.n)}/${st.n}</span>` : null}</span><${StageStrip} p=${p} bare=${locked} />${locked ? null : html`<${Brief} p=${p} />`}</span>
    <span class="tc c-status" role="cell"><span class=${'cell-fill' + (st.health === 'hold' || st.health === 'stopped' ? ' quiet' : '') + (st.health === 'stuck' ? ' light' : '')} style=${`--c:${h0.color}`}>${h0.label}</span></span>
    <span class="tc c-prog" role="cell">${locked ? null : tasks.length ? html`<${Battery} tasks=${tasks} /><span class="muted small">${done}/${tasks.length}</span>` : html`<span class="muted small">—</span>`}</span>
    <span class="tc c-due" role="cell">${locked ? null : next ? html`<span class=${'cell-date' + (dayDiff(next.due) < 0 ? ' late' : dayDiff(next.due) <= 1 ? ' soon' : '')} title=${`הבא בתור: ${next.title}`}><span class="sr">הבא בתור: ${next.title}, </span><${DueLines} iso=${next.due} late=${dayDiff(next.due) < 0} /></span>` : html`<span class="muted small">—</span>`}</span>
  </div>`;
}

const TABS = [
  { id: 'tasks', label: 'משימות' },
  { id: 'card', label: 'תעודת זהות' },
  { id: 'outputs', label: 'תוצרים' },
  { id: 'log', label: 'החלטות' }, // "יומן" is the calendar in the main nav
  { id: 'people', label: 'אנשים' },
];

export function ProjectPage({ id }) {
  const s = useStore();
  const p = project(id);
  const [tab, setTab] = useState('tasks');
  if (!p || !canSee(p)) return html`<div class="page"><${Empty} icon="lock">הפרויקט לא נמצא, או שאין לך גישה אליו.</${Empty}></div>`;
  if (!canSeeDetail(p)) return html`<${LockedPage} p=${p} />`;
  const mgr = canManage(p);
  const st = status(p);
  const tasks = projectTasks(p.id);
  const openTasks = tasks.filter((t) => t.status !== 'done').length;
  const outs = projectOutputs(p.id);
  const tabs = TABS.map((t) => ({ ...t, n: t.id === 'tasks' ? openTasks || null : t.id === 'outputs' ? outs.length || null : null }));
  const ids = [p.manager, ...p.partners];
  const shown = p.partners.length ? `${ids.length} אנשים` : 'עוד אין שותפים';
  const t = typeOf(p);
  return html`<div class="page proj2" style=${`--bar:${p.color}`}>
    <header class="proj2-head">
      <div class="grow">
        <div class="eyebrow">${p.personal ? 'פרויקט אישי' : html`בניהול ${person(p.manager).name}`}${t ? html` · <${TypeName} t=${t} />` : null}</div>
        <h1>${p.name}</h1>
        <div class="proj2-tags"><${RankCap} p=${p} full /><${Health} p=${p} /><${Classified} p=${p} />${st.n ? html`<span class="muted small">${st.where} · שלב ${Math.min(st.idx, st.n)} מתוך ${st.n}</span>` : null}</div>
        ${p.personal ? null : html`<div class="proj2-people">
          <button type="button" class="ppl-faces" aria-label=${`${shown}: ${ids.map((x) => person(x).name).join(', ')}`} onClick=${() => setTab('people')}><${Faces} ids=${ids} size=${26} max=${5} />
            <span>${shown}</span></button>
          ${mgr && isOpen(p) ? html`<button type="button" class="add-ppl" onClick=${() => openSheet('partner', { id: p.id })}><${Icon} name="plus" size=${15} />הוספת שותף</button>` : null}
        </div>`}
      </div>
      <div class="head-acts">
        ${mgr && !p.personal && p.phase !== 'stopped' ? html`<button type="button" class="btn" onClick=${() => openSheet('weekly', { id: p.id })}><${Icon} name="hill" size=${16} />עדכון שבועי</button>` : null}
        ${mgr && currentStage(p) && p.phase !== 'stopped' ? html`<button type="button" class="btn btn-primary" onClick=${() => openSheet('gate', { id: p.id })}><${Icon} name="check" size=${16} />${currentStage(p).state === 'pending' && actsAsCommander(p) ? 'אישור השלב' : 'סגירת שלב'}</button>` : null}
        ${isCommander() && !p.personal && !leads(p) && isOpen(p) ? html`<button type="button" class="btn" onClick=${() => openSheet('ask', { id: p.id })}><${Icon} name="flag" size=${16} />בקשה ל${person(p.manager).name}</button>` : null}
      </div>
    </header>
    <${Seg} label="חלקי הפרויקט" value=${tab} onChange=${setTab} options=${tabs} cls="proj-tabs" />
    ${tab === 'card' ? html`<${IdCard} p=${p} mgr=${mgr} />` : null}
    ${tab === 'tasks' ? html`<${TasksBoard} p=${p} mgr=${mgr} />` : null}
    ${tab === 'outputs' ? html`<${ProjectOutputs} p=${p} />` : null}
    ${tab === 'log' ? html`<${Log} p=${p} mgr=${mgr} />` : null}
    ${tab === 'people' ? html`<${People} p=${p} mgr=${mgr} />` : null}
  </div>`;
}

// The type in a project's eyebrow opens it on the types page (design §6.4). That page is for the team, so an outside
// partner reads the name alone.
function TypeName({ t }) {
  return me().role === 'external' ? t.name : html`<a class="py-type" href=${`#/types/${t.id}`}>${t.name}</a>`;
}

// A restricted project, opened by someone in the team who isn't in it: its one line (name, manager, type, domain,
// stage, health and place), and why there is nothing more. No tabs, no people, no actions.
function LockedPage({ p }) {
  const st = status(p);
  const t = typeOf(p);
  const where = lockedWhere(st);
  return html`<div class="page proj2" style=${`--bar:${p.color}`}>
    <header class="proj2-head"><div class="grow">
      <div class="eyebrow">בניהול ${person(p.manager).name}${t ? html` · <${TypeName} t=${t} />` : null} · ${domainName(p.domain)}</div>
      <h1>${p.name}</h1>
      <div class="proj2-tags"><${RankCap} p=${p} full /><${Health} p=${p} />${st.n ? html`<span class="muted small">${where}${where === st.where ? ` · שלב ${Math.min(st.idx, st.n)} מתוך ${st.n}` : ''}</span>` : null}</div>
    </div></header>
    <div class="lock-page"><span class="lock-mark"><${Icon} name="lock" size=${20} /></span>
      <p><b>${CLASSIFICATION.restricted.label}</b> · הפרטים רק למי שבפרויקט ולפיקוד</p></div>
  </div>`;
}

// ---------- the ID card ----------
// What the lock band says, by where the materials live (card.PLACES).
const LOCK_BAND = {
  both: 'כאן הניהול והחומר הבלמ"ס. מה שמסווג נשאר ברשת המסווגת, ושדה שנמצא שם מסומן ככזה ולא נחשב חסר.',
  there: 'כאן רק שכבת הניהול. כל החומרים ברשת המסווגת, ושדה שנמצא שם מסומן ככזה ולא נחשב חסר.',
};

// The bands at the top (the place, a senior's help, what the commander is asked), the core (core.js), the stages
// (stages.js), and where the project stands.
function IdCard({ p, mgr }) {
  const s = useStore();
  const asks = needsCommander(p, s.tasks);
  return html`<div class="idcard">
    ${isRestricted(p) ? html`<div class="note-band lock"><${Icon} name="lock" size=${16} /><span><b>${CLASSIFICATION.restricted.label}.</b> ${LOCK_BAND[placeOf(p)]}</span></div>` : null}
    ${p.needsSenior ? html`<div class="note-band senior"><${Icon} name="flag" size=${16} /><div class="grow"><b>צריך בכיר:</b> ${p.needsSenior.what}${p.needsSenior.by ? html` <span class="muted">· עד ${dueWord(p.needsSenior.by)}</span>` : null}</div>
      ${isCommander() ? html`<button type="button" class="btn sm" onClick=${() => openSheet('resolve', { id: p.id })}>טיפלתי</button>` : null}</div>` : null}
    ${isCommander() && asks.filter((a) => a.kind !== 'senior').length ? html`<div class="note-band why"><${Icon} name="alert" size=${16} /><div class="grow">${asks.filter((a) => a.kind !== 'senior').map((a) => html`<div><b>${a.why}:</b> ${a.text}</div>`)}</div></div>` : null}

    <${CoreCard} p=${p} mgr=${mgr} />
    <${StagesCard} p=${p} mgr=${mgr} />

    ${!p.personal ? html`<section class="card2">
      <div class="card2-head"><h2><${Icon} name="hill" size=${18} />איפה זה עומד</h2><span class="muted small">עודכן ${ago(p.lastUpdate)}</span></div>
      <div class="state-grid">
        <div class="state-cell"><span class="muted small">על הגבעה</span><${Hill} at=${p.hill || 'up'} /><strong>${HILL[p.hill || 'up'].label}</strong></div>
        <div class="state-cell"><span class="muted small">ביטחון</span><span class="conf-dot" style=${`--c:${(CONFIDENCE[p.confidence] || CONFIDENCE.on).color}`}></span><strong>${(CONFIDENCE[p.confidence] || CONFIDENCE.on).label}</strong>${p.confNote ? html`<span class="small">${p.confNote}</span>` : null}</div>
      </div>
      ${(p.updates || []).length > 1 ? html`<div class="upd-trail" aria-label="העדכונים האחרונים">${p.updates.slice(0, 8).reverse().map((u) => html`<span class="upd-dot" style=${`--c:${CONFIDENCE[u.confidence].color}`} title=${`${ago(u.at)} · ${CONFIDENCE[u.confidence].label} · ${HILL[u.hill].short}`}></span>`)}<span class="muted small">שבועות אחרונים</span></div>` : null}
      ${mgr ? html`<button type="button" class="btn block" onClick=${() => openSheet('weekly', { id: p.id })}>עדכון שבועי</button>` : null}
    </section>` : null}
  </div>`;
}

// Uphill: still working out how. The top: the approach is known. Downhill: finishing.
function Hill({ at }) {
  const x = { up: 26, top: 50, down: 76 }[at];
  const y = { up: 20, top: 9, down: 20 }[at];
  return html`<svg class="hill" viewBox="0 0 100 34" width="110" height="38" aria-hidden="true">
    <path d="M4 30 C 30 30, 34 8, 50 8 S 70 30, 96 30" fill="none" stroke="var(--line-strong)" stroke-width="2" />
    <circle cx=${x} cy=${y} r="5" fill="var(--accent)" /></svg>`;
}

// ---------- tasks: the project's board, grouped by stage by default ----------
const BOARD_GROUPS = [{ id: 'stage', label: 'שלב' }, { id: 'status', label: 'סטטוס' }, { id: 'owner', label: 'אחראי' }, { id: 'priority', label: 'עדיפות' }, { id: 'date', label: 'תאריך' }];
function TasksBoard({ p, mgr }) {
  const s = useStore();
  const [by, setBy] = useState('stage');
  const [search, setSearch] = useState('');
  const [who, setWho] = useState(null);
  const [showDone, setShowDone] = useState(true);
  const all = projectTasks(p.id);
  const tasks = all.filter((t) => matches(t, search, who) && (showDone || t.status !== 'done'));
  const cur = currentStage(p);
  const isMember = mgr || p.partners.includes(s.me);
  // A stopped or finished project takes no new work (and no asks), so its groups have no add line.
  const base = isMember && isOpen(p) ? { project: p.id } : null;
  // What the commander adds in a project someone else runs goes to its manager as an ask (store.addTask), so the add
  // rows say so.
  const addLabel = isCommander() && !leads(p) ? `בקשה ל${person(p.manager).name}` : undefined;
  const PAL = ['var(--accent)', 'var(--s-waiting)', 'var(--s-done)', 'var(--s-progress)', 'var(--h-risk)', 'var(--s-blocked)'];
  const groups = (by === 'stage'
    ? [...p.stages.filter((st) => tasks.some((t) => t.stage === st.id) || st === cur).map((st) => ({ id: st.id, name: st.name, color: st.state === 'done' ? 'var(--s-done)' : st === cur ? 'var(--accent)' : PAL[(p.stages.indexOf(st) + 1) % PAL.length],
        hint: st === cur ? 'עכשיו' : st.state === 'done' ? 'נסגר' : st.state === 'skipped' ? 'דילגנו' : null, tasks: tasks.filter((t) => t.stage === st.id), add: base ? { ...base, stage: st.id } : null })),
      { id: 'none', name: 'בלי שלב', color: 'var(--s-todo)', tasks: tasks.filter((t) => !t.stage || !p.stages.some((x) => x.id === t.stage)), add: null }]
    : groupTasks(tasks, by, base)).map((g) => ({ ...g, addLabel }));
  // Groups already in order of stage: the current stage leads, closed stages fold away to the end.
  if (by === 'stage') groups.sort((a, b) => (b.hint === 'עכשיו') - (a.hint === 'עכשיו') || (a.hint === 'נסגר') - (b.hint === 'נסגר'));
  return html`<div class="board2">
    <${BoardBar} search=${search} setSearch=${setSearch} people=${[p.manager, ...p.partners]} who=${who} setWho=${setWho} groupBy=${by} setGroupBy=${setBy} groupOptions=${BOARD_GROUPS} showDone=${showDone} setShowDone=${setShowDone}
      onAddPerson=${mgr && !p.personal && isOpen(p) ? () => openSheet('partner', { id: p.id }) : null} />
    <${TaskTable} key=${by} groups=${groups} star=${leads(p)} scope=${p.id} memory=${`m.board.${p.id}.${by}`} cols=${by === 'stage' ? ['owner', 'status', 'priority', 'due'] : ['owner', 'status', 'priority', 'due', 'stage']} empty="אין משימות שמתאימות לחיפוש." />
  </div>`;
}

// Outputs go in from whoever is in the project or manages it (canAddOutput), and a meeting is recorded by whoever is in
// it while it is open (store.meetingProjects). In a project that is all on the classified network, only pointers.
function ProjectOutputs({ p }) {
  useStore();
  const outs = projectOutputs(p.id);
  const note = placeOf(p) === 'there' ? 'בפרויקט שכולו ברשת המסווגת מוסיפים רק מצביע: שם ומיקום, בלי התוכן.'
    : isRestricted(p) ? 'בפרויקט שמור/סודי מעלים רק חומר בלמ"ס. לחומר שברשת המסווגת מוסיפים מצביע: שם ומיקום, בלי התוכן.' : 'כל תוצר כאן נגיש לכל השותפים בפרויקט.';
  return html`<div class="sec">
    <div class="board2-bar"><div class="grow muted small">${note}</div>
      ${inProject(p) && isOpen(p) ? html`<button type="button" class="btn" onClick=${() => openSheet('meeting', { project: p.id })}><${Icon} name="mic" size=${16} />הקלטת פגישה</button>` : null}
      ${canAddOutput(p) ? html`<button type="button" class="btn btn-primary" onClick=${() => openSheet('newoutput', { project: p.id })}><${Icon} name="plus" size=${16} />תוצר</button>` : null}</div>
    ${outs.length ? html`<div class="ogrid">${outs.map((o) => html`<${OutputCard} key=${o.id} o=${o} showProject=${false} />`)}</div>` : html`<${Empty} icon="file">עוד אין תוצרים.</${Empty}>`}
  </div>`;
}

function Log({ p, mgr }) {
  useStore();
  const [kind, setKind] = useState('decision');
  const [text, setText] = useState('');
  // Only the lines this viewer may read: none about an ask for outside partners, and the line of a readiness taken from
  // a linked בדה"ת only for whoever sees it in full (store.projectLog).
  const log = projectLog(p.id);
  const member = mgr || p.partners.includes(getState().me);
  return html`<div class="sec">
    ${member ? html`<form class="log-add" onSubmit=${(e) => { e.preventDefault(); if (text.trim()) { addLog(p.id, { kind, text: text.trim() }); setText(''); } }}>
      <${Seg} label="סוג" value=${kind} onChange=${setKind} options=${[{ id: 'decision', label: 'החלטה' }, { id: 'assumption', label: 'הנחה או סיכון' }]} />
      <input class="input" value=${text} onInput=${(e) => setText(e.currentTarget.value)} placeholder=${kind === 'decision' ? 'מה הוחלט, ולמה' : 'מה אנחנו מניחים, ומה יקרה אם זה לא נכון'} aria-label="תוכן" />
      <button type="submit" class="btn btn-primary" disabled=${!text.trim()}>רישום</button></form>` : null}
    ${log.length ? html`<div class="group">${log.map((l) => html`<div class="log-row">
      <span class=${'log-ic ' + l.kind}><${Icon} name=${l.kind === 'decision' ? 'decision' : 'bulb'} size=${15} /></span>
      <div class="grow"><div>${l.text}</div><div class="muted small">${person(l.who).name} · ${ago(l.at)}${l.gate ? ' · החלטת שער' : ''}${l.kind === 'decision' && l.reversible === false ? ' · לא הפיכה' : ''}</div></div>
    </div>`)}</div>` : html`<${Empty} icon="decision">עוד לא נרשמו החלטות או הנחות.</${Empty}>`}
  </div>`;
}

// The commander replaces a manager (החלפה): the old one stays in the team as a partner, with their work and their
// stars, and only taking them out (×) hands it over. The commander, who sees every project anyway, steps out instead,
// and his own open work there becomes his asks to the new manager (store.updateProject).
function People({ p, mgr }) {
  useStore();
  const ids = [p.manager, ...p.partners];
  const there = placeOf(p) === 'there'; // outside partners stay on the list, without access while it is all there
  const remove = (id) => updateProject(p.id, { partners: p.partners.filter((x) => x !== id) });
  const replace = (m) => m !== p.manager && updateProject(p.id, { manager: m, partners: [...p.partners.filter((q) => q !== m), ...(isCommander(p.manager) ? [] : [p.manager])] });
  return html`<div class="sec">
    <div class="group">${ids.map((id) => { const x = person(id); return html`<div class="person-row">
      <${Avatar} id=${id} size=${36} />
      <div class="grow"><strong>${x.name}</strong><div class="muted small">${id === p.manager ? 'מנהל/ת הפרויקט' : 'שותף/ה'}${x.role === 'external' ? ` · ${x.org || 'מחוץ לצוות'}` : ''}${x.role === 'external' ? (there ? ' · בלי גישה כאן כל עוד הכול ברשת המסווגת' : x.account ? ' · עובד/ת במערכת, רק בפרויקטים שלו' : ' · לא משתמש/ת במערכת') : ''}</div></div>
      ${id === p.manager && isCommander() ? html`<button type="button" class="btn sm" onClick=${(e) => openMenu(e, team().map((t) => ({ id: t.id, label: t.name, person: t.id })), { selected: p.manager, onPick: replace })}>החלפה</button>` : null}
      ${id !== p.manager && mgr ? html`<button type="button" class="icon-btn sm danger" aria-label=${`להוציא את ${x.name}`} onClick=${() => remove(id)}><${Icon} name="x" size=${16} /></button>` : null}
    </div>`; })}</div>
    ${mgr && !p.personal && isOpen(p) ? html`<button type="button" class="btn" onClick=${() => openSheet('partner', { id: p.id })}><${Icon} name="plus" size=${16} />הוספת שותף</button>` : null}
  </div>`;
}
