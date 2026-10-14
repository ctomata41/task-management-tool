// The control center's shell: a floating sidebar on desktop, a glass tab bar with a Claude button on phones, and the
// router. Signed in to the app on this browser, it opens on the team's real data (live.js); otherwise, or with ?demo,
// on sample data.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html, Icon, Avatar, ClaudeMark, Sheet, Toasts } from './ui.js';
import { useStore, set, openSheet, closeSheet, myDecisions, myHumanTasks, myOutputs, myAgents, person, myProjects, toast } from './store.js';
import { liveAuth, startLive } from './live.js';
import { ConnectSheetBody } from './views/connect.js';
import { Today, Outputs, OutputSheetBody } from './views/today.js';
import { Projects, ProjectPage } from './views/projects.js';
import { Calendar } from './views/calendar.js';
import { Interview } from './views/interview.js';
import { Insights } from './views/insights.js';
import { ClaudeSheetBody, LaunchSheetBody } from './views/claude.js';

const NAV = [
  { id: 'today', label: 'היום', icon: 'home' },
  { id: 'projects', label: 'פרויקטים', icon: 'layers' },
  { id: 'calendar', label: 'יומן וגאנט', short: 'יומן', icon: 'calendar' },
  { id: 'interview', label: 'ראיון', icon: 'message' },
  { id: 'insights', label: 'תובנות', icon: 'chart' },
];
const EXTRA = [{ id: 'outputs', label: 'תוצרים', icon: 'sparkle' }];

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => { setHash(location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const [, name, arg] = (hash || '#/today').split('/');
  return { name: name || 'today', arg };
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

function App() {
  const s = useStore();
  const r = useRoute();
  useScrollState();
  if (s.booting) return html`<div class="boot"><${ClaudeMark} size=${44} live /><span class="muted">טוען את הנתונים של הצוות…</span></div>`;
  const counts = { today: myDecisions().length + myHumanTasks().length, interview: Object.entries(s.interviews).reduce((n, [pid, iv]) => n + iv.questions.filter((q) => !(s.answers[pid] || {})[q.id]).length, 0) };
  const active = r.name === 'project' ? 'projects' : r.name;
  const all = [...NAV, ...EXTRA];
  const title = r.name === 'project' ? (s.projects.find((p) => p.id === r.arg)?.name || '') : (all.find((n) => n.id === r.name)?.label || 'היום');
  const running = myAgents().filter((a) => a.state === 'run').length;
  let view;
  if (r.name === 'projects') view = html`<${Projects} />`;
  else if (r.name === 'project') view = html`<${ProjectPage} key=${r.arg} id=${r.arg} />`;
  else if (r.name === 'calendar') view = html`<${Calendar} />`;
  else if (r.name === 'interview') view = html`<${Interview} id=${r.arg} />`;
  else if (r.name === 'insights') view = html`<${Insights} />`;
  else if (r.name === 'outputs') view = html`<${Outputs} />`;
  else view = html`<${Today} />`;
  const me = person(s.me);
  return html`<div class="shell next">
    <aside class="sidebar">
      <div class="brand"><span class="logo-n"><${Icon} name="layers" size=${18} /></span><div><strong>מרכז הבקרה</strong><span>צוות CTO${s.mode === 'demo' ? ' · נתוני דמה' : ''}</span></div></div>
      <button type="button" class="btn btn-primary block new-task claude-btn" onClick=${() => openSheet('claude')}><${ClaudeMark} size=${18} />Claude</button>
      <nav class="side-nav" aria-label="ניווט">
        ${all.map((n) => html`<a class=${'side-link' + (active === n.id ? ' on' : '')} href=${`#/${n.id}`} aria-current=${active === n.id ? 'page' : null}>
          <${Icon} name=${n.icon} /><span>${n.label}</span>${counts[n.id] ? html`<span class="side-count">${counts[n.id]}</span>` : null}</a>`)}
      </nav>
      <div class="side-projects"><div class="side-sub">הפרויקטים שלי</div>
        ${myProjects().map((p) => html`<a class=${'side-proj' + (r.name === 'project' && r.arg === p.id ? ' on' : '')} href=${`#/project/${p.id}`}><i style=${`background:${p.color}`}></i><span>${p.name}</span></a>`)}
      </div>
      <button type="button" class="side-link side-connect" onClick=${() => openSheet('connect')}><${Icon} name="plug" /><span>חיבור ל-Claude</span>
        <i class=${"cdot" + (s.connector.enabled ? " on" : "")} aria-label=${s.connector.enabled ? "פעיל" : "לא פעיל"}></i></button>
      <div class="live-pill"><span class="live-dot"></span>${running} סוכנים עובדים עכשיו</div>
      <${WhoSwitch} />
    </aside>
    <div class="main">
      <header class="topbar"><div class="topbar-title">${title}</div><div class="grow"></div>
        ${s.mode === 'demo' ? html`<a class="proto-badge" href=${location.pathname.startsWith("/next") ? "/" : null} title="כניסה באפליקציה עם קוד הצוות, ואז חזרה לכאן">נתוני דמה · כניסה לנתונים האמיתיים</a>` : null}
        <button type="button" class="icon-btn mobile-only" aria-label="החלפת משתמש" onClick=${() => openSheet('who')}><${Avatar} id=${s.me} size=${30} /></button>
      </header>
      <main id="content">${view}</main>
    </div>
    <nav class="tabbar" aria-label="ניווט">
      ${NAV.map((n) => html`<a class=${'tab' + (active === n.id ? ' on' : '')} href=${`#/${n.id}`} aria-current=${active === n.id ? 'page' : null}>
        <span class="tab-ic"><${Icon} name=${n.icon} size=${22} />${counts[n.id] ? html`<span class="tab-n">${counts[n.id]}</span>` : null}</span>${n.short || n.label}</a>`)}
    </nav>
    <button type="button" class="fab claude-fab" aria-label="Claude" onClick=${() => openSheet('claude')}><${ClaudeMark} size=${34} /></button>
    ${s.sheet?.kind === 'claude' ? html`<${Sheet} title="Claude" cls="claude-sheet" wide><${ClaudeSheetBody} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'launch' ? html`<${Sheet} title="הפעלת Claude"><${LaunchSheetBody} ...${s.sheet} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'output' ? html`<${Sheet} title="תוצר"><${OutputSheetBody} id=${s.sheet.id} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'who' ? html`<${Sheet} title=${s.mode === 'live' ? 'החשבון שלי' : 'לראות כ…'}><${WhoList} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'connect' ? html`<${Sheet} title="חיבור ל-Claude" wide><${ConnectSheetBody} /></${Sheet}>` : null}
    <${Toasts} />
  </div>`;
}

// Each person sees only their projects. Switching shows the same platform through someone else's eyes.
function WhoSwitch() {
  const s = useStore();
  const me = person(s.me);
  return html`<button type="button" class="side-me" onClick=${() => openSheet('who')}><${Avatar} id=${s.me} size=${32} /><div><strong>${me.name}</strong><span>${me.role}${s.mode === 'demo' ? ' · החלפה' : ''}</span></div></button>`;
}
function WhoList() {
  const s = useStore();
  if (s.mode === 'live') {
    return html`<div class="who-list">
      <div class="who-row on"><${Avatar} id=${s.me} size=${36} /><div class="grow"><strong>${person(s.me).name}</strong><span class="muted small">${person(s.me).role}</span></div></div>
      <a class="btn block" href="/">החלפת משתמש באפליקציה</a>
      <a class="btn block" href="?demo">לראות את נתוני הדמה</a>
      <p class="muted small">כאן רואים רק את הפרויקטים שבהם מובילים או שותפים. ההתחברות משותפת עם האפליקציה.</p></div>`;
  }
  return html`<div class="who-list">${s.people.map((p) => html`<button type="button" class=${'who-row' + (p.id === s.me ? ' on' : '')} onClick=${() => { set({ me: p.id }); closeSheet(); location.hash = '#/today'; }}>
    <${Avatar} id=${p.id} size=${36} /><div class="grow"><strong>${p.name}</strong><span class="muted small">${p.role}</span></div>${p.id === s.me ? html`<${Icon} name="check" />` : null}</button>`)}
    <p class="muted small">כל אחד ואחת רואים רק את הפרויקטים שבהם הם מובילים או שותפים.</p></div>`;
}

if (liveAuth()) {
  set({ booting: true });
  startLive().then((ok) => {
    set({ booting: false });
    if (!ok) toast('לא הצלחתי לטעון את הנתונים של הצוות, אז מוצגים נתוני דמה', { ms: 6000 });
  });
}
render(html`<${App} />`, document.getElementById('app'));
