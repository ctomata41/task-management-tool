// App shell: routing, navigation (sidebar on desktop, tab bar and a "more" sheet on phones), notifications, search,
// the בלמ״ס declaration and the sensitive-word question.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  useStore, init, me, visibleTasks, openTask, openModal, closeModal, openDecision, markRead, markAllRead, person, isCommand,
  getState, set, declare, switchUser, answerGuard,
} from './store.js';
import { isMock } from './api.js';
import { html, Icon, Avatar, MenuLayer, Toasts, Modal, navigate } from './ui.js';
import { TaskDrawer } from './task-drawer.js';
import { NewItemModal } from './newitem.js';
import { AuthScreen, PickScreen } from './views/auth.js';
import { Home } from './views/home.js';
import { Command } from './views/command.js';
import { Decisions, DecisionEditor, DecisionView } from './views/decisions.js';
import { Commitments, CommitmentEditor } from './views/commitments.js';
import { Overview } from './views/overview.js';
import { Team } from './views/team.js';
import { Projects, ProjectPage, NewProjectModal } from './views/projects.js';
import { Blockers } from './views/blockers.js';
import { Daily } from './views/daily.js';
import { Weekly } from './views/weekly.js';
import { ReportModal } from './views/report.js';
import { SettingsPanel } from './views/settings.js';
import { waitingFor, canSee, liveProjects, commitmentLate, visibleCommitments, STAGE } from './model.js';
import { timeAgo, STATUS } from './util.js';

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => { setHash(location.hash); set({ menu: null }); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return hash;
}

// The commander lands on the one-minute command view; everyone else on "מה מחכה לי".
const commanderHome = (m) => !!m && m.role === 'מפקד';

const NAV = [
  { id: 'home', label: 'מה מחכה לי', short: 'בית', icon: 'inbox' },
  { id: 'command', label: 'המפקד בדקה', short: 'פיקוד', icon: 'gauge', command: true },
  { id: 'decisions', label: 'החלטות', icon: 'decision' },
  { id: 'projects', label: 'פרויקטים', icon: 'folder' },
  { id: 'commitments', label: 'התחייבויות', icon: 'swap' },
  { id: 'team', label: 'לוח צוות', short: 'צוות', icon: 'users' },
  { id: 'daily', label: 'דיילי', icon: 'sun', parent: 'team' },
  { id: 'blockers', label: 'חסמים', icon: 'octagon', parent: 'team', hidden: true },
  { id: 'overview', label: 'תמונת מצב', icon: 'grid' },
  { id: 'weekly', label: 'פגישה שבועית', icon: 'calendar' },
];
const NAV_BY = Object.fromEntries(NAV.map((n) => [n.id, n]));

function NotificationsPanel({ s }) {
  const items = s.notifications;
  const text = (n) => {
    const who = person(n.actor_id)?.name || 'מישהו';
    const task = s.tasks.find((t) => t.id === n.task_id)?.title || n.body || '';
    const dTitle = s.decisions.find((d) => d.id === n.decision_id)?.title || '';
    switch (n.kind) {
      case 'assigned': return html`מטלה חדשה בשבילך מ<b>${who}</b>: ${task}`;
      case 'accountable': return html`משימת Claude באחריותך: <b>${task}</b>`;
      case 'review': return html`<b>${task}</b> מחכה לבדיקה שלך`;
      case 'blocked_by_you': return html`<b>${who}</b> מחכה לך: ${n.body || task}`;
      case 'comment': return html`תגובה מ<b>${who}</b> על ${task}: ${n.body}`;
      case 'mention': return html`אזכור שלך מ<b>${who}</b> ב${task}: ${n.body}`;
      case 'unblocked': return html`<b>${task}</b> שוחררה על ידי ${who}`;
      case 'decision': return html`החלטה מחכה לך: <b>${n.body || dTitle}</b>`;
      case 'decided': return html`הוחלט${dTitle ? html` ב<b>${dTitle}</b>` : ''}: ${n.body}`;
      case 'commitment': return html`התחייבות באחריותך: <b>${n.body}</b>`;
      default: return n.body || task;
    }
  };
  const go = (n) => {
    markRead(n);
    closeModal();
    if (n.task_id && s.tasks.some((t) => t.id === n.task_id)) openTask(n.task_id);
    else if (n.decision_id && s.decisions.some((d) => d.id === n.decision_id)) openDecision(n.decision_id);
    else if (n.commitment_id && s.commitments.some((c) => c.id === n.commitment_id)) openModal('commitment', { id: n.commitment_id });
  };
  return html`<${Modal} title="התראות">
    ${items.length ? html`<div class="notif-actions"><button type="button" class="link" onClick=${markAllRead}>סימון הכל כנקרא</button></div>
      <ul class="notifs">${items.map((n) => html`<li key=${n.id}>
        <button type="button" class=${'notif' + (n.read_at ? '' : ' unread')} onClick=${() => go(n)}>
          <span class="notif-dot"></span><span class="notif-text">${text(n)}</span><span class="muted">${timeAgo(n.created_at)}</span>
        </button></li>`)}</ul>`
      : html`<p class="none">אין התראות. החלטה שמחכה לך, מטלה חדשה, בדיקה, תגובה או מישהו שמחכה לך יופיעו כאן.</p>`}
  <//>`;
}

