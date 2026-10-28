// Jarvis in the manual version: the colourful orb in the middle of the phone's tab bar, a row in the desktop sidebar,
// and a whole screen around a live orb. The voice isn't connected in this version yet, so the screen says so plainly
// and shows what it will be for; nothing on it pretends to listen.
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { html, Icon } from '../ui.js';
import { set } from '../store.js';
import { haptic, useLayer, reducedMotion } from '../../app/motion.js';

export function openJarvis() {
  haptic();
  set({ sheet: null, menu: null, jarvis: true });
}
const closeJarvis = () => set({ jarvis: false });

const ASKS = ['מה מחכה לי היום?', 'תוסיף ליונתן משימה עד יום חמישי', 'מה התקדם השבוע בפרויקטים שלי?', 'תסכם לי את הפגישה שהקלטתי'];

export function JarvisScreen() {
  const root = useRef();
  const panel = useRef();
  useLayer(root, panel, { kind: 'modal', onClose: closeJarvis });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeJarvis(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`<div class="overlay jv-ov" ref=${root} onClick=${closeJarvis}>
    <div class="modal jv-screen m-jv" ref=${panel} role="dialog" aria-modal="true" aria-label="ג׳ארביס" onClick=${(e) => e.stopPropagation()}>
      <div class="grabber" aria-hidden="true"></div>
      <header class="modal-head jv-head">
        <button type="button" class="icon-btn" aria-label="סגירה" onClick=${closeJarvis}><${Icon} name="x" /></button>
        <span class="jv-name">ג׳ארביס</span>
        <span class="jv-spacer"></span>
      </header>
      <div class="jv-stage">
        <${Orb} />
        <div class="jv-state"><strong>עוד לא מחובר</strong>
          <span>בקרוב מדברים כאן עם ג׳ארביס בקול, על הפרויקטים והמשימות של הצוות. לפני כל שינוי הוא אומר מה יעשה ומחכה ל״כן״.</span></div>
        <div class="jv-asks" aria-label="דוגמאות למה שאפשר יהיה לבקש">${ASKS.map((a) => html`<span class="jv-ask" key=${a}>״${a}״</span>`)}</div>
      </div>
      <div class="jv-controls">
        <button type="button" class="btn btn-primary jv-end" onClick=${closeJarvis}>הבנתי</button>
      </div>
    </div>
  </div>`;
}

// The orb: four soft colours that drift around each other. Drawn on a canvas each frame; with reduced motion, once.
function Orb() {
  const ref = useRef();
  useLayoutEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    let raf = 0;
    let drawn = false;
    const css = getComputedStyle(cv);
    // Each colour with its own transparent end, so the edges fade in that colour instead of through gray.
    const rgb = (c) => { ctx.fillStyle = '#000'; ctx.fillStyle = c; const v = ctx.fillStyle; if (v[0] === '#') return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
      const n = (v.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number); return v.startsWith('color(') ? n.map((x) => Math.round(x * 255)) : n; };
    const colors = ['--accent', '--s-waiting', '--claude-mark', '--s-progress']
      .map((name) => { const [r, g, b] = rgb(css.getPropertyValue(name).trim() || '#888'); return [`rgba(${r},${g},${b},1)`, `rgba(${r},${g},${b},0)`]; });
    const fit = () => {
      const r = cv.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawn = false;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const blob = (cx, cy, R, t, k, color) => {
      const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.25);
      g.addColorStop(0, color[0]);
      g.addColorStop(1, color[1]);
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const w = Math.sin(a * 3 + t * (0.9 + k * 0.3) + k * 2) * 0.55 + Math.sin(a * 5 - t * (1.3 + k * 0.2) + k) * 0.3 + Math.sin(a * 2 + t * 0.6) * 0.15;
        const r = R * (1 + 0.08 * w);
        if (i) ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    };
    const frame = (now) => {
      const still = reducedMotion();
      if (!still || !drawn) {
        const w = cv.clientWidth;
        const h = cv.clientHeight;
        const cx = w / 2;
        const cy = h / 2;
        const R = Math.min(w, h) * 0.22;
        const t = still ? 0 : now / 1000;
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = 0.45;
        ctx.filter = 'blur(28px)';
        blob(cx, cy, R * 1.2, t * 0.6, 0, colors[1]);
        ctx.filter = 'none';
        colors.forEach((c, k) => {
          ctx.globalAlpha = 0.6 - k * 0.07;
          const drift = still ? 0 : R * 0.1;
          blob(cx + Math.cos(t * 0.7 + k * 1.6) * drift, cy + Math.sin(t * 0.9 + k * 1.3) * drift, R * (1 - k * 0.1), t, k, c);
        });
        ctx.globalAlpha = 0.85;
        const core = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, 0, cx, cy, R * 0.75);
        core.addColorStop(0, 'rgba(255,255,255,0.85)');
        core.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        drawn = true;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return html`<canvas class="jv-orb" ref=${ref} aria-hidden="true"></canvas>`;
}

// The middle of the phone's tab bar: a bigger orb than the icons around it, in colour.
export function JarvisTab() {
  return html`<button type="button" class="tab jv-mid" aria-label="ג׳ארביס" title="ג׳ארביס" onClick=${openJarvis}>
    <span class="jv-ball" aria-hidden="true"><span class="jv-ball-in"></span></span></button>`;
}

// The way in on desktop, at the top of the sidebar.
export function JarvisSide() {
  return html`<button type="button" class="side-jv" onClick=${openJarvis}>
    <span class="jv-ball sm" aria-hidden="true"><span class="jv-ball-in"></span></span>
    <span class="grow"><strong>ג׳ארביס</strong><span>עוד לא מחובר · בקרוב בקול</span></span></button>`;
}

