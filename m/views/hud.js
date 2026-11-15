// Jarvis's home: the first screen of the system, on the phone (the orb in the middle of the tab bar) and on desktop.
// A heads-up display around a reactor: what waits for me in its core, the systems Jarvis is connected to in orbit around
// it, and beside it what needs attention, what waits, today, and what changed. Every number comes from the same store
// helpers the other screens use, so it never says something "היום שלי" doesn't. The big rings only turn; nothing a
// finger holds moves on a timer (CLAUDE.md), and with reduced motion they stand still.
import { useEffect, useState } from 'preact/hooks';
import { html, Icon, Pill, dueWord, dayDiff, ago, isoDay } from '../ui.js';
import { useStore, openSheet, closeSheet, person, project, isCommander, leads, isOpen, teamProjects, myTasks, projectTasks, visibleOutputs, visibleProjects,
  commanderQueue, asksWaiting, asksReady, movedProjects, stagesReady, updatesDue, waitingCount, canSeeDetail, getState } from '../store.js';
import { needsCommander, status, currentStage, HEALTH } from '../card.js';
import { useGcal } from '../gcal.js';
import { links, connected, linkable, LINK_STATE, CHECKED } from '../jarvis-links.js';
import { openJarvis } from './jarvis.js';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
const hello = () => { const h = new Date().getHours(); return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : 'ערב טוב'; };
const two = (n) => String(n).padStart(2, '0');
const count = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20e3); return () => clearInterval(t); }, []);
  return now;
}

// ---------- what the screen says ----------
// What needs attention, worst first: for the commander his queue; for everyone their own late and stuck tasks; for a
// project's lead also what is stuck with others, an outside commitment at risk, and the project's own health.
export function attention() {
  const s = getState();
  const out = [];
  const seen = new Set();
  const push = (x) => { if (!seen.has(x.key)) { seen.add(x.key); out.push(x); } };
  const task = (id) => () => openSheet('task', { id });
  if (isCommander()) {
    for (const q of commanderQueue()) {
      push({ key: q.task ? `t:${q.task}` : `q:${q.project}:${q.kind}:${q.stage || ''}`, tone: q.kind === 'gate' || q.kind === 'senior' || q.kind === 'talk' ? 'warn' : 'bad',
        icon: 'flag', title: q.text, sub: `${q.why} · ${project(q.project).name}`, open: q.task ? task(q.task) : null, href: `#/project/${q.project}` });
    }
  }
  const mine = myTasks().filter((t) => t.status !== 'done');
  for (const t of mine) {
    const p = project(t.project);
    if (t.status === 'stuck') push({ key: `t:${t.id}`, tone: 'bad', icon: 'octagon', title: t.title, sub: ['תקועה אצלך', p?.name].filter(Boolean).join(' · '), open: task(t.id) });
    else if (t.due && dayDiff(t.due) < 0) push({ key: `t:${t.id}`, tone: 'bad', icon: 'clock', title: t.title, sub: [`באיחור · ${dueWord(t.due)}`, p?.name].filter(Boolean).join(' · '), open: task(t.id) });
  }
  for (const p of visibleProjects().filter((x) => leads(x) && isOpen(x) && !x.personal)) {
    const tasks = projectTasks(p.id);
    for (const t of tasks) {
      if (t.status === 'stuck' && t.owner !== s.me) push({ key: `t:${t.id}`, tone: 'bad', icon: 'octagon', title: t.title, sub: `תקועה אצל ${person(t.owner).name} · ${p.name}`, open: task(t.id) });
    }
    for (const q of needsCommander(p, tasks)) {
      if (q.kind === 'commit') push({ key: `t:${q.task}`, tone: q.why.includes('באיחור') ? 'bad' : 'warn', icon: 'send', title: q.text, sub: `${q.why} · ${p.name}`, open: task(q.task) });
    }
    const h = status(p).health;
    if (h === 'stuck' || h === 'risk') push({ key: `h:${p.id}`, tone: h === 'stuck' ? 'bad' : 'warn', icon: 'alert', title: p.name, sub: `הפרויקט ${HEALTH[h].label}${p.confNote ? ` · ${p.confNote}` : ''}`, href: `#/project/${p.id}` });
  }
  return out.sort((a, b) => (a.tone === 'bad' ? 0 : 1) - (b.tone === 'bad' ? 0 : 1));
}

