// Claude in one place: speak to it, or pick one of its capabilities and start it on a project with the brief written.
// The voice part listens for real where the browser can (Hebrew speech recognition), and otherwise plays a sample.
import { useEffect, useRef, useState } from 'preact/hooks';
import { html, Icon, ClaudeMark, hm, dayWord } from '../ui.js';
import { tools } from '../data.js';
import { at } from '../data.js';
import { useStore, myProjects, project, person, launch, addEvent, openSheet, closeSheet, toast, set, getState } from '../store.js';
import { haptic } from '../../app/motion.js';

const SAMPLE = 'תקבע לי פגישה עם יונתן מחר בעשר על הסוכן הקולי, ותבקש מ-Claude להכין מצגת על הכנס לפגישה השבועית. ויש לי רעיון: לפתוח לכל פרויקט ערוץ קולי משלו.';

// Turns what was said into draft actions. In the real platform Claude does this; here a few rules stand in for it.
function draftsFrom(text) {
  const out = [];
  const parts = text.split(/[,.]\s*|\sו(?=תבקש|יש|תפתח|תשנה)/).map((x) => x.trim()).filter(Boolean);
  const findProject = (t) => myProjects().find((p) => t.includes(p.name) || (p.id === 'voice' && t.includes('קול')) || (p.id === 'summit' && t.includes('כנס')) || (p.id === 'platform' && t.includes('פלטפורמ')));
  const findPerson = (t) => getState().people.find((p) => t.includes(p.name) && p.id !== getState().me);
  for (const t of parts) {
    if (/מצגת|מסמך|סרטון|מחקר|תכין|להכין|תבנה/.test(t)) {
      const p = findProject(t) || myProjects()[0];
      const tool = tools.find((x) => (x.id === 'deck' && /מצגת/.test(t)) || (x.id === 'video' && /סרטון/.test(t)) || (x.id === 'research' && /מחקר/.test(t))) || tools.find((x) => x.id === 'doc');
      out.push({ kind: 'launch', icon: tool.icon, title: `${tool.label} ל-${p.name}`, detail: 'Claude יתחיל לעבוד עם התדריך של הפרויקט', launch: { tool, projectId: p.id, title: `${tool.label}: ${p.name}`, brief: t } });
    } else if (/פגיש/.test(t)) {
      const who = findPerson(t);
      const day = /מחרתיים/.test(t) ? 2 : /מחר/.test(t) ? 1 : 0;
      const hr = /בעשר|10/.test(t) ? 10 : /בתשע|9/.test(t) ? 9 : /באחת עשרה|11/.test(t) ? 11 : /בשתיים|14/.test(t) ? 14 : 12;
      const p = findProject(t);
      out.push({ kind: 'meeting', icon: 'calendar', title: `פגישה${who ? ` עם ${who.name}` : ''}${p ? `: ${p.name}` : ''}`, detail: `${dayWord(at(day, hr))} ${hr}:00 · 30 דק׳ · ליומן Google`, ev: { title: `פגישה${who ? ` עם ${who.name}` : ''}${p ? ` על ${p.name}` : ''}`, project: p?.id, start: at(day, hr), with: who ? [who.id] : [] } });
    } else if (/רעיון/.test(t)) {
      out.push({ kind: 'idea', icon: 'bulb', title: t.replace(/^.*רעיון:?\s*/, '') || t, detail: 'לסל הרעיונות, לפגישה השבועית' });
    } else if (/כיוון|לשנות|תשנה|החלט/.test(t)) {
      const p = findProject(t) || myProjects()[0];
      out.push({ kind: 'decision', icon: 'decision', title: t, detail: `החלטה חדשה ב-${p.name}, לאישור השותפים` });
    }
  }
  if (!out.length && text.trim()) out.push({ kind: 'idea', icon: 'bulb', title: text.trim(), detail: 'לסל הרעיונות' });
  return out;
}

