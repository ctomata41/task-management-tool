// Building blocks for the manual version: icons, avatars, capsules, the stage strip, sheets and toasts. Sheets and toasts
// use the app's layer classes and springs (app/motion.js), so they move exactly like the rest of the platform.
import { h } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import htm from 'htm';
import { useLayer, useThumb, motion, reducedMotion } from '../app/motion.js';
import { ICONS } from './icons.js';
import { useStore, set, getState, person, project, dismissToast, closeSheet, isCommander, setRank, rankedProjects, canSeeTask } from './store.js';
import { HEALTH, CLASSIFICATION, ASK_STATE, status, localDay, inOrder, askState } from './card.js';

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

// ---------- the order and the asks ----------
// A project's place in the order as a capsule. The commander moves it from here, with a menu that grows from the
// capsule; the team reads it; outside partners never see places. Held, stopped, finished and personal projects have none.
// On a row of the order it is the number alone; `full` spells it out for a project's own page: "מקום 2 מתוך 4".
export function RankCap({ p, full = false }) {
  if (!inOrder(p) || person(getState().me).role === 'external') return null;
  const cls = 'rank-cap' + (p.rank ? '' : ' unplaced');
  const words = p.rank ? `מקום ${p.rank}${full ? ` מתוך ${rankedProjects().length}` : ''}` : '';
  const text = !p.rank ? 'עוד בלי מקום' : full ? words : String(p.rank);
  if (!isCommander()) return html`<span class=${cls}>${p.rank && !full ? html`<span class="sr">מקום </span>` : null}${text}</span>`;
  const pick = (e) => {
    e.preventDefault(); // it may sit on a row that is a link
    e.stopPropagation();
    // Every place there is, and one more at the end for a project that has none yet.
    const n = rankedProjects().filter((x) => x.id !== p.id).length + 1;
    const items = Array.from({ length: n }, (_, i) => ({ id: i + 1, label: i ? `למקום ${i + 1}` : 'לראש הסדר' }));
    openMenu(e, items, { selected: p.rank || null, onPick: (k) => setRank(p.id, k) });
  };
  return html`<button type="button" class=${cls} aria-haspopup="menu" onClick=${pick}
    aria-label=${p.rank ? `${words} בסדר העדיפויות. לשנות את המקום` : 'עוד בלי מקום בסדר העדיפויות. לקבוע מקום'}>${text}</button>`;
}

// When the rows of a list change order, each row slides from where it was on screen to its new place, on a spring
// (damping 1) that starts at the row's current offset and speed. Under reduced motion the rows just swap. The rows
// must be keyed, so that Preact moves the same nodes instead of rewriting them in place.
export function useFlip(listRef) {
  const last = useRef(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.children];
    const top = list.getBoundingClientRect().top;
    // Where each row sits in the list, without the offset a spring may still be giving it.
    const now = new Map(rows.map((el) => [el, el.getBoundingClientRect().top - top - (el.__motion ? el.__motion.get('y') : 0)]));
    const prev = last.current;
    last.current = now;
    if (!prev || reducedMotion()) return;
    const kept = rows.filter((el) => prev.has(el));
    const was = [...prev.keys()].filter((el) => now.has(el));
    if (kept.every((el, i) => el === was[i])) return; // the same order: nothing moves
    let far = null;
    for (const el of kept) {
      const dy = prev.get(el) - now.get(el);
      if (Math.abs(dy) < 0.5) continue;
      const m = motion(el);
      const v = m.velocity('y');
      m.set({ y: m.get('y') + dy });
      const done = m.to({ y: 0 }, { damping: 1, response: 0.42, velocity: { y: v } });
      if (!far || Math.abs(dy) > far.d) far = { el, d: Math.abs(dy), done };
    }
    // The row that travels furthest, the one that was picked, passes over the others.
    if (far) {
      const mark = {};
      far.el.__lift = mark;
      far.el.classList.add('flip-lift');
      far.done.then(() => { if (far.el.__lift === mark) far.el.classList.remove('flip-lift'); });
    }
  });
}

// An ask's state as a tinted capsule: נשלחה, התקבלה, בעבודה 1/3, צריך לדבר, המשימות בוצעו, באיחור or בוצעה
// (card.askState). It counts only the tasks under it that I may see, so it never reveals work behind a lock.
export const askSeen = (t) => askState(t, getState().tasks.filter((x) => x.parent !== t.id || canSeeTask(x)));
export const askWords = (a) => (a.state === 'doing' ? `${ASK_STATE.doing.label} ${a.n}/${a.m}` : ASK_STATE[a.state].label);
export function AskPill({ t }) {
  const a = askSeen(t);
  return html`<${Pill} color=${ASK_STATE[a.state].color} cls="ask-pill">${askWords(a)}</${Pill}>`;
}

