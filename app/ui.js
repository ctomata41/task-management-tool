// Shared UI building blocks.
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import htm from 'htm';
import {
  getState, set, useStore, openMenu, closeMenu, dismissToast, updateTask, openTask, person, project, closeModal, toast,
} from './store.js';
import { STATUSES, STATUS, PRIORITIES, PRIORITY, HEALTH, HEALTH_BY, dueLabel, isOverdue, personColor, initials, ageOf } from './util.js';
import { HTYPE, isClaude, isAgent } from './model.js';

export const html = htm.bind(h);

const ICONS = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  octagon: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v5"/><path d="M12 16.5v.01"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9 9.5v10"/>',
  kanban: '<rect x="3.5" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="16.5" y="4" width="4" height="7" rx="1"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.9"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  checklist: '<path d="m4 7 1.5 1.5L8 6M4 13l1.5 1.5L8 12M11 7h9M11 13h9M11 19h9M4 19h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  report: '<path d="M6 3.5h9l3 3v14H6z"/><path d="M9 11h6M9 14.5h6M9 18h3"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="12" rx="1.5"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 5v9A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  inbox: '<path d="M3.5 13.5 6 5.5h12l2.5 8"/><path d="M3.5 13.5V19h17v-5.5h-5a3.5 3.5 0 0 1-7 0z"/>',
  decision: '<path d="M12 3v18"/><path d="M12 5.5h6.5l2.5 2.5-2.5 2.5H12"/><path d="M12 13H5.5L3 15.5 5.5 18H12"/>',
  swap: '<path d="M4 8h14.5l-3.5-3.5"/><path d="M20 16H5.5L9 19.5"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5V6z"/>',
  shieldCheck: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  file: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M6.5 8h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5V21"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  gauge: '<path d="M4.5 17.5a8.5 8.5 0 1 1 15 0"/><path d="m12 13.5 4-4.5"/><circle cx="12" cy="14" r="1.2" fill="currentColor"/>',
  sparkle: '<path d="M11 3.5c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/><path d="M18.5 15.5c.3 1.6 1.1 2.4 2.5 2.7-1.4.3-2.2 1.1-2.5 2.7-.3-1.6-1.1-2.4-2.5-2.7 1.4-.3 2.2-1.1 2.5-2.7z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H15a5 5 0 0 1 0 10h-3"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
export function Icon({ name, size = 18, cls = '' }) {
  return html`<svg class=${'ic ' + cls} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: ICONS[name] || '' }}></svg>`;
}

