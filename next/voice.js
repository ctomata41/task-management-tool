// Voice in the browser: recording a meeting with live Hebrew transcription, and its summary. The recorder lives here,
// outside any screen, so moving around the platform during a meeting does not stop it; screens read it from the store
// (state.recording). Three ways to transcribe, best first: ElevenLabs Scribe (live, through the `voice` function's
// single-use token), the browser's own Hebrew speech recognition, and in the demo a sample meeting.
import { getState, set, toast, project, startMeeting, saveMeeting, meeting } from './store.js';
import { voiceCall, meetingText } from './live.js';
import { haptic } from '../app/motion.js';

export const CLIENT_CDN = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm';
const SCRIBE_WS = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

// What the voice function has set up, asked once per page.
let statusP = null;
export function voiceStatus() {
  if (getState().mode !== 'live') return Promise.resolve({ agent: true, meetings: true, summary: true, demo: true });
  statusP = statusP || voiceCall('status').catch(() => ({ agent: false, meetings: false, summary: false }));
  return statusP;
}

const DEMO_TEXT = [
  'אוקיי, מתחילים. המטרה היום לסגור את התוכנית לכנס החדשנות בנובמבר.',
  'יונתן: אני חושב שצריך להחליט היום על המקום. יש לנו שתי אפשרויות, האודיטוריום או מרכז הכנסים.',
  'יהלי: מרכז הכנסים יקר יותר אבל מכניס מאתיים איש. אני בעד מרכז הכנסים.',
  'יונתן: מסכים. אז סגרנו, מרכז הכנסים.',
  'ירדן: אני יכולה להכין רשימת דוברים עד יום חמישי.',
  'יהלי: מעולה. ואני אבקש מ-Claude להכין מצגת פתיחה לפגישה השבועית.',
  'יונתן: נשאר פתוח מי מאשר את התקציב, צריך לבדוק עם יואש.',
  'יהלי: טוב, נפגשים שוב ביום ראשון לעדכון.',
].join('\n');
const DEMO_SUMMARY = {
  tldr: 'נסגר המקום לכנס החדשנות: מרכז הכנסים, שמכניס מאתיים איש. רשימת דוברים ומצגת פתיחה בדרך, והתקציב עוד מחכה לאישור.',
  decisions: ['הכנס יתקיים במרכז הכנסים'],
  actions: [{ what: 'להכין רשימת דוברים', who: 'ירדן', due: '' }, { what: 'לבקש מ-Claude מצגת פתיחה לפגישה השבועית', who: 'יהלי', due: '' }],
  open: ['מי מאשר את התקציב? לבדוק עם יואש'],
  next: 'פגישת עדכון ביום ראשון',
};

const rec = { engine: null, stop: null, committed: '', partial: '', timer: 0, lock: null, saved: '' };
const show = () => set((s) => ({ recording: s.recording && { ...s.recording, text: rec.committed, partial: rec.partial } }));
const add = (t) => { const x = String(t || '').trim(); if (!x) return; rec.committed = rec.committed ? `${rec.committed}\n${x}` : x; rec.partial = ''; show(); };

// ---- engines ----
async function scribe() {
  const { token } = await voiceCall('scribe');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const q = new URLSearchParams({ model_id: 'scribe_v2_realtime', token, language_code: 'he', audio_format: 'pcm_16000', commit_strategy: 'vad' });
  const ws = new WebSocket(`${SCRIBE_WS}?${q}`);
  let open = false;
  ws.onopen = () => { open = true; };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    const kind = String(m.message_type || m.type || '').toLowerCase();
    if (kind.includes('committed')) add(m.text);
    else if (kind.includes('partial')) { rec.partial = m.text || ''; show(); }
    else if (kind.includes('error')) set((s) => ({ recording: s.recording && { ...s.recording, error: 'התמלול נעצר. ההקלטה עד עכשיו שמורה.' } }));
  };
  ws.onclose = () => { open = false; };
  node.onaudioprocess = (e) => {
    if (!open || getState().recording?.paused) return;
    const f = e.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
    let bin = '';
    const b = new Uint8Array(pcm.buffer);
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: btoa(bin), sample_rate: 16000, commit: false }));
  };
  src.connect(node); node.connect(ctx.destination);
  return async () => {
    try { if (open) ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: '', sample_rate: 16000, commit: true })); } catch (e) { /* closed */ }
    await new Promise((r) => setTimeout(r, 900)); // the last words come back after the commit
    node.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); try { ws.close(); } catch (e) { /* closed */ }
  };
}
function browserSR() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  let on = true;
  let r;
  const run = () => {
    r = new SR(); r.lang = 'he-IL'; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let part = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) add(e.results[i][0].transcript); else part += e.results[i][0].transcript;
      }
      rec.partial = part; show();
    };
    r.onend = () => { if (on) setTimeout(() => { try { run(); } catch (x) { /* stopped */ } }, 250); };
    r.onerror = (e) => { if (e.error === 'not-allowed') { on = false; set((s) => ({ recording: s.recording && { ...s.recording, error: 'אין גישה למיקרופון. צריך לאשר אותו בדפדפן.' } })); } };
    r.start();
  };
  run();
  return async () => { on = false; try { r.stop(); } catch (e) { /* stopped */ } await new Promise((x) => setTimeout(x, 400)); };
}
function demoEngine() {
  const lines = DEMO_TEXT.split('\n');
  let i = 0; let c = 0;
  const t = setInterval(() => {
    if (getState().recording?.paused) return;
    const line = lines[i];
    if (!line) return;
    c += 4; rec.partial = line.slice(0, c); show();
    if (c >= line.length) { add(line); i++; c = 0; }
  }, 60);
  return async () => clearInterval(t);
}

