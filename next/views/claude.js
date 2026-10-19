// Claude in one place: talk to Jarvis, record a meeting, or pick one of Claude's capabilities and start it on a project
// with the brief written.
import { useState } from 'preact/hooks';
import { html, Icon, ClaudeMark } from '../ui.js';
import { tools } from '../data.js';
import { useStore, myProjects, project, person, launch, openSheet, closeSheet, getState } from '../store.js';
import { JarvisPanel } from './jarvis.js';

// Claude in one place: Jarvis to talk to, a meeting to record, and every capability of Claude to start on a project.
export function ClaudeSheetBody({ jarvis = false }) {
  useStore();
  return html`<div class="csheet">
    <${JarvisPanel} auto=${jarvis} />
    <a class="connect-row" href="#/meeting" onClick=${closeSheet}>
      <span class="hrow-ic rec-ic"><${Icon} name="mic" size=${18} /></span>
      <div class="grow"><strong>הקלטת פגישה</strong><span class="muted small">תמלול בעברית בזמן אמת, וסיכום דיון שנשמר בתוצרים</span></div>
      <${Icon} name="chevronLeft" size=${16} />
    </a>
    <button type="button" class="connect-row" onClick=${() => openSheet('connect')}>
      <span class="hrow-ic"><${Icon} name="plug" size=${18} /></span>
      <div class="grow"><strong>חיבור ל-Claude</strong><span class="muted small">המחבר שדרכו Claude מדווח לכאן וקורא מה החלטת</span></div>
      <${Icon} name="chevronLeft" size=${16} />
    </button>
    <div class="sec-head tools-head"><h2>היכולות של Claude</h2><span class="muted small">בוחרים, ו-Claude מתחיל עם ההקשר של הפרויקט</span></div>
    <div class="tools">${tools.map((t) => html`<button type="button" class="tool" style=${`--c:${t.color}`} onClick=${() => openSheet('launch', { tool: t.id })}>
      <span class="tool-ic"><${Icon} name=${t.icon} size=${22} /></span><strong>${t.label}</strong><span>${t.blurb}</span></button>`)}</div>
  </div>`;
}

export function LaunchSheetBody({ tool: toolId = 'research', project: pid, title: t0 }) {
  useStore();
  const mine = myProjects();
  const s = getState();
  const [pj, setPj] = useState(pid || mine[0]?.id);
  const [tid, setTid] = useState(toolId);
  const tool = tools.find((x) => x.id === tid);
  const p = project(pj);
  const fill = (x) => x.replace('{goal}', p.goal || p.name).replace('{name}', p.name);
  const [brief, setBrief] = useState(null);
  const [title, setTitle] = useState(t0 || '');
  if (!p?.id) return html`<p class="muted">אין לך עדיין פרויקט שאפשר להפעיל עליו את Claude.</p>`;
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
    <p class="muted small">${s.mode === 'demo' ? 'בפלטפורמה האמיתית זה פותח סשן ב-Claude עם התדריך, והסשן מדווח לכאן דרך המחבר.'
      : s.connector.enabled ? 'נפתח Claude בחלון חדש עם התדריך. הסשן אוסף את המשימה דרך המחבר ומדווח לכאן.'
      : 'החיבור ל-Claude עוד לא הופעל לצוות, אז המשימה תישמר ותחכה. כשהוא יופעל, הסשן הבא שלך יאסוף אותה.'}</p>
  </div>`;
}
