// Building blocks for the prototype: icons (the app's set plus a few), avatars, a progress ring, sheets and toasts.
// Sheets and toasts reuse the app's layer classes and springs (app/motion.js), so they move exactly like the app.
import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import htm from 'htm';
import { useLayer, useThumb } from '../app/motion.js';
import { useStore, person, project, dismissToast, closeSheet } from './store.js';

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
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
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
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
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
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4z"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  upload: '<path d="M12 20V9M7 13l5-5 5 5M5 4h14"/>',
  send: '<path d="M20 4 3.5 11l7 2.5L13 20.5z"/><path d="m20 4-9.5 9.5"/>',
  layers: '<path d="m12 4 9 5-9 5-9-5z"/><path d="m3 14 9 5 9-5"/>',
};
export function Icon({ name, size = 18, cls = '' }) {
  return html`<svg class=${'ic ' + cls} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: ICONS[name] || '' }}></svg>`;
}

const ABBR = { yoash: 'יו', yonatan: 'ינ', yahali: 'יה', yarden: 'יר' };
export function Avatar({ id, size = 26, ring }) {
  const p = person(id);
  if (!p) return null;
  return html`<span class=${'avatar' + (ring ? ' ring' : '')} title=${p.name}
    style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.44)}px;background:${p.color}`}>${ABBR[id] || p.name.slice(0, 2)}</span>`;
}
export function Faces({ ids, size = 24 }) {
  return html`<span class="faces">${ids.map((id) => html`<${Avatar} key=${id} id=${id} size=${size} ring />`)}</span>`;
}
// The orange Claude mark, for whatever Claude did or is doing.
export function ClaudeMark({ size = 22, live }) {
  return html`<span class=${'cmark' + (live ? ' live' : '')} style=${`width:${size}px;height:${size}px`} aria-hidden="true">
    <svg viewBox="0 0 24 24" width=${Math.round(size * 0.62)} height=${Math.round(size * 0.62)}><path fill="currentColor" d="M12 2.5l1.6 6.1 6.1-3.5-3.5 6.1 6.1 1.6-6.1 1.6 3.5 6.1-6.1-3.5L12 21.5l-1.6-6.1-6.1 3.5 3.5-6.1-6.1-1.6 6.1-1.6-3.5-6.1 6.1 3.5z"/></svg>
  </span>`;
}

export function Ring({ value, size = 44, stroke = 5, color = 'var(--accent)', label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return html`<span class="ring-wrap" style=${`width:${size}px;height:${size}px`} role="img" aria-label=${`${Math.round(value * 100)}% הושלם`}>
    <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`}>
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--fill)" stroke-width=${stroke} />
      <circle class="ring-arc" cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${color} stroke-width=${stroke} stroke-linecap="round"
        stroke-dasharray=${c} stroke-dashoffset=${c * (1 - value)} transform=${`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
    ${label !== false ? html`<b>${Math.round(value * 100)}</b>` : null}
  </span>`;
}
export function Bar({ value, color = 'var(--accent)' }) {
  return html`<span class="pbar" role="progressbar" aria-valuenow=${Math.round(value * 100)} aria-valuemin="0" aria-valuemax="100">
    <i style=${`width:${Math.round(value * 100)}%;background:${color}`}></i></span>`;
}

export function ProjectTag({ id }) {
  const p = project(id);
  if (!p) return null;
  return html`<a class="ptag" href=${`#/project/${p.id}`} style=${`--c:${p.color}`}><i></i>${p.name}</a>`;
}

export function Seg({ value, options, onChange, label }) {
  const ref = useRef();
  useThumb(ref);
  return html`<div class="seg" role="tablist" aria-label=${label} ref=${ref}><span class="seg-thumb"></span>
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
    <${ClaudeMark} size=${22} />
    <span>${t.text}</span>
    ${t.action ? html`<button type="button" onClick=${() => { dismissToast(t.id); t.action.run(); }}>${t.action.label}</button>` : null}
    <button type="button" class="toast-x" aria-label="סגירה" onClick=${() => dismissToast(t.id)}><${Icon} name="x" size=${14} /></button>
  </div>`;
}

// ---------- time words ----------
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const hm = (iso) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
export function dayWord(iso) {
  const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / 864e5);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  return `יום ${DAYS[d.getDay()]}`;
}
export const when = (iso) => `${dayWord(iso)} ${hm(iso)}`;
export function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60e3);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const hh = Math.round(m / 60);
  if (hh < 24) return hh === 1 ? 'לפני שעה' : hh === 2 ? 'לפני שעתיים' : `לפני ${hh} שעות`;
  const d = Math.round(hh / 24);
  return d === 1 ? 'אתמול' : d === 2 ? 'לפני יומיים' : `לפני ${d} ימים`;
}
export function dueWord(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'עבר המועד';
  if (ms < 864e5 && new Date(iso).getDate() === new Date().getDate()) return `עד ${hm(iso)} היום`;
  return `עד ${dayWord(iso)}`;
}
export const OUT_KIND = {
  video: { label: 'סרטון', icon: 'play', color: '#ff2d55' },
  doc: { label: 'מסמך', icon: 'file', color: '#5856d6' },
  research: { label: 'מחקר', icon: 'search', color: '#0071e3' },
  chart: { label: 'גרף', icon: 'chart', color: '#30b0c7' },
  code: { label: 'קוד', icon: 'code', color: '#34c759' },
  app: { label: 'אפליקציה', icon: 'code', color: '#34c759' },
  report: { label: 'דוח', icon: 'report', color: '#ff9500' },
  deck: { label: 'מצגת', icon: 'grid', color: '#ff9500' },
  image: { label: 'תמונה', icon: 'eye', color: '#af52de' },
  other: { label: 'קובץ', icon: 'link', color: '#8e8e93' },
};
export const HTYPE = {
  connect: { label: 'חיבור כלי', icon: 'plug' },
  auth: { label: 'הזדהות ואישור', icon: 'key' },
  file: { label: 'קובץ', icon: 'upload' },
  pay: { label: 'תשלום', icon: 'card' },
  meeting: { label: 'פגישה', icon: 'calendar' },
  other: { label: 'פעולה', icon: 'check' },
};