// ---- the recorder ----
export async function startRecording({ title, project: pid }) {
  if (getState().recording) { toast('כבר מקליטים פגישה'); return null; }
  const st = await voiceStatus();
  const m = startMeeting({ title, project: pid });
  rec.committed = ''; rec.partial = ''; rec.saved = '';
  set({ recording: { id: m.id, start: Date.now(), text: '', partial: '', engine: '', paused: false, error: '' } });
  try {
    if (st.demo) { rec.stop = demoEngine(); rec.engine = 'demo'; }
    else if (st.meetings) { rec.stop = await scribe(); rec.engine = 'scribe'; }
    else { rec.stop = browserSR(); rec.engine = rec.stop ? 'browser' : ''; }
    if (!rec.stop) throw new Error('הדפדפן הזה לא מתמלל עברית. אפשר לנסות ב-Chrome, או להגדיר את התמלול של ElevenLabs.');
  } catch (e) {
    // Scribe failed (no microphone, no token): fall back to the browser's own recognition when there is one.
    if (rec.engine !== 'browser' && (rec.stop = browserSR())) rec.engine = 'browser';
    else { set({ recording: null }); saveMeeting(m.id, { status: 'saved', end: new Date().toISOString(), transcript: '' }); toast(e.message || 'לא הצלחתי להתחיל להקליט', { ms: 7000 }); return null; }
  }
  set((s) => ({ recording: { ...s.recording, engine: rec.engine } }));
  navigator.wakeLock?.request('screen').then((l) => { rec.lock = l; }).catch(() => {});
  rec.timer = setInterval(() => { // saved as it goes, so a closed tab loses little
    if (rec.committed !== rec.saved) { rec.saved = rec.committed; saveMeeting(m.id, { transcript: rec.committed }); }
  }, 30000);
  haptic();
  return m;
}
export const pauseRecording = () => set((s) => ({ recording: s.recording && { ...s.recording, paused: !s.recording.paused } }));
export async function stopRecording() {
  const r = getState().recording;
  if (!r) return;
  set({ recording: { ...r, stopping: true } });
  clearInterval(rec.timer);
  try { await rec.stop?.(); } catch (e) { /* stopped */ }
  rec.lock?.release?.().catch(() => {}); rec.lock = null;
  if (rec.partial) add(rec.partial);
  const text = rec.committed;
  set({ recording: null });
  saveMeeting(r.id, { transcript: text, status: 'saved', end: new Date().toISOString() });
  haptic('success');
  if (text.trim().length >= 40) summarize(r.id, text);
  else toast('הפגישה נשמרה. התמלול קצר מדי לסיכום', { ms: 5000 });
}

// ---- the summary ----
export async function summarize(id, text) {
  const m = meeting(id);
  if (!m) return;
  set((s) => ({ summarizing: { ...(s.summarizing || {}), [id]: true }, summaryError: { ...(s.summaryError || {}), [id]: '' } }));
  try {
    const transcript = text ?? (getState().mode === 'live' ? await meetingText(id) : getState().meetingText[id] || '');
    let summary;
    if (getState().mode !== 'live') { await new Promise((r) => setTimeout(r, 1600)); summary = DEMO_SUMMARY; }
    else summary = (await voiceCall('summarize', { title: m.title, project: project(m.project)?.name || '', transcript })).summary;
    saveMeeting(id, { summary, status: 'summarized' });
    haptic('success');
    toast('סיכום הדיון מוכן ונשמר בתוצרים');
  } catch (e) {
    set((s) => ({ summaryError: { ...(s.summaryError || {}), [id]: e.message || 'הסיכום לא הצליח' } }));
  } finally {
    set((s) => ({ summarizing: { ...(s.summarizing || {}), [id]: false } }));
  }
}

// The meeting as a text file: the summary first, then the whole transcript.
export function meetingFile(m, transcript) {
  const s = m.summary;
  const d = new Date(m.start);
  const lines = [`${m.title}`, `${project(m.project)?.name ? `פרויקט: ${project(m.project).name} · ` : ''}${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })}`, ''];
  if (s) {
    lines.push('סיכום דיון', s.tldr, '');
    if (s.decisions?.length) lines.push('החלטות', ...s.decisions.map((x) => `• ${x}`), '');
    if (s.actions?.length) lines.push('משימות', ...s.actions.map((a) => `• ${a.what}${a.who ? ` (${a.who})` : ''}${a.due ? `, עד ${a.due}` : ''}`), '');
    if (s.open?.length) lines.push('נשאר פתוח', ...s.open.map((x) => `• ${x}`), '');
    if (s.next) lines.push(`הצעד הבא: ${s.next}`, '');
  }
  lines.push('תמלול', transcript || '(אין תמלול)');
  return lines.join('\n');
}
export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }));
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'פגישה'}.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