// What waits for me, row for row as "היום שלי" lists it (store.waitingCount counts the same rows).
function waiting() {
  const out = [];
  for (const t of asksWaiting()) out.push({ key: `a:${t.id}`, icon: 'flag', title: t.title, sub: [`בקשה מ${person(t.by).name}`, t.due ? `עד ${dueWord(t.due)}` : null].filter(Boolean).join(' · '), open: () => openSheet('task', { id: t.id }) });
  for (const t of asksReady()) out.push({ key: `r:${t.id}`, icon: 'check', title: t.title, sub: 'כל המשימות של הבקשה בוצעו · לסגור?', open: () => openSheet('task', { id: t.id }) });
  const moved = movedProjects();
  if (moved.length) out.push({ key: 'moved', icon: 'list', title: 'סדר העדיפויות השתנה', sub: moved.map((p) => `${p.name}: מקום ${p.rank}`).join(' · '), href: '#/overview' });
  for (const p of stagesReady()) out.push({ key: `s:${p.id}`, icon: 'check', title: `לסגור את שלב ${currentStage(p).name}?`, sub: `כל המשימות בוצעו · ${p.name}`, open: () => openSheet('gate', { id: p.id }) });
  for (const p of updatesDue()) out.push({ key: `w:${p.id}`, icon: 'hill', title: 'עדכון שבועי', sub: `${p.name} · חצי דקה`, open: () => openSheet('weekly', { id: p.id }) });
  return out;
}

// What changed lately in what I may see: outputs, decisions, closed stages, finished tasks.
function updates() {
  const out = [];
  for (const o of visibleOutputs()) out.push({ key: `o:${o.id}`, at: o.at, icon: 'file', title: o.title, sub: `תוצר · ${person(o.by).name} · ${project(o.project)?.name || ''}`, open: () => openSheet('output', { id: o.id }) });
  for (const p of visibleProjects().filter((x) => canSeeDetail(x))) {
    for (const l of p.log || []) if (l.kind === 'decision') out.push({ key: `l:${l.id}`, at: l.at, icon: 'decision', title: l.text, sub: `החלטה · ${person(l.who).name} · ${p.name}`, href: `#/project/${p.id}` });
    for (const st of p.stages) if (st.closedAt) out.push({ key: `c:${p.id}:${st.id}`, at: st.closedAt, icon: 'check', title: `נסגר שלב ${st.name}`, sub: p.name, href: `#/project/${p.id}` });
    for (const t of projectTasks(p.id)) if (t.status === 'done' && t.doneAt) out.push({ key: `d:${t.id}`, at: t.doneAt, icon: 'checklist', title: t.title, sub: `בוצע · ${person(t.owner).name} · ${p.name}`, open: () => openSheet('task', { id: t.id }) });
  }
  return out.filter((x) => x.at).sort((a, b) => new Date(b.at) - new Date(a.at));
}

