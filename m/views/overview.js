// מצב: first only what needs the commander (the kinds in card.KIND_ORDER, each with its reason, then by the project's
// place), then the order of the team's projects: one fixed line each, read off its ID card, with the asks the
// commander sent under it. The deputy reads all of it without acting on it; the team reads the order and the asks.
// Nothing here asks anyone for a report.
import { useState, useRef } from 'preact/hooks';
import { html, Icon, Avatar, Classified, Health, StageStrip, Empty, ProjectTag, RankCap, AskPill, Pill, Seg, askSeen, askWords, useFlip, keepFocus, ago, dueWord } from '../ui.js';
import { useStore, orderedProjects, rankedProjects, commanderQueue, isCommander, isCommand, commander, person, project, me, openSheet, approveGate, talked,
  lineAsks, orderStamp, leads, canSeeDetail, typeOf } from '../store.js';
import { status, HILL, cardFill, inOrder, DOMAINS, PYRAMID_ORDER, domainTitle, lockedWhere, briefLine, briefParts, inValley } from '../card.js';

const KIND = {
  gate: { icon: 'shield', color: 'var(--s-waiting)' },
  senior: { icon: 'flag', color: 'var(--h-off)' },
  late: { icon: 'clock', color: 'var(--h-risk)' },
  commit: { icon: 'send', color: 'var(--h-off)' },
  talk: { icon: 'message', color: 'var(--s-waiting)' },
  asklate: { icon: 'clock', color: 'var(--h-off)' },
};

// Who set the order and when, for the line under its title here and on the portfolio. The first order (the sample's,
// or one a saved state got on load) carries no name until the commander moves a project.
export function orderLine() {
  const st = orderStamp();
  return st ? `נקבע ע״י ${person(st.by).name} · עודכן ${ago(st.at)}` : rankedProjects().length ? 'הסדר ההתחלתי · עוד לא שונה' : 'עוד לא נקבע סדר';
}

// ---------- the pyramid (design §6.5), here and on פרויקטים ----------
// A project's domain, or null ("בלי רובד") when it has none or one the code no longer knows.
export const domainOf = (p) => (DOMAINS.some((d) => d.id === p.domain) ? p.domain : null);
// The groups of the pyramid: the four tiers and the two side areas in PYRAMID_ORDER, then "בלי רובד". Each keeps its
// projects in the order they came in, and says whether it is a tier (shown even when empty here) or a side group.
export function pyramidGroups(list) {
  return [...PYRAMID_ORDER, null].map((id) => {
    const d = DOMAINS.find((x) => x.id === id) || null;
    return { id: id || 'none', name: domainTitle(id), hint: d?.hint || null, tier: !!d && !d.side, list: list.filter((p) => domainOf(p) === id) };
  });
}
// "עם Claude" on the row of a Claude-type project. The type is part of the one line, so a locked line shows it too.
export function ClaudeCap({ p }) {
  const t = typeOf(p);
  return t && (t.id === 'claude' || t.link === 'next') ? html`<${Pill} color="var(--claude)" cls="py-claude">עם Claude</${Pill}>` : null;
}
// The brief line read out in words, from the same parts as briefLine (card.briefParts); a part without a value is left out.
function briefWords(p) {
  const b = briefParts(p);
  return [b.trl && `מוכנות היום ${b.trl}`, b.target && `היעד ${b.target}`, b.commit && `מחויבות היעד: ${b.commit}`].filter(Boolean).join(', ');
}
// For whoever sees the project in full: the brief line ("TRL 3 → 6 · כוונה") and the valley mark. Neither is ever on a
// locked line (card.sees), so the callers render it only with canSeeDetail.
export function Brief({ p }) {
  const line = briefLine(p);
  const valley = inValley(p);
  if (!line && !valley) return null;
  return html`<span class="py-brief">${line ? html`<bdi dir="ltr" class="py-trl" role="img" aria-label=${briefWords(p)}>${line}</bdi>` : null}${valley ? html`<span class="valley">עוד אין גוף קולט</span>` : null}</span>`;
}