function SearchPanel({ s }) {
  const [q, setQ] = useState('');
  const term = q.trim();
  const has = (...xs) => xs.some((x) => (x || '').includes(term));
  const tasks = term ? visibleTasks(s).filter((t) => canSee(t, s) && has(t.title, t.notes)).slice(0, 25) : [];
  const projs = term ? s.projects.filter((p) => canSee(p, s) && has(p.name, p.classified ? '' : p.description)) : [];
  const decisions = term ? s.decisions.filter((d) => canSee(d, s) && has(d.title, d.context, d.chosen_label)).slice(0, 15) : [];
  const commitments = term ? visibleCommitments(s).filter((c) => has(c.title, c.counterpart)).slice(0, 15) : [];
  const none = term && !tasks.length && !projs.length && !decisions.length && !commitments.length;
  return html`<${Modal} title="חיפוש">
    <input class="input" id="search-input" autoFocus placeholder="חיפוש בפרויקטים, החלטות, מטלות והתחייבויות…" aria-label="חיפוש" value=${q} onInput=${(e) => setQ(e.currentTarget.value)} />
    <ul class="search-res">
      ${projs.map((p) => html`<li key=${p.id}><a class="sres" href=${'#/project/' + p.id} onClick=${closeModal}><${Icon} name="folder" size=${16} /><span class="grow">${p.name}</span>
        ${p.stage && p.stage !== 'active' ? html`<span class="muted">${STAGE[p.stage].label}</span>` : null}</a></li>`)}
      ${decisions.map((d) => html`<li key=${d.id}><button type="button" class="sres" onClick=${() => openDecision(d.id)}><${Icon} name="decision" size=${16} />
        <span class="grow">${d.title}</span><span class="muted">${d.status === 'open' ? 'פתוחה' : d.status === 'decided' ? `הוחלט: ${d.chosen_label}` : 'בוטלה'}</span></button></li>`)}
      ${commitments.map((c) => html`<li key=${c.id}><button type="button" class="sres" onClick=${() => openModal('commitment', { id: c.id })}><${Icon} name="swap" size=${16} />
        <span class="grow">${c.title}</span><span class="muted">${c.counterpart || ''}</span></button></li>`)}
      ${tasks.map((t) => html`<li key=${t.id}><button type="button" class="sres" onClick=${() => { closeModal(); openTask(t.id); }}>
        <span class="dot" style=${`background:${STATUS[t.status].color}`}></span><span class="grow">${t.title}</span><span class="muted">${person(t.kind === 'claude' ? t.accountable_id : t.owner_id)?.name || ''}</span></button></li>`)}
      ${none ? html`<li class="none">לא נמצאו תוצאות ל"${term}"</li>` : null}
    </ul>
  <//>`;
}

// On phones, what does not fit in the tab bar.
function MoreSheet({ s, tabs }) {
  const cmd = isCommand(s);
  const go = (hash) => { navigate(hash); closeModal(); };
  const links = NAV.filter((n) => !tabs.includes(n.id) && (!n.command || cmd));
  return html`<${Modal} title="עוד" cls="more-sheet">
    <div class="more-grid">
      ${links.map((n) => html`<button type="button" key=${n.id} class="more-item" onClick=${() => go('#/' + n.id)}><${Icon} name=${n.icon} size=${20} />${n.label}</button>`)}
      <button type="button" class="more-item" onClick=${() => openModal('report')}><${Icon} name="report" size=${20} />דוח שבועי</button>
      <button type="button" class="more-item" onClick=${() => openModal('search')}><${Icon} name="search" size=${20} />חיפוש</button>
      <button type="button" class="more-item" onClick=${() => openModal('settings')}><${Icon} name="settings" size=${20} />הגדרות</button>
    </div>
  <//>`;
}