export function ClaudeSheetBody() {
  const [mode, setMode] = useState('idle'); // idle | listen | review
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState([]);
  const rec = useRef(null);
  const typing = useRef(0);
  useEffect(() => () => { rec.current?.abort?.(); clearInterval(typing.current); }, []);

  const finish = (t) => { setText(t); setDrafts(draftsFrom(t).map((d, i) => ({ ...d, id: i, state: 'draft' }))); setMode('review'); };
  const sample = () => {
    setMode('listen'); setText('');
    let i = 0;
    clearInterval(typing.current);
    typing.current = setInterval(() => {
      i += 3; setText(SAMPLE.slice(0, i));
      if (i >= SAMPLE.length) { clearInterval(typing.current); setTimeout(() => finish(SAMPLE), 400); }
    }, 45);
  };
  const listen = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { sample(); return; }
    try {
      const r = new SR(); r.lang = 'he-IL'; r.interimResults = true; r.continuous = false;
      let final = '';
      r.onresult = (e) => { let t = ''; for (const res of e.results) t += res[0].transcript; final = t; setText(t); };
      r.onerror = () => { rec.current = null; if (!final) sample(); };
      r.onend = () => { rec.current = null; if (final) finish(final); };
      rec.current = r; setText(''); setMode('listen'); r.start(); haptic();
    } catch (e) { sample(); }
  };
  const stop = () => { if (rec.current) rec.current.stop(); };
  const approve = (d) => {
    if (d.kind === 'meeting') { addEvent(d.ev); toast('נקבע ביומן Google, וההזמנה נשלחה'); }
    else if (d.kind === 'launch') launch(d.launch);
    else if (d.kind === 'idea') toast('נוסף לסל הרעיונות');
    else toast('נפתחה החלטה לשותפים');
    haptic('success');
    setDrafts((xs) => xs.map((x) => (x.id === d.id ? { ...x, state: 'ok' } : x)));
  };

  return html`<div class="csheet">
    <div class=${'voice ' + mode}>
      <button type="button" class="orb" aria-label=${mode === 'listen' ? 'סיום הקלטה' : 'לדבר עם Claude'} onClick=${mode === 'listen' ? stop : listen}>
        <span class="orb-glow"></span><span class="orb-core"><${Icon} name="mic" size=${30} /></span>
      </button>
      <div class="voice-text">
        ${mode === 'idle' ? html`<strong>לדבר עם Claude</strong><span class="muted small">פגישה, רעיון, שינוי כיוון או משימה. הכל הופך לטיוטה שמאשרים בנגיעה</span>
          <button type="button" class="link" onClick=${sample}>לשמוע דוגמה</button>` : null}
        ${mode === 'listen' ? html`<strong>מקשיב…</strong><p class="transcript">${text || ' '}</p>` : null}
        ${mode === 'review' ? html`<p class="transcript said">"${text}"</p>` : null}
      </div>
    </div>
    ${mode === 'review' ? html`<div class="drafts">
      <div class="sec-head"><h2>Claude הבין ${drafts.length} דברים</h2><button type="button" class="link" onClick=${() => { setMode('idle'); setText(''); }}>הקלטה חדשה</button></div>
      ${drafts.map((d) => html`<div class=${'draft ' + d.state}>
        <span class="hrow-ic"><${Icon} name=${d.icon} size=${18} /></span>
        <div class="grow"><strong>${d.title}</strong><span class="muted small">${d.detail}</span></div>
        ${d.state === 'ok' ? html`<span class="ok-chip"><${Icon} name="check" size=${13} />בוצע</span>`
          : html`<button type="button" class="btn sm btn-primary" onClick=${() => approve(d)}>אישור</button>`}
      </div>`)}
    </div>` : null}
    <div class="sec-head tools-head"><h2>היכולות של Claude</h2><span class="muted small">בוחרים, ו-Claude מתחיל עם ההקשר של הפרויקט</span></div>
    <div class="tools">${tools.map((t) => html`<button type="button" class="tool" style=${`--c:${t.color}`} onClick=${() => openSheet('launch', { tool: t.id })}>
      <span class="tool-ic"><${Icon} name=${t.icon} size=${22} /></span><strong>${t.label}</strong><span>${t.blurb}</span></button>`)}</div>
  </div>`;
}

export function LaunchSheetBody({ tool: toolId = 'research', project: pid, title: t0 }) {
  useStore();
  const mine = myProjects();
  const [pj, setPj] = useState(pid || mine[0].id);
  const [tid, setTid] = useState(toolId);
  const tool = tools.find((x) => x.id === tid);
  const p = project(pj);
  const fill = (s) => s.replace('{goal}', p.goal).replace('{name}', p.name);
  const [brief, setBrief] = useState(null);
  const [title, setTitle] = useState(t0 || '');
  const text = brief ?? fill(tool.brief);
  const name = title || `${tool.label}: ${p.name}`;
  const go = () => {
    launch({ tool, projectId: pj, brief: text, title: name });
    closeSheet();
    location.hash = `#/project/${pj}`;
  };
  return html`<div class="launch">
    <label class="lbl">מה להפעיל</label>
    <div class="tool-pick">${tools.map((t) => html`<button type="button" class=${'tp' + (t.id === tid ? ' on' : '')} style=${`--c:${t.color}`} onClick=${() => { setTid(t.id); setBrief(null); }}><${Icon} name=${t.icon} size=${16} />${t.label}</button>`)}</div>
    <label class="lbl">פרויקט</label>
    <div class="tool-pick">${mine.map((x) => html`<button type="button" class=${'tp' + (x.id === pj ? ' on' : '')} style=${`--c:${x.color}`} onClick=${() => { setPj(x.id); setBrief(null); }}><i class="pdot" style=${`background:${x.color}`}></i>${x.name}</button>`)}</div>
    <label class="lbl" for="l-title">שם</label>
    <input id="l-title" class="input" value=${name} onInput=${(e) => setTitle(e.target.value)} />
    <label class="lbl" for="l-brief">התדריך ל-Claude <span class="muted">(נכתב לבד מהקשר הפרויקט)</span></label>
    <textarea id="l-brief" class="input area" rows="4" value=${text} onInput=${(e) => setBrief(e.target.value)}></textarea>
    <div class="ctx-chips"><span class="muted small">Claude יקבל גם:</span><span class="chip">יעד הפרויקט</span><span class="chip">יומן ההחלטות</span><span class="chip">${person(p.lead).name} כאחראי</span><span class="chip">כללי הצוות</span></div>
    <div class="form-actions">
      <button type="button" class="btn btn-primary" onClick=${go}><${ClaudeMark} size=${18} />הפעלה</button>
      <button type="button" class="btn" onClick=${closeSheet}>ביטול</button>
    </div>
    <p class="muted small">בפלטפורמה האמיתית זה פותח סשן ב-Claude עם התדריך, והסשן מדווח לכאן דרך המחבר.</p>
  </div>`;
}
export { set, hm };
