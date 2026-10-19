// Jarvis: a voice conversation in Hebrew with an ElevenLabs agent that knows the platform. It answers from the team's
// real data and makes changes through the same actions as a tap, each one said back and done only after a "yes"
// (jarvis-tools.js). On the demo data a short sample conversation plays, and its actions really happen on the sample.
import { useEffect, useRef, useState } from 'preact/hooks';
import { html, Icon } from '../ui.js';
import { useStore, getState, person, closeSheet } from '../store.js';
import { voiceCall } from '../live.js';
import { makeTools } from '../jarvis-tools.js';
import { CLIENT_CDN, voiceStatus, startRecording } from '../voice.js';
import { haptic } from '../../app/motion.js';

const tomorrowAt = (h) => { const d = new Date(Date.now() + 864e5); d.setHours(h, 0, 0, 0); return d.toISOString(); };

export function JarvisPanel({ auto = false }) {
  const s = useStore();
  const [state, setState] = useState('idle'); // idle | connecting | listening | speaking | ended | off
  const [lines, setLines] = useState([]);
  const [acts, setActs] = useState([]);
  const [err, setErr] = useState('');
  const conv = useRef(null);
  const timers = useRef([]);
  const list = useRef(null);
  const say = (who, text) => setLines((l) => [...l, { who, text, id: l.length }]);
  useEffect(() => () => { conv.current?.endSession?.().catch?.(() => {}); timers.current.forEach(clearTimeout); }, []);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [lines.length]);
  useEffect(() => { if (auto) start(); }, []);

  const tools = makeTools({
    onAction: (a) => setActs((x) => [...x, a]),
    startMeeting: (m) => {
      setTimeout(async () => {
        await end();
        const rec = await startRecording(m);
        if (rec) { closeSheet(); location.hash = `#/meeting/${rec.id}`; }
      }, 1800); // after Jarvis says it
    },
    open: (h) => { location.hash = h; },
  });

  async function start() {
    setErr(''); setLines([]); setActs([]);
    const me = person(getState().me);
    if (getState().mode !== 'live') return demo(me);
    const st = await voiceStatus();
    if (!st.agent) { setState('off'); return; }
    setState('connecting');
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((m) => m.getTracks().forEach((t) => t.stop()));
      const [{ Conversation }, { signed_url: signedUrl }] = await Promise.all([import(CLIENT_CDN), voiceCall('agent')]);
      const now = new Date();
      const clientTools = Object.fromEntries(Object.entries(tools).map(([k, fn]) => [k, async (args) => {
        try { return JSON.stringify(await fn(args || {})); } catch (e) { return JSON.stringify({ ok: false, error: e.message || 'לא הצליח' }); }
      }]));
      conv.current = await Conversation.startSession({
        signedUrl, connectionType: 'websocket', clientTools,
        dynamicVariables: { user_name: me.name, today: now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }), now: now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }) },
        onConnect: () => { setState('listening'); haptic(); },
        onDisconnect: () => { setState((x) => (x === 'idle' ? x : 'ended')); conv.current = null; },
        onModeChange: ({ mode }) => setState(mode === 'speaking' ? 'speaking' : 'listening'),
        onMessage: ({ message, source }) => message && say(source === 'user' ? 'me' : 'j', message),
        onError: (m) => setErr(typeof m === 'string' ? m : 'תקלה בשיחה'),
      });
    } catch (e) {
      setState('idle');
      setErr(e?.name === 'NotAllowedError' ? 'אין גישה למיקרופון. צריך לאשר אותו בדפדפן.' : e.message || 'לא הצלחתי להתחבר לג׳ארביס');
    }
  }
  async function end() {
    timers.current.forEach(clearTimeout); timers.current = [];
    const c = conv.current; conv.current = null;
    if (c) await c.endSession().catch(() => {});
    setState('ended');
  }

  // The sample: a question, a meeting said back and confirmed. The tools run for real on the sample data.
  function demo(me) {
    setState('connecting');
    const steps = [
      [500, () => { setState('speaking'); say('j', `היי ${me.name}, כאן ג׳ארביס. מה צריך?`); }],
      [1700, () => { setState('listening'); say('me', 'מה מחכה לי היום?'); }],
      [1300, async () => {
        setState('speaking');
        const w = await tools.whats_waiting();
        say('j', `יש ${w.decisions.length} החלטות ו-${w.steps.length} מטלות שמחכות לך${w.decisions[0] ? `. הראשונה: ${w.decisions[0].question}` : ''}.`);
      }],
      [2400, () => { setState('listening'); say('me', 'תקבע לי פגישה עם יונתן מחר בעשר על הכנס'); }],
      [1300, async () => {
        setState('speaking');
        const r = await tools.schedule_meeting({ title: 'פגישה על הכנס', start: tomorrowAt(10), minutes: 30, with: ['יונתן'], project: 'כנס' });
        say('j', r.say ? r.say.replace(/ אחרי.*$/, '').replace('לפני שאני עושה את זה, לאשר: ', 'לקבוע ') : 'לא הצלחתי');
      }],
      [2600, () => { setState('listening'); say('me', 'כן'); }],
      [1000, async () => {
        setState('speaking');
        await tools.schedule_meeting({ title: 'פגישה על הכנס', start: tomorrowAt(10), minutes: 30, with: ['יונתן'], project: 'כנס', confirmed: true });
        say('j', 'נקבע, וההזמנה נשלחה ליונתן. עוד משהו?');
      }],
      [2200, () => setState('ended')],
    ];
    let t = 0;
    timers.current = steps.map(([ms, fn]) => { t += ms; return setTimeout(fn, t); });
  }

  const on = ['connecting', 'listening', 'speaking'].includes(state);
  return html`<div class="jarvis">
    <div class=${'voice jv ' + state}>
      <button type="button" class="orb" aria-label=${on ? 'סיום השיחה עם ג׳ארביס' : 'לדבר עם ג׳ארביס'} onClick=${on ? end : start}>
        <span class="orb-glow"></span><span class="orb-core"><${Icon} name=${on ? 'pause' : 'mic'} size=${30} /></span>
      </button>
      <div class="voice-text">
        <strong>${{ idle: 'ג׳ארביס', connecting: 'מתחבר…', listening: 'מקשיב', speaking: 'מדבר', ended: 'השיחה הסתיימה', off: 'ג׳ארביס עוד לא הוגדר' }[state]}</strong>
        <span class="muted small">${state === 'off' ? 'חסר חיבור ל-ElevenLabs. אחרי ההגדרה הוא יעבוד כאן.'
          : on ? 'מדברים רגיל. לפני כל שינוי הוא יגיד מה יעשה ויחכה ל"כן"'
          : 'שואלים על הפרויקטים, קובעים פגישה, מוסיפים מטלה, מפעילים את Claude, הכל בקול'}</span>
        ${err ? html`<span class="err small" role="alert">${err}</span>` : null}
      </div>
    </div>
    ${lines.length ? html`<div class="jv-lines" ref=${list} aria-live="polite">${lines.map((l) => html`<p key=${l.id} class=${'jv-line ' + l.who}>${l.text}</p>`)}</div>` : null}
    ${acts.length ? html`<div class="jv-acts">${acts.map((a, i) => html`<span key=${i} class="ok-chip"><${Icon} name="check" size=${13} />${a.label}</span>`)}</div>` : null}
  </div>`;
}
