// Jarvis in the manual version: the colourful orb in the middle of the phone's tab bar, a row in the desktop sidebar,
// and a whole screen around a live orb where one talks with him. The voice is the personal agent on ElevenLabs
// (m/jarvis-links.js VOICE_AGENT). He only talks: a request for an action is read from the call's transcript by the
// brain on the home computer after the call ends, and the brain asks for a "yes" on Telegram before it does anything.
// The screen says so, and never shows a request as done.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { html, Icon, useDialogFocus } from '../ui.js';
import { set } from '../store.js';
import { haptic, useLayer, reducedMotion } from '../../app/motion.js';
import { VOICE_AGENT, VOICE_CLIENT } from '../jarvis-links.js';

// Opened from a tap, so the microphone and the speaker are asked for inside that tap: phones allow both only there.
let primed = null;
export function openJarvis() {
  primed = null;
  if (navigator.mediaDevices?.getUserMedia) {
    primed = navigator.mediaDevices.getUserMedia({ audio: true });
    primed.catch(() => {}); // a refusal is shown when the conversation starts
  }
  try { const A = window.AudioContext || window.webkitAudioContext; if (A) { const a = new A(); a.resume?.().finally?.(() => a.close?.()); } } catch (e) { /* no audio */ }
  haptic();
  set({ sheet: null, menu: null, jarvis: true });
}
const closeJarvis = () => set({ jarvis: false });

const WORDS = { connecting: 'מתחבר…', listening: 'מקשיב', speaking: 'מדבר', ended: 'השיחה הסתיימה', off: 'לא הצלחתי להתחבר' };
const HOW = 'ג׳ארביס מדבר ועונה כאן. בקשה לפעולה עוברת אל המוח אחרי שהשיחה מסתיימת, והוא מבקש ממך אישור בטלגרם לפני שהוא עושה משהו.';
const AFTER = 'ביקשת פעולה? המוח קורא את השיחה בבדיקה הבאה שלו ושואל אותך בטלגרם. כדי שיקרא עכשיו, כותבים לו בטלגרם ״בדוק קול״.';

export function JarvisScreen() {
  const root = useRef();
  const panel = useRef();
  const [state, setState] = useState('connecting'); // connecting | listening | speaking | ended | off
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState('');
  const conv = useRef(null);
  const run = useRef(0); // a start that was overtaken (closed, or started again) throws its session away
  const list = useRef(null);
  const live = useRef({ state: 'connecting', level: () => 0 });
  live.current.state = state;
  useLayer(root, panel, { kind: 'modal', onClose: () => close() });
  useDialogFocus(panel);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    start();
    return () => { window.removeEventListener('keydown', onKey); stop(); };
  }, []);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [lines.length]);

  async function start() {
    const id = ++run.current;
    const mine = () => run.current === id;
    setErr(''); setLines([]); setState('connecting');
    let mic = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('הדפדפן הזה לא נותן גישה למיקרופון. צריך לפתוח את העמוד בכתובת מאובטחת (https).');
      mic = await (primed || navigator.mediaDevices.getUserMedia({ audio: true }));
      primed = null;
      const { Conversation } = await import(VOICE_CLIENT);
      if (!mine()) return;
      const c = await Conversation.startSession({
        agentId: VOICE_AGENT, connectionType: 'websocket',
        onConnect: () => { if (mine()) { setState('listening'); haptic(); } },
        onDisconnect: () => { if (mine()) { setState((x) => (x === 'off' ? x : 'ended')); conv.current = null; } },
        onModeChange: ({ mode }) => { if (mine()) setState(mode === 'speaking' ? 'speaking' : 'listening'); },
        onMessage: ({ message, source }) => { if (mine() && message) setLines((l) => [...l, { who: source === 'user' ? 'me' : 'j', text: message, id: l.length }]); },
        onError: (m) => { if (mine()) setErr(typeof m === 'string' ? m : 'תקלה בשיחה'); },
      });
      if (!mine()) { c.endSession().catch(() => {}); return; }
      conv.current = c;
      live.current.level = () => {
        const s = live.current.state;
        try { return s === 'speaking' ? c.getOutputVolume?.() || 0 : s === 'listening' ? c.getInputVolume?.() || 0 : 0; } catch (e) { return 0; }
      };
    } catch (e) {
      primed = null;
      if (!mine()) return;
      setState('off');
      setErr(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'אין גישה למיקרופון. צריך לאשר אותו בהגדרות של הדפדפן.'
        : e?.name === 'NotFoundError' ? 'לא נמצא מיקרופון במכשיר הזה.'
        : /import|fetch|module|network/i.test(e?.message || '') ? 'אין חיבור לשירות הקול. בודקים את האינטרנט ומנסים שוב.'
        : e?.message || 'לא הצלחתי להתחבר לג׳ארביס');
    } finally {
      mic?.getTracks?.().forEach((t) => t.stop()); // the conversation holds its own microphone
    }
  }
  async function stop() {
    run.current++;
    const c = conv.current; conv.current = null;
    if (c) await c.endSession().catch(() => {});
  }
  async function close() { await stop(); closeJarvis(); }
  async function hangUp() { await stop(); setState('ended'); }

  const on = ['connecting', 'listening', 'speaking'].includes(state);
  const shown = lines.slice(-4);
  return html`<div class="overlay jv-ov" ref=${root} onClick=${close}>
    <div class=${'modal jv-screen m-jv ' + state} ref=${panel} role="dialog" aria-modal="true" aria-label="ג׳ארביס" tabindex="-1" onClick=${(e) => e.stopPropagation()}>
      <div class="grabber" aria-hidden="true"></div>
      <header class="modal-head jv-head">
        <button type="button" class="icon-btn" aria-label="סגירה" onClick=${close}><${Icon} name="x" /></button>
        <span class="jv-name">ג׳ארביס</span>
        <span class="jv-spacer"></span>
      </header>
      <div class="jv-stage">
        <${Orb} live=${live} />
        <div class="jv-state" aria-live="polite"><strong>${WORDS[state]}</strong>
          <span>${state === 'off' ? err : state === 'ended' ? AFTER : HOW}</span>
          ${err && state !== 'off' ? html`<span class="err small" role="alert">${err}</span>` : null}
        </div>
      </div>
      <div class="jv-lines" ref=${list}>${shown.map((l, i) => html`<p key=${l.id} class=${'jv-line ' + l.who} style=${`--age:${shown.length - 1 - i}`}>${l.text}</p>`)}</div>
      <div class="jv-controls">
        ${on ? html`<button type="button" class="btn jv-end" onClick=${hangUp}><${Icon} name="x" size=${18} />סיום</button>`
          : html`<button type="button" class="btn btn-primary jv-end" onClick=${start}><${Icon} name="mic" size=${18} />${state === 'off' ? 'לנסות שוב' : 'שיחה חדשה'}</button>`}
      </div>
    </div>
  </div>`;
}