// The stage path as a row of segments: closed, current (and whether it waits for the commander), still ahead. `bare`
// keeps a locked project to its one line: each segment says only where it stands, never the stage's name.
export function StageStrip({ p, labels, onPick, bare = false }) {
  if (!p.stages.length) return html`<div class="strip empty muted small">עוד אין שלבים</div>`;
  return html`<div class=${'strip' + (labels ? ' with-labels' : '')} role="list" aria-label="שלבי הפרויקט">
    ${p.stages.map((s) => {
      const cls = s.state === 'done' ? 'done' : s.state === 'skipped' ? 'skip' : s.state === 'active' ? 'cur' : s.state === 'pending' ? 'cur pend' : 'todo';
      const word = { done: 'נסגר', skipped: 'דילגנו', active: 'עכשיו', pending: 'מחכה לאישור', todo: 'בהמשך' }[s.state];
      const title = bare ? word : `${s.name} · ${word}`;
      const inner = html`<span class="seg-bar"></span>${labels && !bare ? html`<span class="seg-name">${s.name}</span>` : null}`;
      return onPick && !bare
        ? html`<button type="button" role="listitem" class=${'sseg ' + cls} title=${title} onClick=${() => onPick(s)}>${inner}</button>`
        : html`<span role="listitem" class=${'sseg ' + cls} title=${title}>${inner}</span>`;
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

// The page's title as the place focus lands when what held it is gone, rather than the top of the document.
function focusTitle() {
  const h = document.querySelector('#content h1');
  if (!h) return;
  h.tabIndex = -1;
  h.focus({ preventScroll: true });
}
// A button that takes its own row away (an answer, הבנתי, דיברנו, לאשר) hands focus on, so a keyboard or screen-reader
// user doesn't start again from the top: to the next row of the list, else the one before it, else to the next control
// after the list, else to the page's title. Never to a text field after the list (the board's search): on a phone,
// focus there after a tap would show its ring and could raise the keyboard. Called before the change; it acts after
// the render, and only if focus was lost.
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])';
const TYPING = 'input:not([type=checkbox]):not([type=radio]), textarea';
export function keepFocus(e, rowSel) {
  const row = e.currentTarget.closest(rowSel);
  const list = row?.parentElement;
  if (!list) return;
  const rows = [...list.children].filter((x) => x.matches(rowSel));
  const i = rows.indexOf(row);
  const first = (x) => (x.matches(FOCUSABLE) ? x : x.querySelector(FOCUSABLE));
  const near = [...rows.slice(i + 1), ...rows.slice(0, i).reverse()].map(first).filter(Boolean);
  const after = [...document.querySelectorAll(FOCUSABLE)].find((x) => !list.contains(x) && !x.matches(TYPING) && x.getClientRects().length
    && (list.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING));
  requestAnimationFrame(() => {
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const to = [...near, after].find((x) => x?.isConnected && !x.disabled && x.getClientRects().length);
    if (to) to.focus(); else focusTitle();
  });
}

// A dialog takes focus when it opens (unless a field in it already did) and gives it back to what opened it, or to the
// page's title when that is gone (an ask that was answered or done, a row that moved away).
export function useDialogFocus(panel) {
  useEffect(() => {
    const opener = document.activeElement;
    const el = panel.current;
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      const a = document.activeElement;
      if (a && a !== document.body && !el.contains(a)) return;
      if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
      else focusTitle();
    };
  }, []);
}

// A toast docked at the top while a sheet is open lets presses through to what is under it (m.css), so a tap on its
// words, or just beside its buttons, can land on the dimmed backdrop of a short sheet. That tap was meant for the toast:
// the sheet stays open, with what was typed in it.
const onToast = (e) => [...document.querySelectorAll('.toasts .toast')].some((t) => {
  const b = t.getBoundingClientRect();
  return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
});

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
  useDialogFocus(panel);
  return html`<div class=${'overlay' + (kind === 'drawer' ? ' side-ov' : '')} ref=${root} onClick=${(e) => { if (!onToast(e)) onClose(); }}>
    <div class=${'modal ' + (kind === 'drawer' ? 'pdrawer ' : '') + (wide ? 'wide ' : '') + cls} ref=${panel} role="dialog" aria-modal="true" aria-label=${title} tabindex="-1" onClick=${(e) => e.stopPropagation()}>
      <div class="grabber" aria-hidden="true"></div>
      <header class="modal-head"><h2>${title}</h2>
        <button type="button" class="icon-btn" aria-label="סגירה" onClick=${onClose}><${Icon} name="x" /></button></header>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

export function Toasts() {
  const s = useStore();
  const ref = useRef();
  useGlide(ref);
  if (!s.toasts.length) return null;
  return html`<div class="toasts" role="status" aria-live="polite" ref=${ref}>${s.toasts.map((t) => html`<${Toast} key=${t.id} t=${t} />`)}</div>`;
}
// Toasts sit above the tab bar, and on a phone at the top of the screen while a sheet is open (m.css), so a toast still
// showing when that changes, or when the stack around it changes, glides to its new place on a spring (damping 1) from
// where it was. Measured by layout (offsetTop), so a toast's own entrance doesn't count as a move.
function useGlide(ref) {
  const last = useRef(new Map());
  useLayoutEffect(() => {
    const box = ref.current;
    const now = new Map();
    if (box) {
      const top = box.getBoundingClientRect().top;
      for (const el of box.children) now.set(el, top + el.offsetTop);
    }
    const prev = last.current;
    last.current = now;
    if (reducedMotion()) return;
    for (const [el, at] of now) {
      const dy = prev.has(el) ? prev.get(el) - at : 0;
      if (Math.abs(dy) < 0.5) continue;
      const m = motion(el);
      const v = m.velocity('y');
      m.set({ y: m.get('y') + dy });
      m.to({ y: 0 }, { damping: 1, response: 0.42, velocity: { y: v } });
    }
  });
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
  const trigger = e.currentTarget;
  set({ menu: { rect: trigger.getBoundingClientRect(), trigger, items, selected, onPick } });
}
const closeMenu = () => set({ menu: null });
export function MenuLayer() {
  const s = useStore();
  const m = s.menu;
  useEffect(() => {
    if (!m) return undefined;
    // Escape closes only the menu, not the sheet it was opened from.
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); closeMenu(); } };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', closeMenu);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', closeMenu); };
  }, [m]);
  if (!m) return null;
  return html`<${Menu} key=${`${Math.round(m.rect.top)}:${Math.round(m.rect.left)}:${m.items.length}`} m=${m} />`;
}
function Menu({ m }) {
  const root = useRef();
  const panel = useRef();
  const row = matchMedia('(max-width: 900px)').matches ? 46 : 40;
  const W = 240;
  const H = Math.min(m.items.length * row + 12, 380);
  let left = m.rect.right - W;
  left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
  let top = m.rect.bottom + 6;
  if (top + H > window.innerHeight - 8) top = Math.max(8, m.rect.top - 6 - H);
  const up = top < m.rect.bottom;
  const ox = Math.round(Math.min(W, Math.max(0, m.rect.left + m.rect.width / 2 - left)));
  const oy = up ? H : 0;
  // H is an estimate from the row height. A menu that opens upward has to end right above its control and grow from
  // there, so before its first frame its real height places it.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!up || !el) return;
    const h = el.offsetHeight;
    el.style.top = `${Math.max(8, m.rect.top - 6 - h)}px`;
    el.style.transformOrigin = `${ox}px ${h}px`;
  }, []);
  useLayer(root, panel, { kind: 'menu' });
  // Focus moves into the menu (to the chosen item or the first), the arrows walk it, and closing hands focus back.
  useEffect(() => {
    const el = panel.current;
    (el.querySelector('.menu-item.sel') || el.querySelector('.menu-item'))?.focus({ preventScroll: true });
    return () => {
      const a = document.activeElement;
      if (m.trigger?.isConnected && (!a || a === document.body || el.contains(a))) m.trigger.focus({ preventScroll: true });
    };
  }, []);
  const onKeyDown = (e) => {
    const items = [...panel.current.querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? -1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'Tab') { e.preventDefault(); closeMenu(); }
  };
  return html`<div class="menu-backdrop" ref=${root} onClick=${closeMenu}>
    <div class="menu" role="menu" ref=${panel} style=${`left:${left}px;top:${top}px;width:${W}px;max-height:${H}px;transform-origin:${ox}px ${oy}px`} onClick=${(e) => e.stopPropagation()} onKeyDown=${onKeyDown}>
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
