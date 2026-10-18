// Cards that appear on several screens: a decision, a human step Claude waits on, an output, a running Claude, a meeting.
import { useEffect, useState } from 'preact/hooks';
import { html, Icon, Seg, Avatar, Faces, ClaudeMark, Bar, ProjectTag, OUT_KIND, HTYPE, ago, dueWord, when, hm, dayWord } from './ui.js';
import {
  decide, completeHuman, bookMeeting, approveOutput, seeOutput, agent, person, project, stopAgent, resumeAgent, waitingOn, hoursLabel, openSheet, toast, getState,
} from './store.js';
import { haptic } from '../app/motion.js';

export function DecisionCard({ d, compact }) {
  const [pick, setPick] = useState(null);
  const a = d.agent ? agent(d.agent) : null;
  const late = !!d.due && new Date(d.due) < new Date();
  if (d.choice) {
    return html`<div class="dcard2 done"><${Icon} name="check" size=${16} /><span><b>${d.q}</b> ${d.choice}</span></div>`;
  }
  return html`<article class="dcard2" style=${`--bar:${project(d.project).color}`}>
    <header class="dc2-head">
      <${ProjectTag} id=${d.project} />
      ${d.due ? html`<span class=${'due2' + (late ? ' late' : '')}>${dueWord(d.due)}</span>` : d.source === 'claude' ? html`<span class="due2"><${ClaudeMark} size=${14} /> Claude שואל</span>` : null}
    </header>
    <h3 class="dc2-q">${d.q}</h3>
    ${d.unblocks || (a && a.state === 'wait') ? html`<p class="dc2-why"><${Icon} name="bolt" size=${14} />${d.unblocks ? `משחרר: ${d.unblocks}` : 'משחרר את Claude'}${a && a.state === 'wait' ? html` <span class="muted">· Claude עצר ומחכה</span>` : null}</p>` : null}
    ${d.context ? html`<p class="dc2-ctx muted small">${d.context}</p>` : null}
    <div class=${'dc2-opts' + (compact ? ' compact' : '')}>
      ${d.options.map((o) => html`<button type="button" class=${'dc2-opt' + (o.id === d.rec ? ' rec' : '') + (pick === o.id ? ' sel' : '')}
        onClick=${() => { if (pick === o.id) decide(d.id, o.id); else setPick(o.id); }}>
        <span class="dc2-opt-l">${o.label}${o.id === d.rec ? html`<em>המלצת Claude</em>` : null}</span>
        <span class="dc2-opt-w">${o.why}</span>
        ${pick === o.id ? html`<span class="dc2-confirm">נגיעה נוספת לאישור</span>` : null}
      </button>`)}
    </div>
  </article>`;
}

export function HumanTaskRow({ t }) {
  const a = t.blocks ? agent(t.blocks) : null;
  const ty = HTYPE[t.type] || HTYPE.other;
  const age = Date.now() - new Date(t.created).getTime();
  return html`<div class="hrow" style=${`--bar:${project(t.project).color}`}>
    <span class="hrow-ic"><${Icon} name=${ty.icon} size=${18} /></span>
    <div class="hrow-main">
      <strong>${t.title}</strong>
      <span class="hrow-meta">
        <${ProjectTag} id=${t.project} />
        ${a ? html`<span class="stops"><${ClaudeMark} size=${16} /> עוצר את "${a.title}"</span>` : t.note ? html`<span class="muted">${t.note}</span>` : null}
        <span class=${'age2' + (age > 864e5 ? ' old' : '')}>${hoursLabel(age)}</span>
      </span>
    </div>
    <button type="button" class="btn btn-primary sm" onClick=${() => completeHuman(t.id)}>${t.cta}</button>
  </div>`;
}

export function OutputCard({ o, wide }) {
  const k = OUT_KIND[o.kind] || OUT_KIND.doc;
  const real = o.url.startsWith('http');
  const p = project(o.project);
  return html`<article class=${'ocard' + (wide ? ' wide' : '') + (o.fresh ? ' fresh' : '')}>
    <a class="ocard-thumb" href=${o.url} target=${o.url.startsWith('http') ? '_blank' : null} rel="noopener" onClick=${(e) => { seeOutput(o.id); if (!o.url.startsWith('http')) { e.preventDefault(); openSheet('output', { id: o.id }); } }}
      style=${`--c:${k.color}`}>
      <span class="ocard-glyph"><${Icon} name=${k.icon} size=${28} /></span>
      ${o.duration ? html`<span class="ocard-dur">${o.duration}</span>` : null}
      ${o.fresh ? html`<span class="ocard-new">חדש</span>` : null}
    </a>
    <div class="ocard-body">
      <span class="ocard-kind" style=${`--c:${k.color}`}>${k.label} · ${p.name}</span>
      <h3><button type="button" class="otitle" onClick=${() => { seeOutput(o.id); openSheet('output', { id: o.id }); }}>${o.title}</button></h3>
      <p>${o.summary}</p>
      <footer>
        <span class="muted small"><${ClaudeMark} size=${14} /> ${ago(o.at)}</span>
        ${o.review ? html`<span class="row-gap">${real ? html`<button type="button" class="btn sm" onClick=${() => openSheet('output', { id: o.id })}>הערות</button>` : null}<button type="button" class="btn sm btn-primary" onClick=${() => approveOutput(o.id)}>אישור</button></span>`
          : o.approved ? html`<span class="ok-chip"><${Icon} name="check" size=${13} />אושר</span>`
          : o.changes ? html`<span class="spill" style="--c:var(--s-review)">חזר ל-Claude</span>`
          : html`<a class="btn sm" href=${o.url} target="_blank" rel="noopener" onClick=${(e) => { seeOutput(o.id); if (!o.url.startsWith('http')) { e.preventDefault(); openSheet('output', { id: o.id }); } }}>פתיחה<${Icon} name="external" size=${13} /></a>`}
      </footer>
    </div>
  </article>`;
}

