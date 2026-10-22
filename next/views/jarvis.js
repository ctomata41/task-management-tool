// Jarvis: a voice conversation in Hebrew with an ElevenLabs agent that knows the platform. It answers from the team's
// real data and makes changes through the same actions as a tap, each one said back and done only after a "yes"
// (jarvis-tools.js). It opens over the whole screen, around a live orb that breathes with whoever is speaking: the
// microphone while it listens, its own voice while it speaks. On the demo data a short sample conversation plays, and
// its actions really happen on the sample.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { html, Icon } from '../ui.js';
import { useStore, getState, set, person, closeSheet } from '../store.js';
import { voiceCall } from '../live.js';
import { makeTools } from '../jarvis-tools.js';
import { CLIENT_CDN, voiceStatus, startRecording } from '../voice.js';
import { haptic, useLayer, reducedMotion } from '../../app/motion.js';

const tomorrowAt = (h) => { const d = new Date(Date.now() + 864e5); d.setHours(h, 0, 0, 0); return d.toISOString(); };

// Opened from a tap, so the microphone and the speaker are asked for inside that tap: phones allow both only there.
let primed = null;
export function openJarvis() {
  primed = null;
  if (getState().mode === 'live' && navigator.mediaDevices?.getUserMedia) {
    primed = navigator.mediaDevices.getUserMedia({ audio: true });
    primed.catch(() => {}); // a refusal is shown when the conversation starts
  }
  try { const A = window.AudioContext || window.webkitAudioContext; if (A) { const a = new A(); a.resume?.().finally?.(() => a.close?.()); } } catch (e) { /* no audio */ }
  haptic();
  closeSheet();
  set({ jarvis: true });
}
const closeJarvis = () => set({ jarvis: false });

const WORDS = { idle: 'ג׳ארביס', connecting: 'מתחבר…', listening: 'מקשיב', speaking: 'מדבר', ended: 'השיחה הסתיימה', off: 'ג׳ארביס עוד לא מחובר' };

