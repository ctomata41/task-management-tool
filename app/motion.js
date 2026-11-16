// Motion for the whole app, after Apple's "Designing Fluid Interfaces" (WWDC 2018). Everything that moves is a spring
// that starts from what is on screen, takes the finger's velocity, and can be grabbed or reversed mid-flight.
// A spring takes Apple's two parameters: damping (1 settles without bouncing, lower bounces) and response (how quickly
// it gets there, in seconds; a spring has no fixed duration). Bounce only where a gesture carried momentum.
import { useLayoutEffect, useRef } from 'preact/hooks';

const media = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false });
const reduceQ = media('(prefers-reduced-motion: reduce)');
const narrowQ = media('(max-width: 900px)');
export const reducedMotion = () => reduceQ.matches;

// ---------- springs ----------
const running = new Set();
let frame = 0;
let before = 0;
function tick(now) {
  const dt = Math.min(0.05, Math.max(0, (now - before) / 1000));
  before = now;
  for (const s of [...running]) s.step(dt);
  frame = running.size ? requestAnimationFrame(tick) : 0;
}

export class Spring {
  constructor(value, onChange) { this.x = value; this.v = 0; this.goal = value; this.onChange = onChange; this.waiting = []; }
  // Hold it at a value, as a finger does: no animation.
  set(x) { this.stop(); this.x = x; this.goal = x; this.v = 0; this.onChange?.(x); }
  // Head for a goal from wherever it is now, keeping its current velocity unless a new one is given.
  to(goal, { damping = 1, response = 0.35, velocity, precision = 0.01 } = {}) {
    this.goal = goal;
    if (velocity !== undefined) this.v = velocity;
    this.k = ((2 * Math.PI) / response) ** 2;
    this.c = (4 * Math.PI * damping) / response;
    this.eps = precision;
    running.add(this);
    if (!frame) { before = performance.now(); frame = requestAnimationFrame(tick); }
    return new Promise((done) => this.waiting.push(done));
  }
  step(dt) {
    for (let t = dt; t > 0; t -= 1 / 240) { // small fixed steps keep stiff springs stable
      const h = Math.min(1 / 240, t);
      this.v += (-this.k * (this.x - this.goal) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    if (Math.abs(this.x - this.goal) < this.eps && Math.abs(this.v) < this.eps * 20) {
      this.x = this.goal;
      this.v = 0;
      running.delete(this);
      this.onChange?.(this.x);
      this.settle(true);
      return;
    }
    this.onChange?.(this.x);
  }
  stop() { if (running.delete(this)) this.settle(false); }
  settle(arrived) { const w = this.waiting; this.waiting = []; w.forEach((f) => f(arrived)); }
}

// ---------- the springs of one element ----------
const REST = { x: 0, y: 0, scale: 1, opacity: 1 };
const PRECISION = { x: 0.5, y: 0.5, w: 0.5, scale: 0.001, opacity: 0.002 };
function paintTransform(el, m) {
  const x = m.get('x');
  const y = m.get('y');
  const s = m.get('scale');
  const o = m.get('opacity');
  el.style.transform = x || y || s !== 1 ? `translate3d(${x}px, ${y}px, 0)${s !== 1 ? ` scale(${s})` : ''}` : '';
  el.style.opacity = o < 1 ? String(Math.max(0, o)) : '';
}
// x and y are separate springs, so a throw keeps each axis's own velocity.
export function motion(el, paint = paintTransform) {
  if (el.__motion) return el.__motion;
  const m = {
    springs: {},
    spring: (k) => m.springs[k] || (m.springs[k] = new Spring(REST[k] ?? 0, () => m.paint())),
    get: (k) => (m.springs[k] ? m.springs[k].x : REST[k] ?? 0),
    velocity: (k) => (m.springs[k] ? m.springs[k].v : 0),
    set(values) { for (const k of Object.keys(values)) m.spring(k).set(values[k]); },
    to(values, opts = {}) {
      return Promise.all(Object.keys(values).map((k) => m.spring(k).to(values[k], {
        precision: PRECISION[k] ?? 0.01, ...opts, velocity: opts.velocity?.[k],
      })));
    },
    stop() { Object.values(m.springs).forEach((s) => s.stop()); },
    paint() { paint(el, m); m.onFrame?.(m); },
  };
  el.__motion = m;
  return m;
}

// Feedback a hand can feel, kept for moments that matter (a decision made, something done). Phones that support it.
export function haptic(kind = 'light') {
  try { navigator.vibrate?.(kind === 'success' ? [10, 60, 14] : 9); } catch (e) { /* not supported */ }
}

// ---------- layers: sheets, side panels, dialogs, menus, toasts ----------
// Where the last press was, so a dialog grows out of what was tapped.
let lastPress = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPress = { x: e.clientX, y: e.clientY, at: performance.now() }; }, { capture: true, passive: true });
}
function growFrom(panel) {
  if (!lastPress || performance.now() - lastPress.at > 800) { panel.style.transformOrigin = ''; return; }
  const r = panel.getBoundingClientRect();
  panel.style.transformOrigin = `${Math.round(lastPress.x - r.left)}px ${Math.round(lastPress.y - r.top)}px`;
}

