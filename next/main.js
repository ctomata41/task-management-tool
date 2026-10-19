// The control center's shell: a floating sidebar on desktop, a glass tab bar with a Claude button on phones, and the
// router. Signed in on this browser (here or in the app), it opens on the team's real data (live.js); otherwise it asks
// for the team code. ?demo shows the sample data.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html, Icon, Avatar, ClaudeMark, Sheet, Toasts } from './ui.js';
import { useStore, set, openSheet, closeSheet, myDecisions, myHumanTasks, myOutputs, myAgents, person, myProjects, toast } from './store.js';
import { liveAuth, startLive, forgetPerson, gcal } from './live.js';
import { ThemeButton, ThemeChoice } from './parts.js';
import { SignIn } from './views/signin.js';
import { ConnectSheetBody } from './views/connect.js';
import { Today, Outputs, OutputSheetBody } from './views/today.js';
import { Projects, ProjectPage } from './views/projects.js';
import { Calendar, EventSheetBody } from './views/calendar.js';
import { Interview } from './views/interview.js';
import { Insights } from './views/insights.js';
import { ClaudeSheetBody, LaunchSheetBody } from './views/claude.js';
import { NewProjectSheetBody, MilestonesSheetBody } from './views/newproject.js';
import { Meetings, MeetingPage, RecordingPill } from './views/meeting.js';

const NAV = [
  { id: 'today', label: 'היום', icon: 'home' },
  { id: 'projects', label: 'פרויקטים', icon: 'layers' },
  { id: 'calendar', label: 'יומן וגאנט', short: 'יומן', icon: 'calendar' },
  { id: 'interview', label: 'ראיון', icon: 'message' },
  { id: 'insights', label: 'תובנות', icon: 'chart' },
];
const EXTRA = [{ id: 'outputs', label: 'תוצרים', icon: 'sparkle' }, { id: 'meeting', label: 'פגישות', icon: 'mic' }];

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
  const mtg = r.name === 'meeting' && r.arg ? s.meetings.find((m) => m.id === r.arg) : null;
  const all = [...NAV, ...EXTRA];
  const title = r.name === 'project' ? (s.projects.find((p) => p.id === r.arg)?.name || '') : mtg ? mtg.title : (all.find((n) => n.id === r.name)?.label || 'היום');
  const running = myAgents().filter((a) => a.state === 'run').length;
  let view;
  if (r.name === 'projects') view = html`<${Projects} />`;
  else if (r.name === 'project') view = html`<${ProjectPage} key=${r.arg} id=${r.arg} />`;
  else if (r.name === 'calendar') view = html`<${Calendar} />`;
  else if (r.name === 'interview') view = html`<${Interview} id=${r.arg} />`;
  else if (r.name === 'insights') view = html`<${Insights} />`;
  else if (r.name === 'outputs') view = html`<${Outputs} />`;
  else if (r.name === 'meeting') view = r.arg ? html`<${MeetingPage} key=${r.arg} id=${r.arg} />` : html`<${Meetings} />`;
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
        ${s.mode === 'demo' ? html`<a class="proto-badge" href=${location.pathname.startsWith("/next") ? location.pathname : null} title="כניסה עם קוד הצוות">נתוני דמה · כניסה לנתונים האמיתיים</a>` : null}
        <${RecordingPill} />
        <button type="button" class="icon-btn jv-btn" aria-label="לדבר עם ג׳ארביס" title="ג׳ארביס" onClick=${() => openSheet('claude', { jarvis: true })}><${Icon} name="mic" /></button>
        <${ThemeButton} />
        <button type="button" class="icon-btn mobile-only" aria-label="החלפת משתמש" onClick=${() => openSheet('who')}><${Avatar} id=${s.me} size=${30} /></button>
      </header>
      <main id="content">${view}</main>
    </div>
    <nav class="tabbar" aria-label="ניווט">
      ${NAV.map((n) => html`<a class=${'tab' + (active === n.id ? ' on' : '')} href=${`#/${n.id}`} aria-current=${active === n.id ? 'page' : null}>
        <span class="tab-ic"><${Icon} name=${n.icon} size=${22} />${counts[n.id] ? html`<span class="tab-n">${counts[n.id]}</span>` : null}</span>${n.short || n.label}</a>`)}
    </nav>
    <button type="button" class="fab claude-fab" aria-label="Claude" onClick=${() => openSheet('claude')}><${ClaudeMark} size=${34} /></button>
    ${s.sheet?.kind === 'claude' ? html`<${Sheet} title="Claude" cls="claude-sheet" wide><${ClaudeSheetBody} jarvis=${!!s.sheet.jarvis} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'launch' ? html`<${Sheet} title="הפעלת Claude"><${LaunchSheetBody} ...${s.sheet} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'output' ? html`<${Sheet} title="תוצר"><${OutputSheetBody} id=${s.sheet.id} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'who' ? html`<${Sheet} title=${s.mode === 'live' ? 'החשבון שלי' : 'לראות כ…'}><${WhoList} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'newproject' ? html`<${Sheet} title="פרויקט חדש" wide><${NewProjectSheetBody} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'milestones' ? html`<${Sheet} title="אבני דרך"><${MilestonesSheetBody} id=${s.sheet.id} /></${Sheet}>` : null}
    ${s.sheet?.kind === 'event' ? html`<${Sheet} title="אירוע חדש"><${EventSheetBody} /></${Sheet}>` : null}
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
      <button type="button" class="btn block" onClick=${() => { forgetPerson(); location.reload(); }}>החלפת משתמש</button>
      <a class="btn block" href="/#/home">האפליקציה הקודמת</a>
      <a class="btn block" href="?demo">לראות את נתוני הדמה</a>
      <${ThemeChoice} />
      <p class="muted small">כאן רואים רק את הפרויקטים שבהם מובילים או שותפים. ההתחברות משותפת עם האפליקציה.</p></div>`;
  }
  return html`<div class="who-list">${s.people.map((p) => html`<button type="button" class=${'who-row' + (p.id === s.me ? ' on' : '')} onClick=${() => { set({ me: p.id }); closeSheet(); location.hash = '#/today'; }}>
    <${Avatar} id=${p.id} size=${36} /><div class="grow"><strong>${p.name}</strong><span class="muted small">${p.role}</span></div>${p.id === s.me ? html`<${Icon} name="check" />` : null}</button>`)}
    <${ThemeChoice} />
    <p class="muted small">כל אחד ואחת רואים רק את הפרויקטים שבהם הם מובילים או שותפים.</p></div>`;
}

// Outside /next/ (the artifact copy) and with ?demo or ?mock, the sample data needs no sign-in.
const sample = /[?&](demo|mock)\b/.test(location.search) || !location.pathname.startsWith('/next');
if (!liveAuth() && !sample) {
  render(html`<${SignIn} />`, document.getElementById('app'));
} else {
  if (liveAuth()) {
    const back = gcal.takeReturn(); // home from Google's sign-in
    set({ booting: true });
    startLive().then((ok) => {
      set({ booting: false });
      if (back) toast(back.error || 'יומן Google מחובר. מעכשיו רואים אותו כאן', { ms: 6000 });
      if (!ok) toast('לא הצלחתי לטעון את הנתונים של הצוות, אז מוצגים נתוני דמה', { ms: 6000 });
    });
  }
  render(html`<${App} />`, document.getElementById('app'));
}