const STATE = {
  run: { label: 'עובד', c: 'var(--s-done)' },
  wait: { label: 'מחכה לאדם', c: 'var(--s-blocked)' },
  review: { label: 'מוכן לבדיקה', c: 'var(--s-review)' },
  done: { label: 'הסתיים', c: 'var(--s-todo)' },
  queued: { label: 'מחכה לסשן של Claude', c: 'var(--claude)' },
  stopped: { label: 'נעצר', c: 'var(--s-todo)' },
};
export function AgentRow({ a, showProject = true }) {
  const st = STATE[a.state] || STATE.run;
  return html`<div class=${'arow ' + a.state}>
    <${ClaudeMark} size=${30} live=${a.state === 'run'} />
    <div class="arow-main">
      <div class="arow-top"><strong>${a.url ? html`<a href=${a.url} target="_blank" rel="noopener">${a.title}</a>` : a.title}</strong><span class="spill" style=${`--c:${st.c}`}>${a.state === 'wait' ? `מחכה ל${waitingOn(a)}` : st.label}</span></div>
      <div class="arow-step">${showProject ? html`<${ProjectTag} id=${a.project} />` : null}<span>${a.step}</span></div>
      ${!['done', 'stopped', 'queued'].includes(a.state) ? html`<${Bar} value=${a.progress} color=${st.c} />` : null}
    </div>
    ${['run', 'wait', 'queued'].includes(a.state) && !a.stopRequested && !(a.state === 'wait' && a.step === 'נעצר ביד אדם') ? html`<button type="button" class="icon-btn sm" aria-label="עצירה" title="עצירה" onClick=${() => stopAgent(a.id)}><${Icon} name="pause" size=${15} /></button>`
      : a.state === 'stopped' || (a.state === 'wait' && a.step === 'נעצר ביד אדם') ? html`<button type="button" class="icon-btn sm" aria-label="המשך" title="המשך" onClick=${() => resumeAgent(a.id)}><${Icon} name="play" size=${15} /></button>` : null}
  </div>`;
}

export function MeetingAsk({ m }) {
  return html`<div class="mask" style=${`--bar:${project(m.project).color}`}>
    <div class="mask-top">
      <span class="hrow-ic"><${Icon} name="calendar" size=${18} /></span>
      <div class="grow"><strong>${m.title}</strong><span class="muted small">${m.mins} דק׳ · ${m.why}</span></div>
      <${Faces} ids=${m.with} size=${22} />
    </div>
    <div class="slots"><span class="muted small">פנוי לכולם:</span>
      ${m.slots.map((s) => html`<button type="button" class="slot" onClick=${() => bookMeeting(m.id, s)}>${dayWord(s)} ${hm(s)}</button>`)}
    </div>
  </div>`;
}

export function EventRow({ e }) {
  const end = new Date(new Date(e.start).getTime() + e.mins * 60e3).toISOString();
  const past = new Date(end) < new Date();
  const nowOn = !past && new Date(e.start) <= new Date();
  return html`<div class=${'evrow' + (past ? ' past' : '') + (nowOn ? ' now' : '')} style=${`--c:${e.project ? project(e.project).color : 'var(--s-todo)'}`}>
    <span class="evrow-t">${hm(e.start)}</span>
    <i></i>
    <div class="grow"><strong>${e.title}</strong>
      <span class="muted small">${e.mins} דק׳${e.src === 'here' ? ' · נקבע מהפלטפורמה' : ''}${e.summary ? ' · סיכום אוטומטי' : ''}</span></div>
    ${nowOn ? html`<span class="spill" style="--c:var(--s-blocked)">עכשיו</span>` : null}
  </div>`;
}

export { when };