// How מצב shows the order: as it is, or by the pyramid. Remembered on this device; the page works without storage.
const VIEW_KEY = 'm.ov.view';
const VIEWS = [{ id: 'order', label: 'לפי הסדר' }, { id: 'pyramid', label: 'לפי הפירמידה' }];
const savedView = () => { try { return localStorage.getItem(VIEW_KEY) === 'pyramid' ? 'pyramid' : 'order'; } catch (e) { return 'order'; } };

export function Overview() {
  useStore();
  const cmd = isCommander();
  const boss = commander();
  // The deputy sees the commander's queue as it is, with nothing to press.
  const queue = isCommand() ? commanderQueue() : [];
  const projects = orderedProjects();
  const ext = me().role === 'external';
  const [view, setViewRaw] = useState(savedView);
  const setView = (v) => { setViewRaw(v); try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* storage blocked */ } };
  const pyramid = !ext && view === 'pyramid'; // outside partners read only their own projects, in the order
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
      <div class=${'sec-head' + (ext ? '' : ' py-ohead')}><h2>${ext ? 'הפרויקטים שלי' : 'סדר העדיפויות'}</h2><span class="muted small">${ext ? 'נקרא מתעודת הזהות של כל פרויקט' : orderLine()}</span>
        ${ext ? null : html`<${Seg} label="תצוגה" value=${view} onChange=${setView} options=${VIEWS} cls="py-view" />`}</div>
      ${pyramid ? html`<${Pyramid} projects=${projects} />`
        : projects.length ? html`<${Order} projects=${projects} ext=${ext} />` : html`<${Empty} icon="layers">אין פרויקטים פעילים.</${Empty}>`}
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

// The reasons in the queue speak to the commander ("שלך"); the deputy reads them about him.
const ABOUT = { gate: (boss) => `שער שמחכה לאישור של ${boss.name}`, asklate: (boss) => `בקשה של ${boss.name} באיחור` };

