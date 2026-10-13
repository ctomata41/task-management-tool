// App shell: routing, navigation (sidebar on desktop, tab bar on phone), notifications, search, settings.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  useStore, init, me, visibleTasks, openTask, openModal, closeModal, markRead, markAllRead, person, switchUser, logout, changeCode,
  getState, set,
} from './store.js';
import { isMock } from './api.js';
import { html, Icon, Avatar, MenuLayer, Toasts, Modal } from './ui.js';
import { TaskDrawer } from './task-drawer.js';
import { QuickAdd } from './quickadd.js';
import { AuthScreen, PickScreen } from './views/auth.js';
import { Overview } from './views/overview.js';
import { Mine } from './views/mine.js';
import { Team } from './views/team.js';
import { Projects, ProjectPage, NewProjectModal } from './views/projects.js';
import { Blockers } from './views/blockers.js';
import { Daily } from './views/daily.js';
import { ReportModal } from './views/report.js';
import { isOverdue, isStuck, timeAgo, STATUS } from './util.js';
import { APP_VERSION } from './config.js';

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => { setHash(location.hash); set({ menu: null }); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return hash;
}

function homeFor(m) { return m && m.role === 'מפקד' ? 'overview' : 'mine'; }

const NAV = [
  { id: 'overview', label: 'תמונת מצב', icon: 'grid' },
  { id: 'mine', label: 'שלי', long: 'המשימות שלי', icon: 'user' },
  { id: 'team', label: 'צוות', long: 'לוח צוות', icon: 'users' },
  { id: 'daily', label: 'דיילי', icon: 'sun', tab: 'team' },
  { id: 'projects', label: 'פרויקטים', icon: 'folder' },
  { id: 'blockers', label: 'חסמים', icon: 'octagon' },
];

function NotificationsPanel({ s }) {
  const items = s.notifications;
  const text = (n) => {
    const who = person(n.actor_id)?.name || 'מישהו';
    const title = s.tasks.find((t) => t.id === n.task_id)?.title || n.body || '';
    switch (n.kind) {
      case 'assigned': return html`משימה חדשה בשבילך מ<b>${who}</b>: ${title}`;
      case 'blocked_by_you': return html`<b>${who}</b> מחכה לך: ${n.body || title}`;
      case 'comment': return html`תגובה מ<b>${who}</b> על ${title}: ${n.body}`;
      case 'mention': return html`אזכור שלך מ<b>${who}</b> ב${title}: ${n.body}`;
      case 'unblocked': return html`<b>${title}</b> שוחררה ע"י ${who}`;
      default: return title;
    }
  };
  return html`<${Modal} title="התראות">
    ${items.length ? html`<div class="notif-actions"><button type="button" class="link" onClick=${markAllRead}>סימון הכל כנקרא</button></div>
      <ul class="notifs">${items.map((n) => html`<li key=${n.id}>
        <button type="button" class=${'notif' + (n.read_at ? '' : ' unread')} onClick=${() => { markRead(n); closeModal(); if (n.task_id) openTask(n.task_id); }}>
          <span class="notif-dot"></span><span class="notif-text">${text(n)}</span><span class="muted">${timeAgo(n.created_at)}</span>
        </button></li>`)}</ul>`
      : html`<p class="none">אין התראות. כשמישהו יקצה לך משימה, יגיב, או יחכה לך, זה יופיע כאן.</p>`}
  <//>`;
}

function SearchPanel({ s }) {
  const [q, setQ] = useState('');
  const tasks = visibleTasks(s);
  const term = q.trim();
  const res = term ? tasks.filter((t) => t.title.includes(term) || (t.notes || '').includes(term)).slice(0, 30) : [];
  const projs = term ? s.projects.filter((p) => p.name.includes(term)) : [];
  return html`<${Modal} title="חיפוש">
    <input class="input" id="search-input" autoFocus placeholder="חיפוש משימה או פרויקט…" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} />
    <ul class="search-res">
      ${projs.map((p) => html`<li key=${p.id}><a class="sres" href=${'#/project/' + p.id} onClick=${closeModal}><${Icon} name="folder" size=${16} />${p.name}</a></li>`)}
      ${res.map((t) => html`<li key=${t.id}><button type="button" class="sres" onClick=${() => { closeModal(); openTask(t.id); }}>
        <span class="dot" style=${`background:${STATUS[t.status].color}`}></span><span class="grow">${t.title}</span><span class="muted">${person(t.owner_id)?.name || ''}</span></button></li>`)}
      ${term && !res.length && !projs.length ? html`<li class="none">לא נמצאו תוצאות ל"${term}"</li>` : null}
    </ul>
  <//>`;
}