// The sensitive-word question: shown above everything, before anything is saved.
function GuardDialog({ g }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); answerGuard('edit'); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return html`<div class="overlay top">
    <div class="modal guard" role="alertdialog" aria-modal="true" aria-labelledby="guard-t" aria-describedby="guard-d">
      <header class="modal-head"><h2 id="guard-t"><${Icon} name="shield" size=${18} />רגע לפני ששומרים</h2></header>
      <div class="modal-body">
        <p id="guard-d">${g.hits === 1 ? 'בטקסט יש מילה' : `בטקסט יש ${g.hits} מילים`} מרשימת המילים הרגישות של הצוות. מידע מסווג לא נכנס לכלי.</p>
        <p class="muted small">אם זו טעות, אפשר לשמור. הפריט יסומן ויוסתר משאר הצוות עד שהפיקוד יבדוק אותו.</p>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" autoFocus onClick=${() => answerGuard('edit')}>חזרה לעריכה</button>
          <button type="button" class="btn" onClick=${() => answerGuard('save')}>זו טעות, לשמור ולסמן לבדיקה</button>
        </div>
      </div>
    </div>
  </div>`;
}

// First sign-in on a device: a short "בלמ״ס בלבד" declaration (spec, chapter 6).
function DeclareScreen() {
  const m = me();
  const [busy, setBusy] = useState(false);
  return html`<main class="auth">
    <div class="auth-card declare">
      <p class="eyebrow">${m ? `שלום, ${m.name}` : ''}</p>
      <h1><${Icon} name="shieldCheck" size=${22} />בלמ״ס בלבד</h1>
      <p class="sub">הפלטפורמה ברשת הבלמ״סית. לפני שמתחילים, ארבעה כללים:</p>
      <ul class="rules">
        <li>מידע מסווג לא נכנס לכלי, וגם לא לשיחות עם Claude שמחובר אליו.</li>
        <li>פרויקט מסווג מופיע רק בשם בלמ״ס, עם מוביל ומצב. הפרטים ברשת המסווגת.</li>
        <li>פריט שנראה חשוד מסמנים כחשוד, והוא מוסתר עד שהפיקוד בודק.</li>
        <li>בהגדרות הפרטיות של Claude מכבים את השימוש בשיחות לאימון.</li>
      </ul>
      <button type="button" class="btn btn-primary block" disabled=${busy} onClick=${async () => { setBusy(true); await declare(); setBusy(false); }}>הבנתי, ממשיכים</button>
      <button type="button" class="link declare-switch" onClick=${switchUser}>זה לא החשבון שלי</button>
    </div>
  </main>`;
}

