// "מה מחכה לי": the top of the home page (spec). One queue of what needs this person now: decisions, Claude work
// waiting for review, human assignments, someone waiting on them, and external commitments coming due. Each item shows
// how long it has been waiting, and most can be closed right here. Personal views are open to the whole team.
import { useEffect, useState } from 'preact/hooks';
import {
  getState, me, person, updateTask, approveTask, returnTask, openTask, updateCommitment, openModal, openDecision, dismissSince, loadActivitySince,
  visibleTasks, answerReminder,
} from '../store.js';
import { html, Icon, Avatar, ProjectChip, AgeChip, Empty, RichText, StatusPill, pickPerson, humanPeople, navigate } from '../ui.js';
import { DecisionCard } from './decisions.js';
import { MyWork } from './mine.js';
import { waitingFor, HTYPE, commitmentWhen, counterpartOf, fromWhom, openDecisions, visibleCommitments, canSee, since, openReminder } from '../model.js';
import { longDate, greeting, timeAgo, dueLabel, today } from '../util.js';
import { activityLine, openActivity, visibleActivity } from '../activity.js';

function QCard({ type, icon, label, at, agePrefix = 'מחכה', project, due, children, tone }) {
  const late = due && due < today();
  return html`<article class=${'qcard q-' + type + (tone ? ' ' + tone : '')}>
    <header class="qc-top">
      <span class="qc-type"><${Icon} name=${icon} size=${14} />${label}</span>
      ${project ? html`<${ProjectChip} id=${project} />` : null}
      <${AgeChip} at=${at} prefix=${agePrefix} />
      ${due ? html`<span class=${'due-chip' + (late ? ' late' : '')}>${late ? 'באיחור · ' : 'עד '}${dueLabel(due)}</span>` : null}
    </header>
    ${children}
  </article>`;
}

function Review({ it }) {
  const t = it.t;
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  return html`<${QCard} type="review" icon="sparkle" label="Claude הגיש לבדיקה" at=${it.at} project=${t.project_id} due=${t.due}>
    <button type="button" class="qc-title" onClick=${() => openTask(t.id)}>${t.title}</button>
    ${t.done_def ? html`<p class="qc-line"><b>הגדרת סיום:</b> ${t.done_def}</p>` : null}
    ${t.evidence ? html`<p class="qc-line"><b>ראיות:</b> <${RichText} text=${t.evidence} /></p>`
      : html`<p class="qc-line warn"><${Icon} name="alert" size=${14} />לא צורפו ראיות. אפשר להחזיר לתיקון ולבקש קישור, קובץ או PR.</p>`}
    ${returning ? html`<form class="qc-return" onSubmit=${async (e) => { e.preventDefault(); await returnTask(t, note); setReturning(false); setNote(''); }}>
        <input class="input" value=${note} onInput=${(e) => setNote(e.currentTarget.value)} placeholder="מה לתקן?" aria-label="מה לתקן" autoFocus required />
        <button type="submit" class="btn btn-primary sm" disabled=${!note.trim()}>החזרה</button>
        <button type="button" class="btn sm" onClick=${() => setReturning(false)}>ביטול</button>
      </form>`
      : html`<div class="qc-actions">
        <button type="button" class="btn btn-primary sm" onClick=${() => approveTask(t)}><${Icon} name="check" size=${15} />אישור וסגירה</button>
        <button type="button" class="btn sm" onClick=${() => setReturning(true)}><${Icon} name="undo" size=${15} />החזרה לתיקון</button>
        <button type="button" class="btn sm ghost" onClick=${() => openTask(t.id)}>פרטים</button>
      </div>`}
  <//>`;
}