function SettingsPanel({ s }) {
  const m = me();
  const [oldC, setOld] = useState('');
  const [newC, setNew] = useState('');
  const [msg, setMsg] = useState('');
  const doChange = async (e) => {
    e.preventDefault();
    try { await changeCode(oldC, newC); setMsg('קוד הצוות עודכן. שלחו את הקוד החדש לצוות.'); setOld(''); setNew(''); } catch (ex) { setMsg(ex.message); }
  };
  return html`<${Modal} title="הגדרות">
    <section class="set-sec">
      <h3>פרופיל במכשיר הזה</h3>
      <div class="set-me"><${Avatar} p=${m} size=${36} /><div><strong>${m?.name}</strong><span class="muted">${m?.role || ''}</span></div>
        <button type="button" class="btn sm" onClick=${switchUser}>החלפת משתמש</button></div>
    </section>
    <section class="set-sec">
      <h3>התקנה בטלפון</h3>
      <p class="muted">אייפון: בספארי, לחצו על כפתור השיתוף ואז "הוסף למסך הבית". אנדרואיד: בכרום, תפריט ⋮ ואז "התקנת אפליקציה".</p>
    </section>
    <section class="set-sec">
      <h3>החלפת קוד צוות</h3>
      <form class="form" onSubmit=${doChange}>
        <input class="input" id="old-code" type="password" placeholder="הקוד הנוכחי" value=${oldC} onInput=${(e) => setOld(e.currentTarget.value)} autocomplete="current-password" />
        <input class="input" id="new-code" type="password" placeholder="קוד חדש (6 תווים לפחות)" value=${newC} onInput=${(e) => setNew(e.currentTarget.value)} autocomplete="new-password" />
        <div class="form-actions"><button type="submit" class="btn" disabled=${!oldC || newC.length < 6}>עדכון הקוד</button></div>
        ${msg ? html`<p class="muted">${msg}</p>` : null}
      </form>
    </section>
    <section class="set-sec">
      <button type="button" class="btn danger" onClick=${logout}><${Icon} name="logout" size=${16} />יציאה מהמכשיר</button>
      <p class="muted small">גרסה ${APP_VERSION}${s.lastSync ? ` · סונכרן ${timeAgo(s.lastSync)}` : ''}</p>
    </section>
  <//>`;
}

function QuickAddModal({ s }) {
  const route = (location.hash || '').split('/');
  const defaults = { owner_id: s.auth?.me };
  if (route[1] === 'project' && route[2]) defaults.project_id = route[2];
  return html`<${Modal} title="משימה חדשה"><${QuickAdd} defaults=${defaults} autoFocus onDone=${closeModal} /><//>`;
}