// Phones get sheets from the bottom edge; wide screens a side panel from the inline end, or a dialog.
function modeOf(kind) {
  if (kind === 'alert' || kind === 'menu' || kind === 'toast') return kind;
  if (narrowQ.matches) return 'sheet';
  return kind === 'drawer' ? 'side' : 'dialog';
}
const endSign = (el) => (getComputedStyle(el).direction === 'rtl' ? -1 : 1);
// A toast comes in from the edge it sits by and leaves toward it: up near the top of the screen (on phones while a sheet
// is open, toasts move to the top), down near the bottom.
const edgeSign = (el) => (el.getBoundingClientRect().top < window.innerHeight / 2 ? -1 : 1);
const scrimOf = (root) => (p) => root.style.setProperty('--scrim', Math.min(1, Math.max(0, p)).toFixed(3));
const POP = { dialog: 0.92, alert: 1.1, menu: 0.86, toast: 0.92 };

function enter(root, panel, mode) {
  root.__layer = { mode, at: performance.now() }; // see shield()
  const m = motion(panel);
  const scrim = scrimOf(root);
  if (reducedMotion()) { // a cross-fade instead of a slide
    m.onFrame = () => scrim(m.get('opacity'));
    m.set({ opacity: 0 });
    m.to({ opacity: 1 }, { response: 0.2 });
  } else if (mode === 'sheet') {
    m.extent = panel.offsetHeight + 24;
    m.onFrame = () => scrim(1 - m.get('y') / m.extent);
    m.set({ y: m.extent });
    m.to({ y: 0 }, { damping: 1, response: 0.38 });
  } else if (mode === 'side') {
    m.extent = (panel.offsetWidth + 24) * endSign(panel);
    m.onFrame = () => scrim(1 - m.get('x') / m.extent);
    m.set({ x: m.extent });
    m.to({ x: 0 }, { damping: 1, response: 0.4 });
  } else {
    if (mode === 'dialog') growFrom(panel);
    m.onFrame = () => scrim(m.get('opacity'));
    const lift = mode === 'toast' ? { y: 16 * edgeSign(panel) } : {};
    m.set({ scale: POP[mode], opacity: 0, ...lift });
    m.to({ scale: 1, opacity: 1, ...(mode === 'toast' ? { y: 0 } : {}) }, { damping: 1, response: mode === 'menu' ? 0.24 : 0.32 });
  }
  return m;
}