function Assignment({ it }) {
  const t = it.t;
  const ht = HTYPE[t.htype] || HTYPE.other;
  return html`<${QCard} type="assignment" icon=${ht.icon} label=${'מטלה: ' + ht.label} at=${it.at} agePrefix="פתוחה" project=${t.project_id} due=${t.due}>
    <button type="button" class="qc-title" onClick=${() => openTask(t.id)}>${t.title}</button>
    ${t.notes ? html`<p class="qc-line clamp"><${RichText} text=${t.notes} /></p>` : null}
    <div class="qc-actions">
      <button type="button" class="btn btn-primary sm" onClick=${() => updateTask(t.id, { status: 'done' })}><${Icon} name="check" size=${15} />בוצע</button>
      <button type="button" class="btn sm" onClick=${(e) => pickPerson(e.currentTarget, { selected: t.owner_id, include: humanPeople().filter((p) => p.is_team),
        onPick: (id) => id && updateTask(t.id, { owner_id: id }) })}><${Icon} name="user" size=${15} />העברה</button>
      <button type="button" class="btn sm ghost" onClick=${() => openTask(t.id)}>פרטים</button>
    </div>
  <//>`;
}

function Unblock({ it }) {
  const t = it.t;
  const owner = person(t.owner_id);
  return html`<${QCard} type="unblock" icon="octagon" label="מחכים לך" at=${it.at} project=${t.project_id} due=${t.due}>
    <p class="qc-who"><${Avatar} p=${owner} size=${20} /><span><b>${owner?.name || 'מישהו'}</b> מחכה לך</span></p>
    <button type="button" class="qc-title" onClick=${() => openTask(t.id)}>${t.title}</button>
    ${t.blocked_reason ? html`<p class="qc-line">${t.blocked_reason}</p>` : null}
    <div class="qc-actions">
      <button type="button" class="btn btn-primary sm" onClick=${() => updateTask(t.id, { status: 'in_progress' })}><${Icon} name="unlock" size=${15} />שוחרר</button>
      <button type="button" class="btn sm ghost" onClick=${() => openTask(t.id)}>פרטים</button>
    </div>
  <//>`;
}

function Commitment({ it }) {
  const c = it.c;
  const we = c.direction === 'we_owe';
  const reminder = openReminder(c);
  return html`<${QCard} type="commitment" icon="swap" label=${we ? `התחייבנו כלפי ${counterpartOf(c)}` : `מחכים ${fromWhom(counterpartOf(c))}`} at=${it.at} agePrefix="פתוחה" project=${c.project_id}
    tone=${c.due < today() ? 'late' : ''}>
    <button type="button" class="qc-title" onClick=${() => openModal('commitment', { id: c.id })}>${c.title}</button>
    <p class="qc-line"><b>${commitmentWhen(c)}</b>${c.contact ? ` · ${c.contact}` : ''}${reminder ? html` · <span class="qc-remind">תזכורת ${timeAgo(reminder.sent_at)}</span>` : null}</p>
    <div class="qc-actions">
      <button type="button" class="btn btn-primary sm" onClick=${() => updateCommitment(c.id, { status: 'done' })}><${Icon} name="check" size=${15} />${we ? 'נמסר' : 'התקבל'}</button>
      ${reminder ? html`<button type="button" class="btn sm" title="עונה לתזכורת: הכל בזמן" onClick=${() => answerReminder(c)}><${Icon} name="clock" size=${15} />בזמן</button>` : null}
      <button type="button" class="btn sm" onClick=${(e) => pickPerson(e.currentTarget, { selected: c.owner_id, include: humanPeople().filter((p) => p.is_team),
        onPick: (id) => id && updateCommitment(c.id, { owner_id: id }) })}><${Icon} name="user" size=${15} />העברה</button>
      <button type="button" class="btn sm ghost" onClick=${() => openModal('commitment', { id: c.id })}>עריכה</button>
    </div>
  <//>`;
}

function QueueItem({ it }) {
  if (it.type === 'decision') return html`<${DecisionCard} d=${it.d} />`;
  if (it.type === 'review') return html`<${Review} it=${it} />`;
  if (it.type === 'assignment') return html`<${Assignment} it=${it} />`;
  if (it.type === 'unblock') return html`<${Unblock} it=${it} />`;
  if (it.type === 'commitment') return html`<${Commitment} it=${it} />`;
  return null;
}