function Shell({ s }) {
  const hash = useHash();
  const m = me();
  const parts = hash.replace(/^#\/?/, '').split('/');
  const route = parts[0] || homeFor(m);
  const tasks = visibleTasks(s);
  const myOpen = tasks.filter((t) => t.owner_id === s.auth?.me && t.status !== 'done').length;
  const stuckN = tasks.filter((t) => t.status !== 'done' && (isStuck(t) || isOverdue(t))).length;
  const unread = s.notifications.filter((n) => !n.read_at).length;
  const counts = { mine: myOpen, blockers: stuckN };

  let page;
  if (route === 'overview') page = html`<${Overview} s=${s} />`;
  else if (route === 'mine') page = html`<${Mine} s=${s} />`;
  else if (route === 'team') page = html`<${Team} s=${s} />`;
  else if (route === 'projects') page = html`<${Projects} s=${s} />`;
  else if (route === 'project') page = html`<${ProjectPage} s=${s} id=${parts[1]} />`;
  else if (route === 'blockers') page = html`<${Blockers} s=${s} />`;
  else if (route === 'daily') page = html`<${Daily} s=${s} />`;
  else page = html`<${Mine} s=${s} />`;
  const active = route === 'project' ? 'projects' : route;
  const activeTab = (NAV.find((n) => n.id === active) || {}).tab || active;
  const title = (NAV.find((n) => n.id === active) || {}).long || (NAV.find((n) => n.id === active) || {}).label || '';

  return html`<div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="logo" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28"><rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)"/><path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <div><strong>משימות CTO</strong><span>פיילוט צוות</span></div></div>
      <button type="button" class="btn btn-primary block new-task" onClick=${() => openModal('quickadd')}><${Icon} name="plus" size=${16} />משימה חדשה</button>
      <nav class="side-nav" aria-label="ניווט">
        ${NAV.map((n) => html`<a href=${'#/' + n.id} class=${'side-link' + (active === n.id ? ' on' : '')} aria-current=${active === n.id ? 'page' : null}>
          <${Icon} name=${n.icon} /><span>${n.long || n.label}</span>${counts[n.id] ? html`<span class="side-count">${counts[n.id]}</span>` : null}</a>`)}
      </nav>
      <div class="side-projects">
        <div class="side-sub">פרויקטים</div>
        ${s.projects.map((p) => html`<a href=${'#/project/' + p.id} class=${'side-proj' + (route === 'project' && parts[1] === p.id ? ' on' : '')} key=${p.id}>
          <i style=${`background:${p.color || 'var(--accent)'}`}></i><span>${p.name}</span></a>`)}
      </div>
      <button type="button" class="side-me" onClick=${() => openModal('settings')}>
        <${Avatar} p=${m} size=${30} /><div><strong>${m?.name}</strong><span>${m?.role || ''}</span></div><${Icon} name="settings" size=${16} cls="muted" /></button>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar-title"><span class="logo sm" aria-hidden="true"><svg viewBox="0 0 32 32" width="24" height="24"><rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)"/><path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${title}</div>
        <button type="button" class="search-trigger" onClick=${() => openModal('search')}><${Icon} name="search" size=${16} /><span>חיפוש</span></button>
        <div class="grow"></div>
        ${isMock ? html`<span class="badge warn">מצב בדיקה</span>` : null}
        <button type="button" class="icon-btn mobile-only" aria-label="חיפוש" onClick=${() => openModal('search')}><${Icon} name="search" /></button>
        <button type="button" class="icon-btn bell" aria-label=${`התראות${unread === 1 ? ': אחת חדשה' : unread ? `: ${unread} חדשות` : ''}`} onClick=${() => openModal('notifications')}>
          <${Icon} name="bell" />${unread ? html`<span class="bell-n">${unread}</span>` : null}</button>
        <button type="button" class="icon-btn mobile-only" aria-label="הגדרות" onClick=${() => openModal('settings')}><${Avatar} p=${m} size=${28} /></button>
      </header>
      <main id="content">${page}</main>
    </div>

    <nav class="tabbar" aria-label="ניווט">
      ${NAV.filter((n) => !n.tab).map((n) => html`<a href=${'#/' + n.id} class=${'tab' + (activeTab === n.id ? ' on' : '')} aria-current=${activeTab === n.id ? 'page' : null}>
        <span class="tab-ic"><${Icon} name=${n.icon} size=${22} />${counts[n.id] ? html`<span class="tab-n">${counts[n.id]}</span>` : null}</span><span>${n.label}</span></a>`)}
    </nav>
    <button type="button" class="fab" aria-label="משימה חדשה" onClick=${() => openModal('quickadd')}><${Icon} name="plus" size=${26} /></button>

    <${TaskDrawer} />
    ${s.modal === 'notifications' ? html`<${NotificationsPanel} s=${s} />` : null}
    ${s.modal === 'search' ? html`<${SearchPanel} s=${s} />` : null}
    ${s.modal === 'settings' ? html`<${SettingsPanel} s=${s} />` : null}
    ${s.modal === 'quickadd' ? html`<${QuickAddModal} s=${s} />` : null}
    ${s.modal === 'newproject' ? html`<${NewProjectModal} />` : null}
    ${s.modal === 'report' ? html`<${ReportModal} />` : null}
  </div>`;
}

function App() {
  const s = useStore();
  useEffect(() => { init(); }, []);
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable || getState().modal || getState().openTaskId) return;
      if (e.key === 'n' || e.key === 'מ') { e.preventDefault(); openModal('quickadd'); }
      if (e.key === '/') { e.preventDefault(); openModal('search'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  let body;
  if (s.phase === 'boot') body = html`<div class="boot"><span class="spinner"></span>טוען…</div>`;
  else if (s.phase === 'error') {
    body = html`<main class="auth"><div class="auth-card"><h1>משהו השתבש</h1><p class="sub">${s.error}</p>
      <button type="button" class="btn btn-primary" onClick=${() => { set({ phase: 'boot' }); init(); }}>לנסות שוב</button></div></main>`;
  } else if (s.phase === 'setup' || s.phase === 'login') body = html`<${AuthScreen} setup=${s.phase === 'setup'} />`;
  else if (s.phase === 'pick') body = html`<${PickScreen} />`;
  else body = html`<${Shell} s=${s} />`;
  return html`${body}<${MenuLayer} /><${Toasts} />`;
}

render(html`<${App} />`, document.getElementById('app'));

if ('serviceWorker' in navigator && !isMock && location.hostname !== 'localhost') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