export function Avatar({ p, size = 26, title }) {
  return html`<span class="avatar" title=${title || p?.name || 'ללא אחראי'}
    style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.46)}px;background:${p ? personColor(p) : 'transparent'}`}
    data-empty=${p ? null : ''}>${p ? initials(p, getState().people) : ''}</span>`;
}

export function StatusPill({ t, readOnly, size }) {
  const st = STATUS[t.status] || STATUS.todo;
  const onClick = (e) => {
    e.stopPropagation();
    if (readOnly) return;
    openMenu(e.currentTarget, STATUSES.map((s) => ({ id: s.id, label: s.label, color: s.color })), (id) => pickStatus(t, id), t.status);
  };
  return html`<button type="button" class=${'pill ' + (size || '')} style=${`--c:${st.color}`} onClick=${onClick}
    aria-label=${'סטטוס: ' + st.label}>${st.label}</button>`;
}
// Choosing "blocked"/"waiting" opens the task so the person can say who or what is blocking.
export function pickStatus(t, id) {
  updateTask(t.id, { status: id });
  if ((id === 'blocked' || id === 'waiting') && !t.blocked_by_person && !t.blocked_reason) openTask(t.id);
}

// The people a task, decision or commitment can be given to: the team first, then everyone else (never Claude).
export function humanPeople() {
  return getState().people.filter((p) => !isAgent(p)).sort((a, b) => (b.is_team - a.is_team) || (a.sort ?? 999) - (b.sort ?? 999));
}
export function pickPerson(anchor, { selected, onPick, none, include = humanPeople() }) {
  openMenu(anchor, [
    ...include.map((x) => ({ id: x.id, label: x.name, person: x })),
    ...(none ? [{ id: '', label: none }] : []),
  ], (id) => onPick(id || null), selected || '');
}

// Who a task is with. A Claude task shows Claude working for the accountable person; the menu changes that person.
export function OwnerButton({ t, size = 24 }) {
  if (isClaude(t)) {
    const acc = person(t.accountable_id || t.created_by);
    const onClick = (e) => { e.stopPropagation(); pickPerson(e.currentTarget, { selected: acc?.id, onPick: (id) => id && updateTask(t.id, { accountable_id: id }) }); };
    return html`<button type="button" class="owner-btn is-claude" onClick=${onClick} title=${`Claude מבצע, באחריות ${acc?.name || 'אדם'}`}
      aria-label=${'משימת Claude באחריות ' + (acc?.name || 'אדם')}>
      <span class="claude-mark" aria-hidden="true"><${Icon} name="sparkle" size=${13} /></span><${Avatar} p=${acc} size=${size} /><span class="owner-name">${acc ? acc.name : 'ללא'}</span></button>`;
  }
  const p = person(t.owner_id);
  const onClick = (e) => { e.stopPropagation(); pickPerson(e.currentTarget, { selected: t.owner_id, none: 'ללא אחראי', onPick: (id) => updateTask(t.id, { owner_id: id }) }); };
  return html`<button type="button" class="owner-btn" onClick=${onClick} aria-label=${'אחראי: ' + (p?.name || 'ללא')}>
    <${Avatar} p=${p} size=${size} /><span class="owner-name">${p ? p.name : 'ללא'}</span></button>`;
}

export function PriorityButton({ t, compact }) {
  const pr = PRIORITY[t.priority] || PRIORITY.medium;
  const onClick = (e) => {
    e.stopPropagation();
    openMenu(e.currentTarget, PRIORITIES.map((p) => ({ id: p.id, label: p.label, color: p.color, flag: true })), (id) => updateTask(t.id, { priority: id }), t.priority);
  };
  return html`<button type="button" class=${'prio prio-' + t.priority} onClick=${onClick} aria-label=${'עדיפות: ' + pr.label} title=${'עדיפות ' + pr.label}>
    <${Icon} name="flag" size=${15} />${compact ? null : html`<span>${pr.label}</span>`}</button>`;
}

export function FocusStar({ t }) {
  return html`<button type="button" class=${'star' + (t.focus ? ' on' : '')} aria-pressed=${t.focus ? 'true' : 'false'}
    title=${t.focus ? 'בפוקוס' : 'סימון כפוקוס'} aria-label="פוקוס"
    onClick=${(e) => { e.stopPropagation(); updateTask(t.id, { focus: !t.focus }); }}><${Icon} name="star" size=${16} /></button>`;
}

export function DueButton({ t, field = 'due', empty = 'תאריך', onSave, label = 'תאריך יעד', late }) {
  const ref = useRef();
  const val = t[field];
  const overdue = late !== undefined ? late : field === 'due' && isOverdue(t);
  return html`<span class=${'due' + (overdue ? ' overdue' : '') + (val ? '' : ' empty')} onClick=${(e) => e.stopPropagation()}>
    <${Icon} name="calendar" size=${14} />
    <span>${val ? dueLabel(val) : empty}</span>
    <input ref=${ref} type="date" value=${val || ''} aria-label=${label}
      onClick=${(e) => { try { e.currentTarget.showPicker && e.currentTarget.showPicker(); } catch (err) { /* older browsers */ } }}
      onChange=${(e) => { const v = e.currentTarget.value || null; if (onSave) onSave(v); else updateTask(t.id, { [field]: v }); }} />
  </span>`;
}

export function ProjectChip({ id }) {
  const p = project(id);
  if (!p) return null;
  return html`<a class="proj-chip" href=${'#/project/' + p.id} onClick=${(e) => e.stopPropagation()}>
    <i style=${`background:${p.color || 'var(--accent)'}`}></i>${p.name}</a>`;
}

export function HealthPill({ p, onPick }) {
  const hh = HEALTH_BY[p.health] || HEALTH[0];
  const onClick = (e) => {
    e.stopPropagation();
    if (!onPick) return;
    openMenu(e.currentTarget, HEALTH.map((x) => ({ id: x.id, label: x.label, color: x.color, dot: true })), onPick, p.health);
  };
  return html`<button type="button" class="health" style=${`--c:${hh.color}`} onClick=${onClick} disabled=${!onPick}>
    <i></i>${hh.label}</button>`;
}

export function Progress({ value, total }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return html`<div class="progress" title=${`${value} מתוך ${total}`}><div style=${`width:${pct}%`}></div></div>`;
}

export function Empty({ icon = 'check', title, children }) {
  return html`<div class="empty"><${Icon} name=${icon} size=${26} /><strong>${title}</strong>${children ? html`<p>${children}</p>` : null}</div>`;
}

// How long something has been waiting for a person. Past 48 hours it escalates, so it turns red.
export function AgeChip({ at, prefix = 'מחכה', title }) {
  if (!at) return null;
  const a = ageOf(at);
  return html`<span class=${'age age-' + a.level} title=${title || (a.level === 'bad' ? 'מחכה יותר מ-48 שעות' : 'כמה זמן זה מחכה')}>
    <${Icon} name="clock" size=${13} />${prefix ? prefix + ' ' : ''}${a.label}</span>`;
}

// The fixed reminder next to every place people write: classified information never enters the tool.
export function BlmsNote({ text }) {
  return html`<p class="blms-note"><${Icon} name="shieldCheck" size=${15} />${text || 'בלמ״ס בלבד. מידע מסווג לא נכנס לכלי.'}</p>`;
}

// A small segmented switch.
export function Seg({ value, options, onChange, label }) {
  return html`<div class="seg" role="tablist" aria-label=${label}>
    ${options.map((o) => html`<button type="button" role="tab" key=${o.id} aria-selected=${value === o.id ? 'true' : 'false'} class=${value === o.id ? 'on' : ''}
      onClick=${() => onChange(o.id)}>${o.icon ? html`<${Icon} name=${o.icon} size=${16} />` : null}${o.label}${o.count ? html`<span class="seg-n">${o.count}</span>` : null}</button>`)}
  </div>`;
}

export async function copyText(text, done = 'הועתק') {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
    return true;
  } catch (e) {
    toast('לא הצלחתי להעתיק. אפשר לסמן את הטקסט ולהעתיק ידנית.', { kind: 'error' });
    return false;
  }
}

// A button for a step that is hard to take back: the first tap asks, the second tap does it.
export function ConfirmButton({ label, confirm = 'לחיצה נוספת לאישור', onConfirm, cls = 'btn sm', icon }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return html`<button type="button" class=${cls + (armed ? ' armed' : '')}
    onClick=${(e) => { e.stopPropagation(); if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
    ${icon ? html`<${Icon} name=${icon} size=${15} />` : null}${armed ? confirm : label}</button>`;
}

// A label that turns into an input on click (project name, one-line fields).
export function InlineText({ value, onSave, cls, placeholder }) {
  const [v, setV] = useState(value || '');
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return html`<button type="button" class=${'inline-text ' + (cls || '') + (value ? '' : ' muted')} onClick=${() => { setV(value || ''); setEditing(true); }}>${value || placeholder}</button>`;
  }
  const done = () => { setEditing(false); if ((v || '').trim() !== (value || '')) onSave((v || '').trim()); };
  return html`<input class=${'inline-input ' + (cls || '')} value=${v} autoFocus aria-label=${placeholder} onInput=${(e) => setV(e.currentTarget.value)} onBlur=${done}
    onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value || ''); setEditing(false); } }} />`;
}

// A textarea that grows with its text and saves when it loses focus.
export function AutoText({ value, onSave, placeholder, cls, rows = 1, id, label, readOnly }) {
  const [v, setV] = useState(value || '');
  const ref = useRef();
  useEffect(() => setV(value || ''), [value]);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [v]);
  const commit = () => { if ((v || '') !== (value || '')) onSave(v); };
  return html`<textarea ref=${ref} id=${id} class=${cls} rows=${rows} value=${v} placeholder=${placeholder} aria-label=${label || placeholder}
    readOnly=${readOnly} onInput=${(e) => setV(e.currentTarget.value)} onBlur=${commit}
    onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && cls === 'title-input') { e.preventDefault(); e.currentTarget.blur(); } }}></textarea>`;
}

// Generic task row used in lists (home, team, blockers, projects).
export function TaskRow({ t, showProject = true, showOwner = true, extra }) {
  const subtasks = getState().checklist.filter((c) => c.task_id === t.id);
  const doneSub = subtasks.filter((c) => c.done).length;
  const ht = !isClaude(t) && t.htype && t.htype !== 'general' ? HTYPE[t.htype] : null;
  return html`<div class=${'trow' + (t.status === 'done' ? ' is-done' : '') + (t._pending ? ' is-pending' : '') + (isClaude(t) ? ' is-claude' : '')}
    onClick=${() => openTask(t.id)} role="button" tabindex="0" onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
    <${StatusPill} t=${t} />
    <div class="trow-main">
      <div class="trow-title">${t.private ? html`<${Icon} name="lock" size=${13} cls="muted" />` : null}${t.title}</div>
      <div class="trow-meta">
        ${t.flagged ? html`<span class="flag-chip"><${Icon} name="alert" size=${12} />חשוד</span>` : null}
        ${ht ? html`<span class="htype-chip"><${Icon} name=${ht.icon} size=${13} />${ht.label}</span>` : null}
        ${isClaude(t) && !showOwner ? html`<span class="claude-chip"><${Icon} name="sparkle" size=${12} />Claude</span>` : null}
        ${showProject && t.project_id ? html`<${ProjectChip} id=${t.project_id} />` : null}
        ${subtasks.length ? html`<span class="meta-item"><${Icon} name="checklist" size=${13} />${doneSub}/${subtasks.length}</span>` : null}
        ${extra || null}
      </div>
    </div>
    <div class="trow-side">
      <${DueButton} t=${t} />
      <${PriorityButton} t=${t} compact />
      <${FocusStar} t=${t} />
      ${showOwner ? html`<${OwnerButton} t=${t} size=${24} />` : null}
    </div>
  </div>`;
}

// ---------- global layers ----------
export function MenuLayer() {
  const s = useStore();
  const m = s.menu;
  useEffect(() => {
    if (!m) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    const onScroll = () => closeMenu();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onScroll); };
  }, [m]);
  if (!m) return null;
  const W = 240;
  const H = Math.min(m.items.length * 40 + 12, 380);
  let left = m.rect.right - W;
  left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
  let top = m.rect.bottom + 6;
  if (top + H > window.innerHeight - 8) top = Math.max(8, m.rect.top - 6 - H);
  return html`<div class="menu-backdrop" onClick=${closeMenu} onScroll=${closeMenu}>
    <div class="menu" role="menu" style=${`left:${left}px;top:${top}px;width:${W}px;max-height:${H}px`} onClick=${(e) => e.stopPropagation()}>
      ${m.items.map((it) => html`<button type="button" role="menuitem" class=${'menu-item' + (it.id === m.selected ? ' sel' : '') + (it.danger ? ' danger' : '')}
        onClick=${() => { closeMenu(); m.onPick(it.id); }}>
        ${it.person ? html`<${Avatar} p=${it.person} size=${22} />` : null}
        ${it.color && !it.flag && !it.dot ? html`<span class="swatch" style=${`background:${it.color}`}></span>` : null}
        ${it.dot ? html`<span class="dot" style=${`background:${it.color}`}></span>` : null}
        ${it.flag ? html`<span style=${`color:${it.color};display:inline-flex`}><${Icon} name="flag" size=${15} /></span>` : null}
        ${it.icon ? html`<${Icon} name=${it.icon} size=${16} />` : null}
        <span class="menu-label">${it.label}</span>
        ${it.id === m.selected ? html`<${Icon} name="check" size=${15} cls="menu-check" />` : null}
      </button>`)}
    </div>
  </div>`;
}

export function Toasts() {
  const s = useStore();
  if (!s.toasts.length) return null;
  return html`<div class="toasts" role="status" aria-live="polite">
    ${s.toasts.map((t) => html`<div class=${'toast ' + t.kind} key=${t.id}>
      <span>${t.text}</span>
      ${t.action ? html`<button type="button" onClick=${() => { dismissToast(t.id); t.action.run(); }}>${t.action.label}</button>` : null}
      <button type="button" class="toast-x" aria-label="סגירה" onClick=${() => dismissToast(t.id)}><${Icon} name="x" size=${14} /></button>
    </div>`)}
  </div>`;
}

export function Modal({ title, children, onClose = closeModal, wide, cls = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !getState().menu && !getState().guardAsk) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`<div class="overlay" onClick=${onClose}>
    <div class=${'modal' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '')} role="dialog" aria-modal="true" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
      <header class="modal-head"><h2>${title}</h2>
        <button type="button" class="icon-btn" aria-label="סגירה" onClick=${onClose}><${Icon} name="x" /></button></header>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

