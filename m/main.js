// The shell of the manual version: a floating sidebar on desktop; on phones a large title, a glass tab bar with Jarvis
// in its middle, and a + button beside it. Routes: #/today, #/projects, #/project/:id, #/calendar, #/overview, #/outputs.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html, Icon, Avatar, Sheet, Toasts, MenuLayer } from './ui.js';
import { QuickAdd } from './parts.js';
import { useStore, openSheet, closeSheet, person, isCommander, commanderQueue, myProjects, personalProjects, myTasks, asksWaiting, asksReady, waitingCount } from './store.js';
import { Today } from './views/today.js';
import { Projects, ProjectPage } from './views/projects.js';
import { Overview } from './views/overview.js';
import { Outputs, OutputSheetBody, NewOutputBody } from './views/outputs.js';
import { NewProjectBody, GateBody, ReturnBody, WeeklyBody, ResolveBody, AskBody, TaskBody, PartnerBody, WhoBody, MeetingBody } from './views/sheets.js';
import { Calendar, StageBody } from './views/calendar.js';
import { JarvisScreen, JarvisTab, JarvisSide } from './views/jarvis.js';
import { takeReturn } from './gcal.js';
import { dayDiff } from './ui.js';

const NAV = [
  { id: 'today', label: 'היום שלי', short: 'היום', icon: 'home' },
  { id: 'projects', label: 'פרויקטים', icon: 'layers' },
  { id: 'calendar', label: 'יומן', icon: 'calendar' },
  { id: 'overview', label: 'תמונת מצב', short: 'מצב', icon: 'gauge' },
  { id: 'outputs', label: 'תוצרים', icon: 'file' },
];
// The phone's bar holds four of them around Jarvis; outputs open from the projects page there.
const TABS = ['today', 'projects', 'jarvis', 'calendar', 'overview'];

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => { setHash(location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  // With no route, the commander starts from the picture of the whole team (as switchTo does); everyone else from their day.
  const [, name, arg] = (hash || '').split('/');
  return { name: name || (isCommander() ? 'overview' : 'today'), arg };
}

// The large title gives way to a compact one in the bar once it scrolls under it.
function useScrollState() {
  useEffect(() => {
    const f = () => { const y = window.scrollY; document.documentElement.dataset.scroll = y > 44 ? '2' : y > 2 ? '1' : '0'; };
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
}

function ThemeButton() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); window.addEventListener('cto-theme', f); return () => window.removeEventListener('cto-theme', f); }, []);
  if (!window.ctoTheme) return null;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const label = dark ? 'מראה בהיר' : 'מראה כהה';
  return html`<button type="button" class="icon-btn" aria-label=${label} title=${label} onClick=${() => window.ctoTheme.set(dark ? 'light' : 'dark')}><${Icon} name=${dark ? 'sun' : 'moon'} /></button>`;
}

const SHEETS = {
  task: { title: 'משימה', body: TaskBody, kind: 'drawer' },
  newproject: { title: 'פרויקט חדש', body: NewProjectBody, wide: true },
  gate: { title: 'סגירת שלב', body: GateBody },
  return: { title: 'להחזיר את השלב', body: ReturnBody },
  weekly: { title: 'עדכון שבועי', body: WeeklyBody },
  resolve: { title: 'בקשה לבכיר', body: ResolveBody },
  ask: { title: 'בקשה חדשה', body: AskBody },
  partner: { title: 'הוספת שותף', body: PartnerBody },
  output: { title: 'תוצר', body: OutputSheetBody },
  stage: { title: 'שלב', body: StageBody },
  newoutput: { title: 'תוצר חדש', body: NewOutputBody },
  meeting: { title: 'הקלטת פגישה', body: MeetingBody },
  who: { title: 'לראות כ…', body: WhoBody },
  add: { title: 'להוסיף', body: AddBody },
};