export function JarvisScreen() {
  useStore();
  const root = useRef();
  const panel = useRef();
  const [state, setState] = useState('connecting'); // connecting | listening | speaking | ended | off
  const [lines, setLines] = useState([]);
  const [acts, setActs] = useState([]);
  const [err, setErr] = useState('');
  const conv = useRef(null);
  const timers = useRef([]);
  const list = useRef(null);
  const live = useRef({ state: 'connecting', level: () => 0 });
  live.current.state = state;
  const say = (who, text) => setLines((l) => [...l, { who, text, id: l.length }]);
  useLayer(root, panel, { kind: 'modal', onClose: () => close() });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    start();
    return () => { window.removeEventListener('keydown', onKey); stop(); };
  }, []);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [lines.length]);

  const tools = makeTools({
    onAction: (a) => setActs((x) => [...x, a]),
    startMeeting: (m) => {
      setTimeout(async () => {
        await stop();
        const rec = await startRecording(m);
        if (rec) { closeJarvis(); location.hash = `#/meeting/${rec.id}`; }
      }, 1800); // after Jarvis says it
    },
    open: (h) => { location.hash = h; },
  });

  async function start() {
    setErr(''); setLines([]); setActs([]);
    const me = person(getState().me);
    if (getState().mode !== 'live') return demo(me);
    setState('connecting');
    try {
      const st = await voiceStatus({ fresh: true });
      if (!st.agent) { setState('off'); setErr(st.error || (st.missing?.length ? `חסר בהגדרות של Supabase (Edge Functions, Secrets): ${st.missing.filter((m) => m !== 'ELEVENLABS_SUMMARY_AGENT_ID').join(', ')}` : 'חסר המפתח של ElevenLabs או מזהה הסוכן בהגדרות של Supabase.')); return; }
      const mic = await (primed || navigator.mediaDevices.getUserMedia({ audio: true }));
      const [{ Conversation }, { signed_url: signedUrl }] = await Promise.all([import(CLIENT_CDN), voiceCall('agent')]);
      const now = new Date();
      const clientTools = Object.fromEntries(Object.entries(tools).map(([k, fn]) => [k, async (args) => {
        try { return JSON.stringify(await fn(args || {})); } catch (e) { return JSON.stringify({ ok: false, error: e.message || 'לא הצליח' }); }
      }]));
      conv.current = await Conversation.startSession({
        signedUrl, connectionType: 'websocket', clientTools,
        dynamicVariables: { user_name: me.name, today: now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }), now: now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }) },
        onConnect: () => { setState('listening'); haptic(); },
        onDisconnect: () => { setState((x) => (x === 'off' ? x : 'ended')); conv.current = null; },
        onModeChange: ({ mode }) => setState(mode === 'speaking' ? 'speaking' : 'listening'),
        onMessage: ({ message, source }) => message && say(source === 'user' ? 'me' : 'j', message),
        onError: (m) => setErr(typeof m === 'string' ? m : 'תקלה בשיחה'),
      });
      mic?.getTracks?.().forEach((t) => t.stop()); // the conversation holds its own microphone now
      const c = conv.current;
      live.current.level = () => {
        const s = live.current.state;
        try { return s === 'speaking' ? c.getOutputVolume?.() || 0 : s === 'listening' ? c.getInputVolume?.() || 0 : 0; } catch (e) { return 0; }
      };
    } catch (e) {
      setState('off');
      setErr(e?.name === 'NotAllowedError' ? 'אין גישה למיקרופון. צריך לאשר אותו בהגדרות של הדפדפן.' : e.message || 'לא הצלחתי להתחבר לג׳ארביס');
    }
  }
  async function stop() {
    timers.current.forEach(clearTimeout); timers.current = [];
    const c = conv.current; conv.current = null;
    if (c) await c.endSession().catch(() => {});
  }
  async function close() { await stop(); closeJarvis(); }
  async function again() { await stop(); start(); }

  // The sample: a question, a meeting said back and confirmed. The tools run for real on the sample data.
  function demo(me) {
    setState('connecting');
    live.current.level = () => {
      const s = live.current.state;
      const t = performance.now() / 1000;
      if (s === 'speaking') return 0.35 + 0.3 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1));
      if (s === 'listening') return 0.08 + 0.06 * Math.abs(Math.sin(t * 3.1));
      return 0;
    };
    const steps = [
      [700, () => { setState('speaking'); say('j', `היי ${me.name}, כאן ג׳ארביס. מה צריך?`); }],
      [1900, () => { setState('listening'); say('me', 'מה מחכה לי היום?'); }],
      [1500, async () => {
        setState('speaking');
        const w = await tools.whats_waiting();
        say('j', `יש ${w.decisions.length} החלטות ו-${w.steps.length} מטלות שמחכות לך${w.decisions[0] ? `. הראשונה: ${w.decisions[0].question}` : ''}.`);
      }],
      [2800, () => { setState('listening'); say('me', 'תקבע לי פגישה עם יונתן מחר בעשר על הכנס'); }],
      [1500, async () => {
        setState('speaking');
        const r = await tools.schedule_meeting({ title: 'פגישה על הכנס', start: tomorrowAt(10), minutes: 30, with: ['יונתן'], project: 'כנס' });
        say('j', r.say ? r.say.replace(/ אחרי.*$/, '').replace('לפני שאני עושה את זה, לאשר: ', 'לקבוע ') : 'לא הצלחתי');
      }],
      [2900, () => { setState('listening'); say('me', 'כן'); }],
      [1100, async () => {
        setState('speaking');
        await tools.schedule_meeting({ title: 'פגישה על הכנס', start: tomorrowAt(10), minutes: 30, with: ['יונתן'], project: 'כנס', confirmed: true });
        say('j', 'נקבע, וההזמנה נשלחה ליונתן. עוד משהו?');
      }],
      [2600, () => setState('listening')],
    ];
    let t = 0;
    timers.current = steps.map(([ms, fn]) => { t += ms; return setTimeout(fn, t); });
  }

  const on = ['connecting', 'listening', 'speaking'].includes(state);
  const shown = lines.slice(-4);
  return html`<div class="overlay jv-ov" ref=${root} onClick=${close}>
    <div class=${'modal jv-screen ' + state} ref=${panel} role="dialog" aria-modal="true" aria-label="ג׳ארביס" onClick=${(e) => e.stopPropagation()}>
      <div class="grabber" aria-hidden="true"></div>
      <header class="modal-head jv-head">
        <button type="button" class="icon-btn" aria-label="סגירה" onClick=${close}><${Icon} name="x" /></button>
        <span class="jv-name">ג׳ארביס</span>
        <span class="jv-spacer"></span>
      </header>
      <div class="jv-stage">
        <${Orb} live=${live} />
        <div class="jv-state" aria-live="polite"><strong>${WORDS[state]}</strong>
          <span>${state === 'off' ? err
            : on ? 'מדברים רגיל. לפני כל שינוי ג׳ארביס אומר מה יעשה ומחכה ל"כן"'
            : 'אפשר להתחיל שיחה חדשה'}</span>
          ${err && state !== 'off' ? html`<span class="err small" role="alert">${err}</span>` : null}
        </div>
      </div>
      <div class="jv-lines" ref=${list}>${shown.map((l, i) => html`<p key=${l.id} class=${'jv-line ' + l.who} style=${`--age:${shown.length - 1 - i}`}>${l.text}</p>`)}</div>
      ${acts.length ? html`<div class="jv-acts">${acts.map((a, i) => html`<span key=${i} class="ok-chip"><${Icon} name="check" size=${13} />${a.label}</span>`)}</div>` : null}
      <div class="jv-controls">
        ${on ? html`<button type="button" class="btn jv-end" onClick=${close}><${Icon} name="x" size=${18} />סיום</button>`
          : html`<button type="button" class="btn btn-primary jv-end" onClick=${again}><${Icon} name="mic" size=${18} />${state === 'off' ? 'לנסות שוב' : 'שיחה חדשה'}</button>`}
      </div>
    </div>
  </div>`;
}