// "מאז שהיית כאן": after 12 hours or more away, what others changed meanwhile.
function SinceCard({ since }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { loadActivitySince(since).then(setRows).catch(() => setRows([])); }, [since]);
  const my = getState().auth?.me;
  const others = rows ? visibleActivity(rows).filter((a) => a.actor_id !== my) : [];
  const n = (pred) => others.filter(pred).length;
  const stats = rows ? [
    [n((a) => a.kind === 'decision_decided'), 'החלטות התקבלו'],
    [n((a) => a.kind === 'decision_new'), 'החלטות חדשות'],
    [n((a) => a.kind === 'status' && a.payload?.to === 'done'), 'הושלמו'],
    [n((a) => a.kind === 'status' && a.payload?.to === 'review'), 'הוגשו לבדיקה'],
    [n((a) => a.kind.startsWith('commitment_')), 'עדכוני התחייבויות'],
    [n((a) => a.kind === 'comment'), 'תגובות'],
  ].filter(([x]) => x) : [];
  return html`<section class="since card">
    <header class="card-head"><h2><${Icon} name="clock" size=${17} />מאז שהיית כאן</h2>
      <span class="muted small">${timeAgo(since)}</span><span class="grow"></span>
      <button type="button" class="icon-btn sm" aria-label="סגירת הסיכום" onClick=${dismissSince}><${Icon} name="x" size=${15} /></button></header>
    ${!rows ? html`<p class="muted">טוען…</p>` : others.length ? html`
      ${stats.length ? html`<div class="since-stats">${stats.map(([x, l]) => html`<span key=${l}><b>${x}</b> ${l}</span>`)}</div>` : null}
      <ul class="activity">${others.slice(0, 6).map((a) => html`<li key=${a.id}><button type="button" class="act-row" onClick=${() => openActivity(a)}>
        ${activityLine(a)}<span class="act-time">${timeAgo(a.at)}</span></button></li>`)}</ul>
      ${others.length > 6 ? html`<p class="muted small">ועוד ${others.length - 6} עדכונים. מה שמחכה לך מופיע למטה.</p>` : null}`
      : html`<p class="muted">לא השתנה כלום בזמן הזה.</p>`}
  </section>`;
}

// "מחכה לאחרים", folded under the queue: what this person handed off and is waiting to get back.
function waitingOnOthers(pid, s) {
  const out = [];
  visibleTasks(s).filter((t) => canSee(t, s) && t.owner_id === pid && (t.status === 'blocked' || t.status === 'waiting'))
    .forEach((t) => out.push({ key: 't' + t.id, at: since(t, ['blocked', 'waiting'], s), icon: 'octagon', title: t.title,
      who: person(t.blocked_by_person), what: t.blocked_reason || 'תקוע', open: () => openTask(t.id), t }));
  openDecisions(s).filter((d) => d.created_by === pid && d.assignee_id && d.assignee_id !== pid)
    .forEach((d) => out.push({ key: 'd' + d.id, at: d.created_at, icon: 'decision', title: d.title, who: person(d.assignee_id), what: 'החלטה', open: () => openDecision(d.id) }));
  visibleCommitments(s).filter((c) => c.owner_id === pid && c.status === 'open' && c.direction === 'they_owe')
    .forEach((c) => out.push({ key: 'c' + c.id, at: c.created_at, icon: 'swap', title: c.title, who: null, what: `${fromWhom(counterpartOf(c))}${c.due ? ` · ${commitmentWhen(c)}` : ''}`,
      open: () => openModal('commitment', { id: c.id }) }));
  return out.sort((a, b) => new Date(a.at) - new Date(b.at));
}

function WaitingOthers({ list }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return html`<section class="group waiting-others">
    <button type="button" class="group-head" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>
      <${Icon} name="chevronDown" size=${16} cls=${open ? '' : 'rot'} /><h2>מחכה לאחרים</h2><span class="count">${list.length}</span></button>
    ${open ? html`<div class="rows">${list.map((x) => html`<button type="button" class="wo-row" key=${x.key} onClick=${x.open}>
      ${x.t ? html`<${StatusPill} t=${x.t} size="sm" />` : html`<span class="wo-ic"><${Icon} name=${x.icon} size=${15} /></span>`}
      <span class="wo-main"><span class="wo-title">${x.title}</span><span class="wo-what">${x.who ? `מחכה ל${x.who.name}` : x.what}</span></span>
      <${AgeChip} at=${x.at} prefix="" /></button>`)}</div>` : null}
  </section>`;
}