// ---------- the reactor ----------
const polar = (r, deg) => { const a = (deg * Math.PI) / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
const arc = (r, from, to) => { const [x1, y1] = polar(r, from); const [x2, y2] = polar(r, to); return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };
const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
const ORBIT = 164; // of 200: where the systems sit

function Reactor({ list, n, onTime }) {
  const C = 2 * Math.PI * 100;
  return html`<div class="rx">
    <svg class="rx-svg" viewBox="-200 -200 400 400" aria-hidden="true">
      <defs><radialGradient id="rx-glow"><stop offset="0" stop-color="var(--hud)" stop-opacity="0.34" /><stop offset="0.62" stop-color="var(--hud)" stop-opacity="0.1" /><stop offset="1" stop-color="var(--hud)" stop-opacity="0" /></radialGradient></defs>
      <circle r="150" fill="url(#rx-glow)" />
      <g class="rx-spin slow">${TICKS.map((d) => { const [x1, y1] = polar(d % 30 ? 193 : 188, d); const [x2, y2] = polar(197, d); return html`<line key=${d} class=${d % 30 ? 'rx-tick' : 'rx-tick big'} x1=${x1.toFixed(1)} y1=${y1.toFixed(1)} x2=${x2.toFixed(1)} y2=${y2.toFixed(1)} />`; })}</g>
      <circle class="rx-orbit" r=${ORBIT} />
      ${list.map((l, i) => { const d = -90 + (360 / list.length) * i; const [x1, y1] = polar(126, d); const [x2, y2] = polar(ORBIT - 19, d); return html`<line key=${l.id} class=${`rx-link s-${l.state}`} x1=${x1.toFixed(1)} y1=${y1.toFixed(1)} x2=${x2.toFixed(1)} y2=${y2.toFixed(1)} />`; })}
      <g class="rx-spin back"><path class="rx-arc thin" d=${arc(132, 10, 70)} /><path class="rx-arc thin" d=${arc(132, 130, 200)} /><path class="rx-arc thin" d=${arc(132, 250, 320)} /></g>
      <g class="rx-spin"><path class="rx-arc" d=${arc(118, 0, 100)} /><path class="rx-arc" d=${arc(118, 120, 220)} /><path class="rx-arc" d=${arc(118, 240, 340)} /></g>
      <circle class="rx-track" r="100" />
      <circle class="rx-prog" r="100" transform="rotate(-90)" stroke-dasharray=${`${(C * onTime).toFixed(1)} ${C.toFixed(1)}`} />
      <circle class="rx-core" r="86" />
      <circle class="rx-core-in" r="74" />
    </svg>
    <button type="button" class="rx-center" onClick=${openJarvis} aria-label=${`${count(n, 'דבר אחד מחכה', 'דברים מחכים')} לך. לדבר עם ג׳ארביס`}>
      <b>${two(n)}</b><span>${n === 1 ? 'מחכה לך' : 'מחכים לך'}</span><small>${Math.round(onTime * 100)}% בזמן</small>
    </button>
    ${list.map((l, i) => {
      // Around a circle, so by x and y on purpose: a ring reads the same in both directions.
      const [x, y] = polar((ORBIT / 200) * 50, -90 + (360 / list.length) * i);
      return html`<button type="button" key=${l.id} class=${`rx-node s-${l.state}`} style=${`left:${(50 + x).toFixed(2)}%;top:${(50 + y).toFixed(2)}%;--i:${i}`}
        aria-label=${`${l.name}: ${LINK_STATE[l.state].label}`} title=${`${l.name} · ${LINK_STATE[l.state].label}`} onClick=${() => openSheet('link', { id: l.id })}><${Icon} name=${l.icon} size=${17} /></button>`;
    })}
  </div>`;
}

function Gauge({ value, of, label, tone = '' }) {
  const C = 2 * Math.PI * 17;
  const f = of ? Math.min(1, value / of) : 0;
  return html`<div class=${'hud-gauge ' + tone}>
    <svg viewBox="-20 -20 40 40" aria-hidden="true"><circle class="g-track" r="17" /><circle class="g-val" r="17" transform="rotate(-90)" stroke-dasharray=${`${(C * f).toFixed(1)} ${C.toFixed(1)}`} /></svg>
    <b>${value}</b><span>${label}</span></div>`;
}

function Row({ x }) {
  const body = html`<span class=${'hud-ic ' + (x.tone || '')}><${Icon} name=${x.icon} size=${16} /></span>
    <span class="grow"><strong>${x.title}</strong><span>${x.sub}</span></span>${x.at ? html`<time>${ago(x.at)}</time>` : html`<${Icon} name="chevronLeft" size=${15} />`}`;
  return x.open ? html`<button type="button" class="hud-row" onClick=${x.open}>${body}</button>` : html`<a class="hud-row" href=${x.href}>${body}</a>`;
}

function Panel({ cls = '', title, n, more, children }) {
  return html`<section class=${'hud-panel ' + cls} aria-label=${title}>
    <header><h2>${title}</h2>${n != null ? html`<span class="hud-n">${two(n)}</span>` : null}</header>
    ${children}
    ${more ? html`<a class="hud-more" href=${more.href}>${more.text}<${Icon} name="chevronLeft" size=${14} /></a>` : null}
  </section>`;
}
const Quiet = ({ children }) => html`<p class="hud-quiet"><${Icon} name="check" size=${15} />${children}</p>`;

export function Hud() {
  const s = useStore();
  const now = useClock();
  const today = isoDay(now);
  const gc = useGcal(today, today);
  const list = links(gc.state);
  const att = attention();
  const wait = waiting();
  const waitN = waitingCount();
  // The core counts what "היום שלי" counts: the rows of מחכה לך, and for the commander his queue on top.
  const coreN = waitN + (isCommander() ? commanderQueue().length : 0);
  const feed = updates().slice(0, 4);
  const mine = myTasks().filter((t) => t.status !== 'done');
  const lateN = mine.filter((t) => t.due && dayDiff(t.due) < 0).length;
  const todayN = mine.filter((t) => t.due && dayDiff(t.due) === 0).length;
  const stuckN = att.filter((x) => x.icon === 'octagon').length;
  const projs = teamProjects().filter(isOpen);
  const onTrack = projs.filter((p) => status(p).health === 'on').length;
  const onTime = mine.length ? mine.filter((t) => t.status !== 'stuck' && !(t.due && dayDiff(t.due) < 0)).length / mine.length : 1;
  // Today and tomorrow, in order: the calendar's events for today (when it is connected) and my tasks.
  const agenda = [
    ...(gc.state === 'on' ? gc.events.filter((e) => e.day === today).map((e) => ({ key: `e:${e.id}`, when: e.allDay ? 'כל היום' : e.time, title: e.title, sub: 'יומן Google', kind: 'ev', sort: e.allDay ? '00:00' : e.time })) : []),
    ...mine.filter((t) => t.due && dayDiff(t.due) >= 0 && dayDiff(t.due) <= 1).sort((a, b) => dayDiff(a.due) - dayDiff(b.due))
      .map((t) => ({ key: `t:${t.id}`, when: dayDiff(t.due) ? 'מחר' : 'היום', title: t.title, sub: t.personal ? 'אישי' : project(t.project)?.name || '', kind: t.status, id: t.id, sort: dayDiff(t.due) ? '99' : '24' })),
  ].sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
  const say = [waitN ? count(waitN, 'דבר אחד מחכה לך', 'דברים מחכים לך') : null, att.length ? count(att.length, 'אחד דורש תשומת לב', 'דורשים תשומת לב') : null,
    todayN ? count(todayN, 'משימה אחת להיום', 'משימות להיום') : null].filter(Boolean);
  const voice = list.find((l) => l.id === 'voice');
  const on = connected(list);
  return html`<div class="page hud">
    <header class="hud-head">
      <div class="hud-eyebrow"><span class="hud-live" aria-hidden="true"></span>ג׳ארביס · יום ${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} · <time>${two(now.getHours())}:${two(now.getMinutes())}</time></div>
      <h1>${hello()}, ${person(s.me).name}</h1>
      <p class="hud-say">${say.length ? say.join(', ') + '.' : 'הכול שקט. שום דבר לא מחכה לך כרגע.'}</p>
    </header>

    <div class="hud-grid">
      <section class="hud-core" aria-label="ג׳ארביס">
        <${Reactor} list=${list} n=${coreN} onTime=${onTime} />
        <button type="button" class="btn hud-talk" onClick=${openJarvis}><${Icon} name="mic" size=${17} />לדבר עם ג׳ארביס</button>
        <span class="hud-voice">${voice.state === 'on' ? 'הקול מחובר' : `הקול עוד לא פעיל · ${on} מתוך ${linkable(list)} מערכות מחוברות`}</span>
        <div class="hud-gauges" role="group" aria-label="מדדים">
          <${Gauge} value=${lateN} of=${mine.length} label="באיחור" tone=${lateN ? 'bad' : ''} />
          <${Gauge} value=${todayN} of=${mine.length} label="להיום" />
          <${Gauge} value=${stuckN} of=${Math.max(stuckN, mine.length)} label="תקועות" tone=${stuckN ? 'bad' : ''} />
          <${Gauge} value=${onTrack} of=${projs.length} label=${`מ-${projs.length} במסלול`} tone="ok" />
        </div>
      </section>

      <div class="hud-col a">
        <${Panel} cls="p-att" title="דורש תשומת לב" n=${att.length} more=${att.length > 4 ? { href: isCommander() ? '#/overview' : '#/today', text: `עוד ${att.length - 4}` } : null}>
          ${att.length ? att.slice(0, 4).map((x) => html`<${Row} key=${x.key} x=${x} />`) : html`<${Quiet}>אין חסמים ואין איחורים.</${Quiet}>`}
        </${Panel}>
        <${Panel} cls="p-wait" title="מחכה לך" n=${wait.length} more=${wait.length > 4 ? { href: '#/today', text: `עוד ${wait.length - 4}` } : null}>
          ${wait.length ? wait.slice(0, 4).map((x) => html`<${Row} key=${x.key} x=${x} />`) : html`<${Quiet}>אף אחד לא מחכה לך.</${Quiet}>`}
        </${Panel}>
      </div>

      <div class="hud-col b">
        <${Panel} cls="p-sys" title="מערכות מחוברות" n=${on}>
          <div class="hud-sys">${list.map((l) => html`<button type="button" key=${l.id} class=${`sys s-${l.state}`} onClick=${() => openSheet('link', { id: l.id })}>
            <span class="sys-ic"><${Icon} name=${l.icon} size=${16} /></span><span class="grow"><strong>${l.short}</strong><span><i class="sys-dot"></i>${LINK_STATE[l.state].label}</span></span></button>`)}</div>
          <p class="hud-foot">מצב החיבורים נבדק ב-${CHECKED.slice(8)}/${CHECKED.slice(5, 7)}. היומן והמערכת מתעדכנים בזמן אמת.</p>
        </${Panel}>
        <${Panel} cls="p-day" title="היום ומחר" n=${agenda.length} more=${{ href: '#/calendar', text: 'ליומן' }}>
          ${agenda.length ? html`<ol class="hud-day">${agenda.slice(0, 5).map((a) => html`<li key=${a.key} class=${'k-' + a.kind}>
            <time>${a.when}</time>${a.id ? html`<button type="button" class="grow" onClick=${() => openSheet('task', { id: a.id })}><strong>${a.title}</strong><span>${a.sub}</span></button>` : html`<span class="grow"><strong>${a.title}</strong><span>${a.sub}</span></span>`}</li>`)}</ol>`
            : html`<${Quiet}>אין משימות להיום ולמחר.</${Quiet}>`}
        </${Panel}>
      </div>

      <${Panel} cls="p-feed" title="עדכונים אחרונים" more=${{ href: '#/outputs', text: 'לכל התוצרים' }}>
        ${feed.length ? html`<div class="hud-feed">${feed.map((x) => html`<${Row} key=${x.key} x=${x} />`)}</div>` : html`<${Quiet}>אין עדכונים חדשים.</${Quiet}>`}
      </${Panel}>
    </div>
  </div>`;
}

// One system's sheet: its state, what Jarvis sees there, what he does, and what is missing.
export function LinkBody({ id }) {
  const today = isoDay(new Date());
  const gc = useGcal(today, today);
  const l = links(gc.state).find((x) => x.id === id);
  if (!l) return null;
  const st = LINK_STATE[l.state];
  return html`<div class="form link-sheet">
    <div class="link-top"><span class=${`sys-ic lg s-${l.state}`}><${Icon} name=${l.icon} size=${24} /></span>
      <div class="grow"><h3>${l.name}</h3><${Pill} color=${st.color}>${st.label}</${Pill}></div></div>
    ${l.note ? html`<p class="link-note">${l.note}</p>` : null}
    <dl class="link-dl">
      <div><dt><${Icon} name="eye" size=${15} />מה ג׳ארביס רואה</dt><dd>${l.reads}</dd></div>
      <div><dt><${Icon} name="shieldCheck" size=${15} />מה הוא עושה</dt><dd>${l.acts}</dd></div>
      ${l.missing && l.state !== 'on' ? html`<div><dt><${Icon} name="plug" size=${15} />מה חסר</dt><dd>${l.missing}</dd></div>` : null}
    </dl>
    ${l.id === 'gcal' && l.state !== 'on' ? html`<a class="btn btn-primary block" href="#/calendar" onClick=${closeSheet}>לעמוד היומן</a>` : null}
    <p class="muted small">${l.live ? 'החיבור הזה נבדק בזמן אמת.' : `נבדק ביד ב-${CHECKED.slice(8)}/${CHECKED.slice(5, 7)}. כשג׳ארביס ידווח בעצמו, המצב כאן יתעדכן לבד.`}</p>
  </div>`;
}