// The orb: three soft shapes that drift around each other and swell with the voice. Drawn on a canvas each frame; with
// reduced motion it is drawn once per state, still.
function Orb({ live }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    let raf = 0;
    let level = 0;
    let last = performance.now();
    let drawnFor = '';
    const css = getComputedStyle(cv);
    const tone = (name, fb) => css.getPropertyValue(name).trim() || fb;
    // Each tone with its own transparent end, so gradient edges fade in that color instead of through gray.
    const rgb = (c) => { ctx.fillStyle = '#000'; ctx.fillStyle = c; const v = ctx.fillStyle; if (v[0] === '#') return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
      const n = (v.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number); return v.startsWith('color(') ? n.map((x) => Math.round(x * 255)) : n; };
    const colors = [tone('--claude-mark', '#c15f3c'), tone('--s-waiting', '#af52de'), tone('--accent', '#0071e3')]
      .map((c) => { const [r, g, b] = rgb(c); return [`rgba(${r},${g},${b},1)`, `rgba(${r},${g},${b},0)`]; });
    const fit = () => {
      const r = cv.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      drawnFor = '';
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
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = live.current.state;
      const still = reducedMotion();
      const target = Math.min(1, (live.current.level?.() || 0) * 1.6) + (s === 'connecting' ? 0.12 : 0);
      level += (target - level) * (1 - Math.exp(-dt * (target > level ? 18 : 6))); // quick to rise, slow to settle
      if (!still || drawnFor !== s) {
        const w = cv.clientWidth;
        const h = cv.clientHeight;
        const cx = w / 2;
        const cy = h / 2;
        const base = Math.min(w, h) * 0.22;
        const t = still ? 0 : now / 1000;
        const dim = s === 'off' || s === 'ended' ? 0.45 : 1;
        const R = base * (1 + level * 0.28) * (s === 'off' || s === 'ended' ? 0.86 : 1);
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = 0.5 * dim;
        ctx.filter = 'blur(28px)';
        blob(cx, cy, R * 1.15, t * 0.6, 0, 0.1 + level * 0.18, colors[0]);
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
        colors.forEach((c, k) => {
          ctx.globalAlpha = (0.62 - k * 0.08) * dim;
          const drift = still ? 0 : base * 0.08;
          blob(cx + Math.cos(t * 0.7 + k * 2.1) * drift, cy + Math.sin(t * 0.9 + k * 1.7) * drift, R * (1 - k * 0.12), t, k, 0.06 + level * 0.22, c);
        });
        ctx.globalAlpha = 0.9 * dim;
        const core = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.25, 0, cx, cy, R * 0.75);
        core.addColorStop(0, 'rgba(255,255,255,0.85)');
        core.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        drawnFor = s;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return html`<canvas class="jv-orb" ref=${ref} aria-hidden="true"></canvas>`;
}

// The way in from the Claude sheet.
export function JarvisRow() {
  return html`<button type="button" class="connect-row jv-row" onClick=${openJarvis}>
    <span class="jv-dot" aria-hidden="true"></span>
    <div class="grow"><strong>לדבר עם ג׳ארביס</strong><span class="muted small">שואלים על הפרויקטים, קובעים פגישה, מוסיפים מטלה, הכול בקול</span></div>
    <${Icon} name="chevronLeft" size=${16} />
  </button>`;
}

// The way in from the bottom bar on phones: a small live orb.
export function JarvisTab() {
  return html`<button type="button" class="tab jv-tab" aria-label="ג׳ארביס" onClick=${openJarvis}>
    <span class="tab-ic"><span class="jv-dot" aria-hidden="true"></span></span>ג׳ארביס</button>`;
}