// The orb: four soft colours that drift around each other and swell with whoever is speaking. Drawn on a canvas each
// frame; with reduced motion, once per state.
function Orb({ live }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    let raf = 0;
    let drawn = '';
    let level = 0;
    let last = performance.now();
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
      drawn = '';
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const blob = (cx, cy, R, t, k, amp, color) => {
      const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.25);
      g.addColorStop(0, color[0]);
      g.addColorStop(1, color[1]);
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const w = Math.sin(a * 3 + t * (0.9 + k * 0.3) + k * 2) * 0.55 + Math.sin(a * 5 - t * (1.3 + k * 0.2) + k) * 0.3 + Math.sin(a * 2 + t * 0.6) * 0.15;
        const r = R * (1 + amp * w);
        if (i) ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = live.current.state;
      const still = reducedMotion();
      const target = Math.min(1, (live.current.level?.() || 0) * 1.6) + (st === 'connecting' ? 0.12 : 0);
      level += (target - level) * (1 - Math.exp(-dt * (target > level ? 18 : 6))); // quick to rise, slow to settle
      if (!still || drawn !== st) {
        const w = cv.clientWidth;
        const h = cv.clientHeight;
        const cx = w / 2;
        const cy = h / 2;
        const quiet = st === 'off' || st === 'ended';
        const dim = quiet ? 0.45 : 1;
        const base = Math.min(w, h) * 0.22;
        const R = base * (1 + level * 0.28) * (quiet ? 0.86 : 1);
        const t = still ? 0 : now / 1000;
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = 0.45 * dim;
        ctx.filter = 'blur(28px)';
        blob(cx, cy, R * 1.2, t * 0.6, 0, 0.08 + level * 0.18, colors[1]);
        ctx.filter = 'none';
        colors.forEach((c, k) => {
          ctx.globalAlpha = (0.6 - k * 0.07) * dim;
          const drift = still ? 0 : base * 0.1;
          blob(cx + Math.cos(t * 0.7 + k * 1.6) * drift, cy + Math.sin(t * 0.9 + k * 1.3) * drift, R * (1 - k * 0.1), t, k, 0.08 + level * 0.2, c);
        });
        ctx.globalAlpha = 0.85 * dim;
        const core = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, 0, cx, cy, R * 0.75);
        core.addColorStop(0, 'rgba(255,255,255,0.85)');
        core.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        drawn = st;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return html`<canvas class="jv-orb" ref=${ref} aria-hidden="true"></canvas>`;
}

// The middle of the phone's tab bar: a bigger orb than the icons around it, in colour. It leads to Jarvis's screen
// (views/hud.js); from there, the same orb opens the conversation.
const go = (on) => (e) => { if (on) { e.preventDefault(); openJarvis(); } };
export function JarvisTab({ on }) {
  return html`<a class=${'tab jv-mid' + (on ? ' on' : '')} href="#/jarvis" aria-label="ג׳ארביס" title="ג׳ארביס" aria-current=${on ? 'page' : null} onClick=${go(on)}>
    <span class="jv-ball" aria-hidden="true"><span class="jv-ball-in"></span></span></a>`;
}

// The way in on desktop, at the top of the sidebar.
export function JarvisSide({ on }) {
  return html`<a class=${'side-jv' + (on ? ' on' : '')} href="#/jarvis" aria-current=${on ? 'page' : null} onClick=${go(on)}>
    <span class="jv-ball sm" aria-hidden="true"><span class="jv-ball-in"></span></span>
    <span class="grow"><strong>ג׳ארביס</strong><span>${on ? 'לדבר עם ג׳ארביס' : 'המסך הראשי'}</span></span></a>`;
}