// What can be done with an output's link. The platform keeps the link, not the file: where the file lives decides
// whether it downloads, plays in the browser or can be edited by the team.
const EDITABLE = [
  [/docs\.google\.com|drive\.google\.com/, 'ב-Google Drive'], [/github\.com/, 'ב-GitHub'], [/figma\.com/, 'ב-Figma'],
  [/canva\.com/, 'ב-Canva'], [/notion\.(so|site)/, 'ב-Notion'], [/sharepoint\.com|onedrive|office\.com/, 'ב-Office'],
];
const FILE = /\.(pdf|mp4|mov|webm|mp3|wav|zip|pptx?|docx?|xlsx?|csv|html?|png|jpe?g|gif|svg)(\?|#|$)/i;
export function linkInfo(url = '') {
  if (!/^https?:\/\//.test(url)) return { real: false };
  const edit = EDITABLE.find(([re]) => re.test(url));
  return {
    real: true,
    file: FILE.test(url.split('?')[0]) || /supabase\.co\/storage\//.test(url),
    edit: edit ? edit[1] : null,
    artifact: /claude\.ai\/(code\/)?artifact\//.test(url),
    host: (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })(),
  };
}
export function OutputActions({ o }) {
  const L = linkInfo(o.url);
  if (!L.real) return html`<p class="muted small">אין לתוצר הזה קישור פתוח.</p>`;
  const copy = () => (navigator.clipboard?.writeText(o.url) || Promise.reject()).then(() => { haptic(); toast('הקישור הועתק'); }, () => toast('לא הצלחתי להעתיק'));
  const share = () => navigator.share({ title: o.title, url: o.url }).catch(() => {});
  return html`<div class="oacts">
    <a class="btn btn-primary" href=${o.url} target="_blank" rel="noopener" onClick=${() => seeOutput(o.id)}><${Icon} name="external" size=${15} />פתיחה</a>
    ${L.file ? html`<a class="btn" href=${o.url} download target="_blank" rel="noopener"><${Icon} name="download" size=${15} />הורדה</a>` : null}
    ${L.edit ? html`<a class="btn" href=${o.url} target="_blank" rel="noopener"><${Icon} name="edit" size=${15} />עריכה ${L.edit}</a>` : null}
    ${navigator.share ? html`<button type="button" class="btn" onClick=${share}><${Icon} name="send" size=${15} />שיתוף</button>` : null}
    <button type="button" class="btn" onClick=${copy}><${Icon} name="copy" size=${15} />העתקת קישור</button>
  </div>
  <p class="muted small">${L.artifact ? 'Artifact של Claude נפתח רק למי שהבעלים שיתף איתו. כדי שכל הצוות יראה, משתפים אותו מתפריט Share.'
    : L.edit ? `מי שיש לו הרשאה ${L.edit} יכול לערוך שם.` : `הקובץ נמצא ב-${L.host}. מי שיש לו גישה לשם יכול לפתוח אותו.`}</p>`;
}

// Who on the team has Claude connected, from the last time their Claude reached the platform.
const PRES = { online: { label: 'מחובר', c: 'var(--s-done)' }, offline: { label: 'לא מחובר עכשיו', c: 'var(--s-todo)' }, none: { label: 'עוד לא חיבר', c: 'var(--line-strong)' } };
export function Presence({ compact }) {
  const s = getState();
  const rows = (s.presence || []).slice().sort((a, b) => ['online', 'offline', 'none'].indexOf(a.state) - ['online', 'offline', 'none'].indexOf(b.state));
  return html`<div class=${'pres' + (compact ? ' compact' : '')}>${rows.map((r) => {
    const st = PRES[r.state];
    return html`<div class="pres-row" key=${r.id}>
      <span class="pres-av"><${Avatar} id=${r.id} size=${compact ? 26 : 32} /><i style=${`background:${st.c}`}></i></span>
      <div class="grow"><strong>${person(r.id).name}</strong>
        <span class="muted small">${r.state === 'online' ? (r.working ? `Claude עובד על ${r.working === 1 ? 'משימה אחת' : `${r.working} משימות`}` : 'Claude מחובר')
          : r.state === 'offline' ? `נראה לאחרונה ${ago(r.seen)}` : st.label}</span></div>
      ${compact ? null : html`<span class="spill" style=${`--c:${st.c}`}>${st.label}</span>`}
    </div>`;
  })}</div>`;
}

// Light or dark (app/theme.js keeps the choice per device). The button flips between them; the choice in the account
// sheet can also go back to following the system.
function useTheme() {
  const t = window.ctoTheme;
  const read = () => ({ pref: t ? t.get() : 'auto', dark: t ? t.dark() : false });
  const [v, setV] = useState(read);
  useEffect(() => {
    const f = () => setV(read());
    window.addEventListener('cto-theme', f);
    return () => window.removeEventListener('cto-theme', f);
  }, []);
  return v;
}
export function ThemeButton() {
  const { dark } = useTheme();
  if (!window.ctoTheme) return null;
  const label = dark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה';
  return html`<button type="button" class="icon-btn theme-btn" aria-label=${label} title=${label} onClick=${() => { haptic(); window.ctoTheme.set(dark ? 'light' : 'dark'); }}>
    <${Icon} name=${dark ? 'sun' : 'moon'} size=${20} /></button>`;
}
const THEMES = [{ id: 'light', label: 'בהיר' }, { id: 'dark', label: 'כהה' }, { id: 'auto', label: 'לפי המכשיר' }];
export function ThemeChoice() {
  const { pref } = useTheme();
  if (!window.ctoTheme) return null;
  return html`<div class="theme-choice"><span class="muted small">מראה</span><${Seg} value=${pref} options=${THEMES} label="מראה" onChange=${(id) => window.ctoTheme.set(id)} /></div>`;
}
