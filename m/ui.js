// Building blocks for the manual version: icons, avatars, capsules, the stage strip, sheets and toasts. Sheets and toasts
// use the app's layer classes and springs (app/motion.js), so they move exactly like the rest of the platform.
import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import htm from 'htm';
import { useLayer, useThumb } from '../app/motion.js';
import { ICONS } from './icons.js';
import { useStore, set, person, project, dismissToast, closeSheet } from './store.js';
import { HEALTH, CLASSIFICATION, status, localDay } from './card.js';

export const html = htm.bind(h);

export function Icon({ name, size = 18, cls = '' }) {
  return html`<svg class=${'ic ' + cls} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: ICONS[name] || '' }}></svg>`;
}

export function Avatar({ id, size = 26, ring }) {
  const p = person(id);
  if (!p.id) return html`<span class="avatar none" style=${`width:${size}px;height:${size}px`} title="לא שובץ"><${Icon} name="user" size=${Math.round(size * 0.55)} /></span>`;
  const ext = p.role === 'external';
  return html`<span class=${'avatar' + (ring ? ' ring' : '') + (ext ? ' ext' : '')} title=${p.name + (ext ? ` · ${p.org || 'מחוץ לצוות'}` : '')}
    style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${p.color}`}>${p.name.replace(/^ד"ר /, '').slice(0, 2)}</span>`;
}
export function Faces({ ids, size = 24, max = 4 }) {
  const shown = ids.slice(0, max);
  return html`<span class="faces">${shown.map((id) => html`<${Avatar} key=${id} id=${id} size=${size} ring />`)}${ids.length > max ? html`<span class="faces-more">+${ids.length - max}</span>` : null}</span>`;
}

export function Pill({ color, children, cls = '' }) {
  return html`<span class=${'spill ' + cls} style=${`--c:${color}`}>${children}</span>`;
}
export function ProjectTag({ id }) {
  const p = project(id);
  if (!p) return null;
  return html`<a class="ptag" href=${`#/project/${p.id}`} style=${`--c:${p.color}`} onClick=${(e) => e.stopPropagation()}><i></i>${p.name}</a>`;
}
export function Classified({ p, small }) {
  if (!p || p.classification !== 'restricted') return null;
  return html`<span class=${'cls-tag' + (small ? ' sm' : '')} title=${CLASSIFICATION.restricted.hint}><${Icon} name="lock" size=${small ? 11 : 13} />${CLASSIFICATION.restricted.label}</span>`;
}
export function Health({ p }) {
  const st = status(p);
  const h0 = HEALTH[st.health];
  return html`<${Pill} color=${h0.color}>${h0.label}</${Pill}>`;
}

// The stage path as a row of segments: closed, current (and whether it waits for the commander), still ahead.
export function StageStrip({ p, labels, onPick }) {
  if (!p.stages.length) return html`<div class="strip empty muted small">עוד אין שלבים</div>`;
  return html`<div class=${'strip' + (labels ? ' with-labels' : '')} role="list" aria-label="שלבי הפרויקט">
    ${p.stages.map((s) => {
      const cls = s.state === 'done' ? 'done' : s.state === 'skipped' ? 'skip' : s.state === 'active' ? 'cur' : s.state === 'pending' ? 'cur pend' : 'todo';
      const word = { done: 'נסגר', skipped: 'דילגנו', active: 'עכשיו', pending: 'מחכה לאישור', todo: 'בהמשך' }[s.state];
      const inner = html`<span class="seg-bar"></span>${labels ? html`<span class="seg-name">${s.name}</span>` : null}`;
      return onPick
        ? html`<button type="button" role="listitem" class=${'sseg ' + cls} title=${`${s.name} · ${word}`} onClick=${() => onPick(s)}>${inner}</button>`
        : html`<span role="listitem" class=${'sseg ' + cls} title=${`${s.name} · ${word}`}>${inner}</span>`;
    })}
  </div>`;
}

export function Seg({ value, options, onChange, label, cls = '' }) {
  const ref = useRef();
  useThumb(ref);
  return html`<div class=${'seg ' + cls} role="tablist" aria-label=${label} ref=${ref}><span class="seg-thumb"></span>
    ${options.map((o) => html`<button type="button" role="tab" aria-selected=${o.id === value} class=${o.id === value ? 'on' : ''} onClick=${() => onChange(o.id)}>${o.label}${o.n ? html`<span class="seg-n">${o.n}</span>` : null}</button>`)}
  </div>`;
}

// A bottom sheet on phones (drag down to close), a dialog that grows from what was pressed on desktop.
export function Sheet({ title, children, wide, cls = '', onClose = closeSheet, kind = 'modal' }) {
  const root = useRef();
  const panel = useRef();
  useLayer(root, panel, { kind, onClose });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`<div class=${'overlay' + (kind === 'drawer' ? ' side-ov' : '')} ref=${root} onClick=${onClose}>
    <div class=${'modal ' + (kind === 'drawer' ? 'pdrawer ' : '') + (wide ? 'wide ' : '') + cls} ref=${panel} role="dialog" aria-modal="true" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
      <div class="grabber" aria-hidden="true"></div>
      <header class="modal-head"><h2>${title}</h2>
        <button type="button" class="icon-btn" aria-label="סגירה" onClick=${onClose}><${Icon} name="x" /></button></header>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

export function Toasts() {
  const s = useStore();
  if (!s.toasts.length) return null;
  return html`<div class="toasts" role="status" aria-live="polite">${s.toasts.map((t) => html`<${Toast} key=${t.id} t=${t} />`)}</div>`;
}
function Toast({ t }) {
  const ref = useRef();
  useLayer(ref, ref, { kind: 'toast' });
  return html`<div class="toast" ref=${ref}>
    <span>${t.text}</span>
    ${t.action ? html`<button type="button" onClick=${() => { dismissToast(t.id); t.action.run(); }}>${t.action.label}</button>` : null}
    <button type="button" class="toast-x" aria-label="סגירה" onClick=${() => dismissToast(t.id)}><${Icon} name="x" size=${14} /></button>
  </div>`;
}

export function Empty({ icon = 'check', children }) {
  return html`<div class="m-empty"><${Icon} name=${icon} size=${20} /><span>${children}</span></div>`;
}

// ---------- time words ----------
// A deadline always shows its date, and beside it how far that is: "30/10 (מחר)", "16/10 (לפני 12 ימים)".
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
// A date-only string ("2026-10-30") is that day here, not midnight in London.
export const parseDay = localDay;
export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOf = (d) => { const x = parseDay(d); x.setHours(0, 0, 0, 0); return x; };
export const dayDiff = (iso) => Math.round((startOf(iso) - startOf(Date.now())) / 864e5);
export function dueDate(iso) {
  if (!iso) return '';
  const d = parseDay(iso);
  // Another year shows as two digits; a mistyped one ("0026") shows in full, so it doesn't pass for 2026.
  const Y = d.getFullYear();
  const y = Y === new Date().getFullYear() ? '' : `/${Y >= 2000 && Y < 2100 ? String(Y).slice(2) : String(Y).padStart(4, '0')}`;
  return `${d.getDate()}/${d.getMonth() + 1}${y}`;
}
const span = (n, one, two, many) => (n === 1 ? one : n === 2 ? two : `${n} ${many}`);
const far = (n) => (n < 7 ? span(n, 'יום', 'יומיים', 'ימים') : n === 7 ? 'שבוע' : n < 14 ? `${n} ימים` : n < 60 ? span(Math.round(n / 7), 'שבוע', 'שבועיים', 'שבועות') : span(Math.round(n / 30), 'חודש', 'חודשיים', 'חודשים'));
export function dueRel(iso) {
  if (!iso) return '';
  const n = dayDiff(iso);
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === -1) return 'אתמול';
  if (n < 0) return `לפני ${far(-n)}`;
  if (n < 7) return `יום ${DAYS[parseDay(iso).getDay()]}`;
  return `בעוד ${far(n)}`;
}
export const dueWord = (iso) => (iso ? `${dueDate(iso)} (${dueRel(iso)})` : '');
export function ago(iso) {
  if (!iso) return 'אף פעם';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const hh = Math.round(m / 60);
  if (hh < 24) return hh === 1 ? 'לפני שעה' : `לפני ${hh} שעות`;
  const d = Math.round(hh / 24);
  return d === 1 ? 'אתמול' : d === 2 ? 'לפני יומיים' : `לפני ${d} ימים`;
}
export const dateInput = (iso) => (iso ? String(iso).slice(0, 10) : '');

export const OUT_KIND = {
  doc: { label: 'מסמך', icon: 'file' },
  sheet: { label: 'טבלה', icon: 'table' },
  deck: { label: 'מצגת', icon: 'grid' },
  meeting: { label: 'סיכום פגישה', icon: 'mic' },
  image: { label: 'תמונה', icon: 'eye' },
  link: { label: 'קישור', icon: 'link' },
  pointer: { label: 'ברשת המסווגת', icon: 'lock' },
};
export const LEVEL = {
  draft: { label: 'טיוטה', color: 'var(--s-todo)' },
  pilot: { label: 'לפיילוט', color: 'var(--s-progress)' },
  final: { label: 'סופי', color: 'var(--s-done)' },
};

// ---------- menus: a menu grows out of the control that opened it ----------
export function openMenu(e, items, { selected, onPick }) {
  const rect = e.currentTarget.getBoundingClientRect();
  set({ menu: { rect, items, selected, onPick } });
}
const closeMenu = () => set({ menu: null });
export function MenuLayer() {
  const s = useStore();
  const m = s.menu;
  useEffect(() => {
    if (!m) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', closeMenu);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', closeMenu); };
  }, [m]);
  if (!m) return null;
  return html`<${Menu} key=${`${Math.round(m.rect.top)}:${Math.round(m.rect.left)}:${m.items.length}`} m=${m} />`;
}
function Menu({ m }) {
  const root = useRef();
  const panel = useRef();
  useLayer(root, panel, { kind: 'menu' });
  const row = matchMedia('(max-width: 900px)').matches ? 46 : 40;
  const W = 240;
  const H = Math.min(m.items.length * row + 12, 380);
  let left = m.rect.right - W;
  left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
  let top = m.rect.bottom + 6;
  if (top + H > window.innerHeight - 8) top = Math.max(8, m.rect.top - 6 - H);
  const ox = Math.round(Math.min(W, Math.max(0, m.rect.left + m.rect.width / 2 - left)));
  const oy = top >= m.rect.bottom ? 0 : H;
  return html`<div class="menu-backdrop" ref=${root} onClick=${closeMenu}>
    <div class="menu" role="menu" ref=${panel} style=${`left:${left}px;top:${top}px;width:${W}px;max-height:${H}px;transform-origin:${ox}px ${oy}px`} onClick=${(e) => e.stopPropagation()}>
      ${m.items.map((it) => html`<button type="button" role="menuitem" class=${'menu-item' + (it.id === m.selected ? ' sel' : '') + (it.danger ? ' danger' : '')}
        onClick=${() => { closeMenu(); m.onPick(it.id); }}>
        ${it.person ? html`<${Avatar} id=${it.person} size=${22} />` : null}
        ${it.dot ? html`<span class="dot" style=${`background:${it.dot}`}></span>` : null}
        ${it.icon ? html`<${Icon} name=${it.icon} size=${16} />` : null}
        <span class="menu-label">${it.label}</span>
        ${it.id === m.selected ? html`<${Icon} name="check" size=${15} cls="menu-check" />` : null}
      </button>`)}
    </div>
  </div>`;
}