function App() {
  const s = useStore();
  const r = useRoute();
  useScrollState();
  const cmd = isCommander();
  const active = r.name === 'project' ? 'projects' : r.name;
  const activeTab = r.name === 'outputs' ? 'projects' : active;
  // What waits for me today: my team tasks due or late, and every row of Today's מחכה לך (store.waitingCount: asks to
  // answer or to close, the order's moves as one row, stages ready to close, weekly updates). An ask that has its own
  // row there counts once, as that row. The commander's queue is counted on מצב.
  const rows = new Set([...asksWaiting(), ...asksReady()].map((t) => t.id));
  const counts = {
    today: myTasks().filter((t) => t.status !== 'done' && t.due && dayDiff(t.due) <= 0 && !t.personal && !rows.has(t.id)).length + waitingCount(),
    overview: cmd ? commanderQueue().length : 0,
  };
  const title = r.name === 'project' ? (s.projects.find((p) => p.id === r.arg)?.name || '') : (NAV.find((n) => n.id === r.name)?.label || 'היום שלי');
  let view;
  if (r.name === 'projects') view = html`<${Projects} />`;
  else if (r.name === 'project') view = html`<${ProjectPage} key=${r.arg} id=${r.arg} />`;
  else if (r.name === 'overview') view = html`<${Overview} />`;
  else if (r.name === 'outputs') view = html`<${Outputs} />`;
  else if (r.name === 'calendar') view = html`<${Calendar} />`;
  else view = html`<${Today} key=${s.me} />`;
  const me = person(s.me);
  const sh = s.sheet && SHEETS[s.sheet.kind];
  const Body = sh?.body;
  const mine = myProjects().filter((p) => p.phase !== 'stopped' && p.phase !== 'done');
  return html`<div class="shell m-app">
    <aside class="sidebar">
      <div class="brand"><span class="logo-m"><${Icon} name="layers" size=${18} /></span><div><strong>צוות CTO</strong><span>פרויקטים ומשימות</span></div></div>
      <button type="button" class="btn btn-primary block new-task" onClick=${() => openSheet('add')}><${Icon} name="plus" size=${16} />חדש</button>
      <${JarvisSide} />
      <nav class="side-nav" aria-label="ניווט">
        ${NAV.map((n) => html`<a class=${'side-link' + (active === n.id ? ' on' : '')} href=${`#/${n.id}`} aria-current=${active === n.id ? 'page' : null}>
          <${Icon} name=${n.icon} /><span>${n.label}</span>${counts[n.id] ? html`<span class="side-count">${counts[n.id]}</span>` : null}</a>`)}
      </nav>
      ${mine.length ? html`<div class="side-projects"><div class="side-sub">הפרויקטים שלי</div>
        ${mine.map((p) => html`<a class=${'side-proj' + (r.name === 'project' && r.arg === p.id ? ' on' : '')} href=${`#/project/${p.id}`}><i style=${`background:${p.color}`}></i><span>${p.name}</span></a>`)}</div>` : null}
      ${personalProjects().length ? html`<div class="side-projects"><div class="side-sub">אישי</div>
        ${personalProjects().map((p) => html`<a class=${'side-proj' + (r.name === 'project' && r.arg === p.id ? ' on' : '')} href=${`#/project/${p.id}`}><i style=${`background:${p.color}`}></i><span>${p.name}</span></a>`)}</div>` : null}
      <button type="button" class="side-me" onClick=${() => openSheet('who')}><${Avatar} id=${s.me} size=${32} /><div><strong>${me.name}</strong><span>${me.role === 'commander' ? 'מפקד' : me.role === 'external' ? me.org : me.title} · דמו</span></div></button>
    </aside>
    <div class="main">
      <header class="topbar"><div class="topbar-title">${title}</div><div class="grow"></div>
        <span class="proto-badge" title="הנתונים נשמרים רק בדפדפן הזה">דמו · נתונים מקומיים</span>
        <${ThemeButton} />
        <button type="button" class="icon-btn mobile-only" aria-label="החלפת משתמש" onClick=${() => openSheet('who')}><${Avatar} id=${s.me} size=${30} /></button>
      </header>
      <main id="content">${view}</main>
    </div>
    <nav class="tabbar m-tabbar" aria-label="ניווט">
      ${TABS.map((id) => {
        if (id === 'jarvis') return html`<${JarvisTab} key="jarvis" />`;
        const n = NAV.find((x) => x.id === id);
        return html`<a key=${id} class=${'tab' + (activeTab === id ? ' on' : '')} href=${`#/${id}`} aria-current=${activeTab === id ? 'page' : null}>
          <span class="tab-ic"><${Icon} name=${n.icon} size=${22} />${counts[id] ? html`<span class="tab-n">${counts[id]}</span>` : null}</span><span class="tab-l">${n.short || n.label}</span></a>`;
      })}
    </nav>
    <button type="button" class="fab" aria-label="להוסיף" onClick=${() => openSheet('add')}><${Icon} name="plus" size=${28} /></button>
    ${Body ? html`<${Sheet} key=${s.sheet.kind + (s.sheet.id || '')} title=${sh.title} wide=${sh.wide} kind=${sh.kind || 'modal'} cls=${'s-' + s.sheet.kind}><${Body} ...${s.sheet} /></${Sheet}>` : null}
    ${s.jarvis ? html`<${JarvisScreen} />` : null}
    <${MenuLayer} />
    <${Toasts} />
  </div>`;
}

// The + button: a task in one line, or one of the bigger things.
function AddBody() {
  const s = useStore();
  const go = (kind, props) => { closeSheet(); setTimeout(() => openSheet(kind, props), 60); };
  return html`<div class="form add-sheet">
    <span class="lbl">משימה</span>
    <${QuickAdd} placeholder="מה צריך לעשות…" />
    <span class="lbl">או</span>
    <div class="add-grid">
      <button type="button" class="add-opt" onClick=${() => go('newproject')}><${Icon} name="layers" size=${22} /><strong>פרויקט</strong><span class="muted small">צוות או אישי</span></button>
      <button type="button" class="add-opt" onClick=${() => go('meeting')}><${Icon} name="mic" size=${22} /><strong>הקלטת פגישה</strong><span class="muted small">סיכום אוטומטי</span></button>
      ${myProjects().length ? html`<button type="button" class="add-opt" onClick=${(e) => go('newoutput', { project: (myProjects().find((p) => p.manager === s.me) || myProjects()[0]).id })}><${Icon} name="upload" size=${22} /><strong>תוצר</strong><span class="muted small">קישור, קובץ או מצביע</span></button>` : null}
    </div>
  </div>`;
}

takeReturn(); // home from Google's sign-in, before the first route is read
render(html`<${App} />`, document.getElementById('app'));