// Text with clickable links and highlighted @mentions of people.
const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;
export function linksIn(text) { return (text || '').match(URL_RE) || []; }
export function RichText({ text }) {
  if (!text) return null;
  const names = getState().people.map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
  const out = [];
  (text.split(URL_RE)).forEach((part, i) => {
    if (i % 2 === 1) { out.push(html`<a href=${part} target="_blank" rel="noopener noreferrer" onClick=${(e) => e.stopPropagation()}>${part.replace(/^https?:\/\//, '').slice(0, 60)}</a>`); return; }
    let rest = part;
    while (rest) {
      const at = rest.indexOf('@');
      if (at < 0) { out.push(rest); break; }
      const name = names.find((n) => rest.startsWith(n, at + 1));
      if (!name) { out.push(rest.slice(0, at + 1)); rest = rest.slice(at + 1); continue; }
      if (at) out.push(rest.slice(0, at));
      out.push(html`<span class="mention">@${name}</span>`);
      rest = rest.slice(at + 1 + name.length);
    }
  });
  return out;
}

// A one-line input that suggests team members after "@".
export function MentionInput({ id, value, onInput, placeholder }) {
  const ref = useRef();
  const [sel, setSel] = useState(0);
  const m = /(^|\s)@([^\s@]*)$/.exec(value);
  const people = getState().people;
  const options = m ? people.filter((p) => p.name.startsWith(m[2])).slice(0, 5) : [];
  const pick = (p) => {
    onInput(value.slice(0, value.length - m[2].length - 1) + '@' + p.name + ' ');
    setSel(0);
    if (ref.current) ref.current.focus();
  };
  const onKeyDown = (e) => {
    if (!options.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((sel + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((sel - 1 + options.length) % options.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[Math.min(sel, options.length - 1)]); }
  };
  return html`<div class="mention-wrap">
    <input ref=${ref} id=${id} value=${value} placeholder=${placeholder} aria-label=${placeholder} autocomplete="off"
      onInput=${(e) => { setSel(0); onInput(e.currentTarget.value); }} onKeyDown=${onKeyDown} />
    ${options.length ? html`<ul class="mention-menu" role="listbox">${options.map((p, i) => html`<li key=${p.id}>
      <button type="button" role="option" aria-selected=${i === sel ? 'true' : 'false'} class=${i === sel ? 'sel' : ''}
        onMouseDown=${(e) => { e.preventDefault(); pick(p); }}><${Avatar} p=${p} size=${20} />${p.name}</button></li>`)}</ul>` : null}
  </div>`;
}

export function navigate(hash) { if (location.hash !== hash) location.hash = hash; set({ menu: null }); }