function QueueRow({ q, act }) {
  const k = KIND[q.kind];
  const p = project(q.project);
  const mgr = person(p.manager);
  // A button that settles the row takes it away, so focus goes on to the next one (ui.keepFocus).
  const settle = (f) => (e) => { keepFocus(e, '.qrow'); f(); };
  const acts = act ? {
    gate: html`<button type="button" class="btn btn-primary sm" onClick=${settle(() => approveGate(q.project))}>לאשר</button>
      <button type="button" class="btn sm" onClick=${() => openSheet('return', { id: q.project })}>להחזיר עם הכוונה</button>`,
    senior: html`<button type="button" class="btn btn-primary sm" onClick=${() => openSheet('resolve', { id: q.project })}>טיפלתי</button>`,
    late: leads(p) ? null : html`<button type="button" class="btn sm" onClick=${() => openSheet('ask', { id: q.project })}>בקשה ל${mgr.name}</button>`,
    commit: q.task ? html`<button type="button" class="btn sm" onClick=${() => openSheet('task', { id: q.task })}>לפתוח</button>` : null,
    talk: html`<button type="button" class="btn btn-primary sm" onClick=${settle(() => talked(q.task))}>דיברנו</button>`,
    asklate: html`<button type="button" class="btn sm" onClick=${() => openSheet('task', { id: q.task })}>לפתוח</button>`,
  }[q.kind] : null;
  const why = !act && ABOUT[q.kind] ? ABOUT[q.kind](commander()) : q.why;
  return html`<div class="qrow">
    <span class="q-ic" style=${`--c:${k.color}`}><${Icon} name=${k.icon} size=${16} /></span>
    <div class="grow"><div class="q-why">${why}${q.by ? html` <span class="muted">· עד ${dueWord(q.by)}</span>` : null}</div><div>${q.text}</div>
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

// "לפי הפירמידה": the four tiers always, each with its count, since an empty tier is information too; the side areas
// and "בלי רובד" only when they hold a project. Inside a group the projects keep their order and their line, and
// each group's order moves on its own spring.
// A screen reader hears the count with the group's heading, in words; the capsule beside it is for the eye.
const countWords = (n) => (n === 0 ? 'אין פרויקטים' : n === 1 ? 'פרויקט אחד' : `${n} פרויקטים`);
function Pyramid({ projects }) {
  const groups = pyramidGroups(projects).filter((g) => g.tier || g.list.length);
  return html`<div class="py-tiers">${groups.map((g) => html`<section class="py-tier" key=${g.id}>
    <div class="py-head"><h3>${g.name}<span class="sr">, ${countWords(g.list.length)}</span></h3><span class="py-n" aria-hidden="true">${g.list.length}</span></div>
    ${g.list.length ? html`<${Order} projects=${g.list} ext=${false} />` : html`<p class="py-empty">אין כרגע פרויקטים ברובד הזה</p>`}
  </section>`)}</div>`;
}

// The project's one line as a stretched link to its page; its place, its asks and the commander's + sit above the link.
// A restricted project shows those outside it only its one line: name, manager, stage (lockedWhere), health, place and
// type, with no hill, no last update, no stage names (StageStrip bare), no brief line and no valley mark.
function ProjectLine({ p, ext }) {
  const st = status(p);
  const open = canSeeDetail(p);
  const fill = cardFill(p);
  const asks = lineAsks(p.id); // the open asks, then for three days one that was done ("בוצעה")
  const ask = isCommander() && !leads(p);
  const mgr = person(p.manager);
  return html`<div class=${'ov-line' + (ext ? '' : ' capped') + (ask ? ' can-ask' : '')} style=${`--bar:${p.color}`}>
    <div class="ovl-name">
      ${ext ? null : inOrder(p) ? html`<${RankCap} p=${p} />` : html`<span class="cap-gap" aria-hidden="true"></span>`}
      <div class="ovl-id"><a class="ovl-link" href=${`#/project/${p.id}`}><strong>${p.name}</strong></a>
        <span class="ovl-sub"><${Avatar} id=${p.manager} size=${18} /><span class="muted small">${mgr.name}</span><${Classified} p=${p} small /><${ClaudeCap} p=${p} /></span></div>
    </div>
    <div class="ovl-stage"><${StageStrip} p=${p} bare=${!open} /><span class="small">${open ? st.where : lockedWhere(st)}${st.pending ? html` · <b class="wait-t">מחכה לאישור</b>` : null}</span>${open ? html`<${Brief} p=${p} />` : null}</div>
    <div class="ovl-state"><${Health} p=${p} />${open ? html`<span class="muted small"><${Icon} name="hill" size=${12} /> ${HILL[p.hill || 'up'].short}</span>` : null}</div>
    <div class="ovl-meta">${open ? html`<span class=${'small' + (st.stale ? ' bad-t' : ' muted')}>${st.stale ? 'לא עודכן ' : 'עודכן '}${ago(p.lastUpdate)}</span><span class="muted small">${fill.done}/${fill.of} בתעודה</span>` : null}</div>
    ${ask ? html`<button type="button" class="ov-add" aria-label=${`בקשה חדשה ל${mgr.name}`} title=${`בקשה ל${mgr.name}`} onClick=${() => openSheet('ask', { id: p.id })}><${Icon} name="plus" size=${16} /></button>` : null}
    ${asks.length ? html`<div class="ovl-asks">${asks.map((t) => html`<button type="button" class="ov-ask" key=${t.id} aria-label=${`${t.title}, ${askLabel(t)}`} onClick=${() => openSheet('task', { id: t.id })}>
      <${AskPill} t=${t} /><span class="ov-ask-t">${t.title}</span></button>`)}</div>` : null}
  </div>`;
}
// An ask's state in words for a screen reader, after its title: "בעבודה 1 מתוך 3" rather than "1/3".
function askLabel(t) {
  const a = askSeen(t);
  return a.state === 'doing' ? `בעבודה ${a.n} מתוך ${a.m}` : askWords(a);
}