// The leaving element is about to be removed, so an inert copy of it, outside the app, finishes the motion from where
// the original was and at the speed it was moving. The copy lives in a closed shadow root: nothing can query it.
let copyStyles;
function stylesForCopies() {
  if (copyStyles !== undefined) return copyStyles;
  try {
    const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n');
    copyStyles = new CSSStyleSheet();
    copyStyles.replaceSync(css);
  } catch (e) { copyStyles = null; }
  return copyStyles;
}
const pathTo = (root, el) => { const p = []; for (let n = el; n && n !== root; n = n.parentElement) p.unshift([...n.parentElement.children].indexOf(n)); return p; };
// Just under the layer it copies, so a new layer of the same kind opens above the one leaving.
function stackOf(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const z = parseInt(getComputedStyle(n).zIndex, 10);
    if (Number.isFinite(z)) return z - 1;
  }
  return 1;
}
function copyOf(root, panel) {
  const sheet = root.isConnected ? stylesForCopies() : null;
  if (!sheet) return null;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:${stackOf(root)}`;
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.adoptedStyleSheets = [sheet];
  const t = root.style.transform; // where the root sits without its own transform, since the copy carries it
  root.style.transform = 'none';
  const r = root.getBoundingClientRect();
  root.style.transform = t;
  const copy = root.cloneNode(true);
  // Field values and scroll positions are not attributes, so they do not come along with a clone.
  const fields = (n) => n.querySelectorAll('input, textarea, select');
  const theirs = fields(copy);
  fields(root).forEach((f, i) => {
    try { if (f.type === 'checkbox' || f.type === 'radio') theirs[i].checked = f.checked; else if (f.type !== 'file') theirs[i].value = f.value; } catch (e) { /* not settable */ }
  });
  Object.assign(copy.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, right: 'auto', bottom: 'auto', width: `${r.width}px`, height: `${r.height}px`, margin: '0', pointerEvents: 'none',
  });
  shadow.appendChild(copy);
  document.body.appendChild(host);
  const all = [root, ...root.querySelectorAll('*')];
  const mine = [copy, ...copy.querySelectorAll('*')];
  all.forEach((n, i) => { if ((n.scrollTop || n.scrollLeft) && mine[i]) { mine[i].scrollTop = n.scrollTop; mine[i].scrollLeft = n.scrollLeft; } });
  const p = pathTo(root, panel).reduce((n, i) => n?.children[i], copy) || copy;
  return { host, root: copy, panel: p };
}

// While a layer leaves, a press where it was (a second tap on its X, the second click of a double click) is still meant
// for it, so it doesn't reach what the layer uncovers until the layer has gone, as on iOS. A toast, which sits above
// every layer, and a layer that opens meanwhile (the next sheet of a hand-over) take presses as usual, and a key's click
// (Enter, Space) always goes through. A toast that leaves has no shield: one docked over a sheet's head lets drags
// through to it (m/m.css), and it leaves on a timer.
function shield(r, since, done) {
  const stop = (e) => {
    if ((e.type === 'click' && !e.detail) || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    for (let n = e.target; n; n = n.parentElement) if (n.__layer && (n.__layer.mode === 'toast' || n.__layer.at > since)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener('pointerdown', stop, true);
  document.addEventListener('click', stop, true);
  Promise.race([done, new Promise((ok) => setTimeout(ok, 700))]).then(() => {
    document.removeEventListener('pointerdown', stop, true);
    document.removeEventListener('click', stop, true);
  });
}

function leave(root, panel, mode) {
  const m = panel.__motion;
  m?.stop();
  const since = performance.now();
  const rect = panel.getBoundingClientRect();
  const copy = copyOf(root, panel);
  if (!copy) return;
  const g = motion(copy.panel);
  const scrim = scrimOf(copy.root);
  const now = (k) => (m ? m.get(k) : REST[k]);
  const speed = (k) => panel.__throw?.[k] ?? (m ? m.velocity(k) : 0);
  g.set({ x: now('x'), y: now('y'), scale: now('scale'), opacity: now('opacity') });
  let done;
  if (reducedMotion()) {
    g.onFrame = () => scrim(g.get('opacity'));
    done = g.to({ opacity: 0 }, { response: 0.18 });
  } else if (mode === 'sheet') {
    const extent = Math.max(m?.extent || 0, panel.offsetHeight + 24);
    g.onFrame = () => scrim(1 - g.get('y') / extent);
    done = g.to({ y: extent }, { damping: 1, response: 0.32, velocity: { y: speed('y') } });
  } else if (mode === 'side') {
    const extent = m?.extent || (panel.offsetWidth + 24) * endSign(panel);
    g.onFrame = () => scrim(1 - g.get('x') / extent);
    done = g.to({ x: extent }, { damping: 1, response: 0.34, velocity: { x: speed('x') } });
  } else {
    g.onFrame = () => scrim(g.get('opacity'));
    done = g.to({ scale: mode === 'toast' ? 0.94 : 0.97, opacity: 0, ...(mode === 'toast' ? { y: 10 * edgeSign(copy.panel) } : {}) }, { damping: 1, response: mode === 'menu' ? 0.18 : 0.24 });
  }
  done.then(() => copy.host.remove());
  if (mode !== 'toast') shield(rect, since, done);
}

// A sheet follows the finger 1:1 from its handle, or from its content when that is scrolled to the top. Past its open
// position it resists more the further it goes. On release it goes where the gesture was heading: away, or back home
// carrying the finger's velocity.
const DECELERATION = 0.998;
const project = (v) => ((v / 1000) * DECELERATION) / (1 - DECELERATION);
export const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

function dragToDismiss(panel, close) {
  const m = motion(panel);
  let drag = null;
  let press = null;
  let touch = null;
  const begin = (y) => {
    m.stop();
    drag = { startY: y, fromY: m.get('y'), h: panel.offsetHeight, hist: [] };
    m.extent = drag.h + 24;
    panel.classList.add('dragging');
  };
  const move = (y, t) => {
    let ny = drag.fromY + (y - drag.startY);
    if (ny < 0) ny = -rubberband(-ny, drag.h);
    m.set({ y: ny });
    drag.hist.push([y, t]);
    while (drag.hist.length > 2 && t - drag.hist[0][1] > 80) drag.hist.shift();
  };
  const end = (t) => {
    const d = drag;
    drag = null;
    panel.classList.remove('dragging');
    let v = 0; // px/s from the last moments of the gesture; a finger that stopped before lifting has none
    const h = d.hist;
    if (h.length > 1) {
      const [y0, t0] = h[0];
      const [y1, t1] = h[h.length - 1];
      if (t - t1 < 60 && t1 > t0) v = ((y1 - y0) / (t1 - t0)) * 1000;
    }
    const y = m.get('y');
    // The direction of the throw decides, not where the finger let go.
    const away = v > 150 ? y + project(v) > d.h * 0.3 : v < -150 ? false : y > d.h * 0.45;
    if (away) { panel.__throw = { y: Math.max(0, v) }; close(); } else m.to({ y: 0 }, { damping: 0.8, response: 0.3, velocity: { y: v } });
  };
  // A press that turns into a drag must not also tap the button it started on.
  const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
  const onDown = (e) => {
    if (drag || !e.isPrimary || e.button > 0 || !e.target.closest('.grabber, .modal-head, .drawer-head')) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onMove = (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!drag) {
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx)) return; // a little slack before it commits to a drag
      begin(e.clientY);
      try { panel.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
      panel.addEventListener('click', swallow, true);
    }
    move(e.clientY, e.timeStamp);
  };
  const onUp = (e) => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    if (!drag) return;
    end(e.timeStamp);
    setTimeout(() => panel.removeEventListener('click', swallow, true), 0);
  };
  // From the content (Jarvis's stage included): only a pull down while it is scrolled to the top, decided on the first
  // movement.
  const body = panel.querySelector('.modal-body, .drawer-body, .jv-stage');
  const tStart = (e) => { touch = !drag && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, mode: null } : null; };
  const tMove = (e) => {
    if (!touch) return;
    const p = e.touches[0];
    if (!touch.mode) {
      const dx = p.clientX - touch.x;
      const dy = p.clientY - touch.y;
      if (Math.abs(dy) < 3 && Math.abs(dx) < 3) return;
      touch.mode = dy > 0 && dy > Math.abs(dx) && body.scrollTop <= 0 ? 'drag' : 'scroll';
      if (touch.mode === 'drag') begin(p.clientY);
    }
    if (touch.mode === 'drag' && drag) { e.preventDefault(); move(p.clientY, e.timeStamp); }
  };
  const tEnd = (e) => { if (touch?.mode === 'drag' && drag) end(e.timeStamp); touch = null; };
  panel.addEventListener('pointerdown', onDown);
  panel.addEventListener('pointermove', onMove);
  panel.addEventListener('pointerup', onUp);
  panel.addEventListener('pointercancel', onUp);
  body?.addEventListener('touchstart', tStart, { passive: true });
  body?.addEventListener('touchmove', tMove, { passive: false });
  body?.addEventListener('touchend', tEnd);
  body?.addEventListener('touchcancel', tEnd);
  return () => {
    panel.removeEventListener('pointerdown', onDown);
    panel.removeEventListener('pointermove', onMove);
    panel.removeEventListener('pointerup', onUp);
    panel.removeEventListener('pointercancel', onUp);
    body?.removeEventListener('touchstart', tStart);
    body?.removeEventListener('touchmove', tMove);
    body?.removeEventListener('touchend', tEnd);
    body?.removeEventListener('touchcancel', tEnd);
  };
}

// Give a layer its entrance, its exit along the same path, and (for sheets) drag to dismiss.
// kind: 'modal' | 'drawer' | 'alert' | 'menu' | 'toast'. root holds the dimming scrim; panel is what moves.
export function useLayer(rootRef, panelRef, { kind = 'modal', onClose } = {}) {
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const root = rootRef.current;
    const panel = panelRef.current || root;
    if (!root) return undefined;
    const mode = modeOf(kind);
    enter(root, panel, mode);
    const detach = mode === 'sheet' && close.current ? dragToDismiss(panel, () => close.current?.()) : null;
    return () => { detach?.(); leave(root, panel, mode); };
  }, []);
}

// The selected segment's background slides to a new choice, from wherever it is now.
function placeThumb(root, slide) {
  const thumb = root?.querySelector(':scope > .seg-thumb');
  if (!thumb) return;
  const on = root.querySelector(':scope > .on');
  thumb.style.visibility = on ? '' : 'hidden';
  if (!on) return;
  const m = motion(thumb, (el, mm) => { el.style.transform = `translate3d(${mm.get('x')}px, 0, 0)`; el.style.width = `${mm.get('w')}px`; });
  const x = on.offsetLeft;
  const w = on.offsetWidth;
  // A resize that only confirms where the thumb is already heading (a bolder label changes the control's width as it
  // slides) leaves the slide alone; a resize that moves the segment puts the thumb straight under it.
  if (!slide && thumb.__placed && m.spring('x').goal === x && m.spring('w').goal === w) return;
  if (!slide || !thumb.__placed || reducedMotion()) { m.set({ x, w }); thumb.__placed = true; } else if (m.spring('x').goal !== x || m.spring('w').goal !== w) m.to({ x, w }, { damping: 1, response: 0.3 });
}
export function useThumb(ref) {
  useLayoutEffect(() => placeThumb(ref.current, true));
  // A resize (a turned phone, a wider window) moves the segments under the thumb, so it goes straight back on.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => placeThumb(root, false));
    ro.observe(root);
    return () => ro.disconnect();
  }, []);
}