function Shell({ s }) {
  const hash = useHash();
  const m = me();
  const cmd = isCommand(s);
  const parts = hash.replace(/^#\/?/, '').split('/');
  const home = commanderHome(m) ? 'command' : 'home';
  let route = parts[0] || home;
  if (route === 'mine') route = 'home';
  const myId = s.auth?.me;
  const queue = waitingFor(myId, s).length;
  const lateC = visibleCommitments(s).filter(commitmentLate).length;
  const unread = s.notifications.filter((n) => !n.read_at).length;
  const counts = { home: queue };
  const alerts = { commitments: lateC };

  let page;
  if (route === 'home') page = html`<${Home} s=${s} pid=${parts[1]} />`;
  else if (route === 'command') page = html`<${Command} s=${s} />`;
  else if (route === 'decisions') page = html`<${Decisions} s=${s} />`;
  else if (route === 'projects') page = html`<${Projects} s=${s} />`;
  else if (route === 'project') page = html`<${ProjectPage} s=${s} id=${parts[1]} />`;
  else if (route === 'commitments') page = html`<${Commitments} s=${s} />`;
  else if (route === 'team') page = html`<${Team} s=${s} />`;
  else if (route === 'daily') page = html`<${Daily} s=${s} />`;
  else if (route === 'blockers') page = html`<${Blockers} s=${s} />`;
  else if (route === 'overview') page = html`<${Overview} s=${s} />`;
  else if (route === 'weekly') page = html`<${Weekly} s=${s} />`;
  else { route = home; page = home === 'command' ? html`<${Command} s=${s} />` : html`<${Home} s=${s} />`; }
  const active = route === 'project' ? 'projects' : route;
  const tabs = [home, 'decisions', 'projects', 'team'];
  const tabOf = (id) => (NAV_BY[id]?.parent && tabs.includes(NAV_BY[id].parent) ? NAV_BY[id].parent : id);
  const activeTab = tabs.includes(tabOf(active)) ? tabOf(active) : 'more';
  const title = NAV_BY[active]?.label || '';
  const sideNav = NAV.filter((n) => !n.hidden && (!n.command || cmd));
  const projects = liveProjects(s);

  return html`<div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="logo" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28"><rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)"/><path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <div><strong>משימות CTO</strong><span>אנשים מחליטים, Claude מבצע</span></div></div>
      <button type="button" class="btn btn-primary block new-task" onClick=${() => openModal('new')}><${Icon} name="plus" size=${16} />חדש</button>
      <nav class="side-nav" aria-label="ניווט">
        ${sideNav.map((n) => html`<a href=${'#/' + n.id} key=${n.id} class=${'side-link' + (active === n.id || (n.id === 'team' && active === 'blockers') ? ' on' : '')} aria-current=${active === n.id ? 'page' : null}>
          <${Icon} name=${n.icon} /><span>${n.label}</span>${counts[n.id] ? html`<span class="side-count">${counts[n.id]}</span>` : null}
          ${alerts[n.id] ? html`<span class="side-count bad" title="באיחור">${alerts[n.id]}</span>` : null}</a>`)}
      </nav>
      <div class="side-projects">
        <div class="side-sub">פרויקטים</div>
        ${projects.map((p) => html`<a href=${'#/project/' + p.id} class=${'side-proj' + (route === 'project' && parts[1] === p.id ? ' on' : '') + (p.stage === 'proposed' ? ' proposed' : '')} key=${p.id}
          title=${p.stage === 'proposed' ? 'מוצע: מחכה להחלטה על פתיחה' : p.name}>
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
      ${tabs.map((id) => {
        const n = NAV_BY[id];
        return html`<a href=${'#/' + id} key=${id} class=${'tab' + (activeTab === id ? ' on' : '')} aria-current=${activeTab === id ? 'page' : null}>
          <span class="tab-ic"><${Icon} name=${n.icon} size=${22} />${counts[id] ? html`<span class="tab-n">${counts[id]}</span>` : null}</span><span>${n.short || n.label}</span></a>`;
      })}
      <button type="button" class=${'tab' + (activeTab === 'more' ? ' on' : '')} onClick=${() => openModal('more')}>
        <span class="tab-ic"><${Icon} name="menu" size=${22} />${lateC ? html`<span class="tab-n bad">${lateC}</span>` : null}</span><span>עוד</span></button>
    </nav>
    <button type="button" class="fab" aria-label="חדש: מטלה, החלטה, התחייבות או רעיון" onClick=${() => openModal('new')}><${Icon} name="plus" size=${26} /></button>

    <${TaskDrawer} />
    ${s.modal === 'new' ? html`<${NewItemModal} s=${s} />` : null}
    ${s.modal === 'decision' ? html`<${DecisionEditor} key=${s.modalData?.id || 'new'} s=${s} />` : null}
    ${s.modal === 'decisionView' ? html`<${DecisionView} s=${s} />` : null}
    ${s.modal === 'commitment' ? html`<${CommitmentEditor} key=${s.modalData?.id || 'new'} s=${s} />` : null}
    ${s.modal === 'notifications' ? html`<${NotificationsPanel} s=${s} />` : null}
    ${s.modal === 'search' ? html`<${SearchPanel} s=${s} />` : null}
    ${s.modal === 'settings' ? html`<${SettingsPanel} s=${s} />` : null}
    ${s.modal === 'more' ? html`<${MoreSheet} s=${s} tabs=${tabs} />` : null}
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
      const st = getState();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable || st.modal || st.openTaskId || st.phase !== 'ready') return;
      if (e.key === 'n' || e.key === 'מ') { e.preventDefault(); openModal('new'); }
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
  else if (s.phase === 'declare') body = html`<${DeclareScreen} />`;
  else body = html`<${Shell} s=${s} />`;
  return html`${body}${s.guardAsk ? html`<${GuardDialog} g=${s.guardAsk} />` : null}<${MenuLayer} /><${Toasts} />`;
}

render(html`<${App} />`, document.getElementById('app'));

// The browser honours autofocus only once per page, so a field that appears later (a modal, an inline editor) gets focus here.
new MutationObserver((records) => {
  for (const r of records) {
    for (const n of r.addedNodes) {
      const el = n.nodeType === 1 && (n.matches('[autofocus]') ? n : n.querySelector('[autofocus]'));
      if (el) { el.focus(); return; }
    }
  }
}).observe(document.getElementById('app'), { childList: true, subtree: true });

if ('serviceWorker' in navigator && !isMock && location.hostname !== 'localhost') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