// The queue in three parts (spec): to decide, to do, to review. Within each, what blocks someone comes first, then by date.
const PARTS = [
  { id: 'decide', title: 'להחליט', icon: 'decision', types: ['decision'] },
  { id: 'do', title: 'לעשות', icon: 'check', types: ['unblock', 'assignment', 'commitment'] },
  { id: 'review', title: 'לבדוק', icon: 'eye', types: ['review'] },
];
function blocksSomeone(x, s) {
  if (x.type === 'unblock') return true;
  if (x.type === 'decision') return !!x.d.unblocks || s.tasks.some((t) => t.decision_id === x.d.id && t.status !== 'done');
  return false;
}

export function Home({ s, pid }) {
  const my = s.auth?.me;
  const whoId = pid && s.people.some((p) => p.id === pid) ? pid : my;
  const self = whoId === my;
  const who = person(whoId);
  const m = me();
  const td = today();
  const dueRank = (x) => (!x.due ? 3 : x.due < td ? 0 : x.due === td ? 1 : 2);
  const items = waitingFor(whoId, s).sort((a, b) => (blocksSomeone(b, s) - blocksSomeone(a, s)) || dueRank(a) - dueRank(b) || new Date(a.at) - new Date(b.at));
  const late = items.filter((x) => x.due && x.due < td).length;
  const others = waitingOnOthers(whoId, s);
  const inQueue = new Set(items.filter((x) => x.t).map((x) => x.t.id));
  const switchWho = (e) => pickPerson(e.currentTarget, {
    selected: whoId, include: s.people.filter((p) => p.is_team),
    onPick: (id) => navigate(id && id !== my ? '#/home/' + id : '#/home'),
  });
  return html`<div class="page home">
    <header class="page-head">
      <div><p class="eyebrow">${longDate()}</p>
        <h1>${self ? `${greeting()}${m ? `, ${m.name}` : ''}` : `מה מחכה ל${who?.name || ''}`}</h1></div>
      <div class="head-actions">
        <button type="button" class="who-switch" onClick=${switchWho} aria-label="להציג את התור של חבר צוות אחר">
          <span class="muted">התור של</span><${Avatar} p=${who} size=${22} /><b>${self ? 'שלי' : who?.name}</b><${Icon} name="chevronDown" size=${14} /></button>
      </div>
    </header>
    ${self && s.since ? html`<${SinceCard} since=${s.since} />` : null}

    <section class="queue">
      <header class="section-head"><h2>${self ? 'מה מחכה לי' : `מה מחכה ל${who?.name || ''}`}</h2>
        <span class="muted small">${items.length ? `${items.length} פריטים${late ? ` · ${late} באיחור` : ''}` : ''}</span></header>
      ${items.length ? PARTS.map((part) => {
        const list = items.filter((x) => part.types.includes(x.type));
        return list.length ? html`<div class=${'qpart q-' + part.id} key=${part.id}>
          <h3 class="qpart-head"><${Icon} name=${part.icon} size=${15} />${part.title}<span class="count">${list.length}</span></h3>
          <div class="qlist">${list.map((it) => html`<${QueueItem} key=${it.key} it=${it} />`)}</div></div>` : null;
      }) : html`<${Empty} title=${self ? 'אין כרגע שום דבר שמחכה לך' : 'אין כרגע שום דבר שמחכה'} icon="inbox">
            החלטות, בדיקות של עבודת Claude, מטלות והתחייבויות שמחכות יופיעו כאן, עם הזמן שהן מחכות.<//>`}
      <${WaitingOthers} list=${others} />
    </section>

    <${MyWork} s=${s} pid=${whoId} exclude=${inQueue} self=${self} />
  </div>`;
}
