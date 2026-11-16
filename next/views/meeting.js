// Meetings: press record when the meeting starts, the platform transcribes it in Hebrew as people talk, and when it
// ends it writes a discussion summary (what was decided, who does what, what stayed open). Both are kept as an output
// of the project, and the tasks in the summary become people's steps with one tap each.
//   #/meeting        recent meetings, and starting a new one
//   #/meeting/<id>   the meeting: live while it records, then the summary and the transcript
import { useEffect, useRef, useState } from 'preact/hooks';
import { html, Icon, ClaudeMark } from '../ui.js';
import { useStore, myProjects, project, person, meeting, addStep, toast } from '../store.js';
import { meetingText } from '../live.js';
import { startRecording, stopRecording, pauseRecording, summarize, meetingFile, download, voiceStatus } from '../voice.js';
import { findPerson } from '../jarvis-tools.js';

const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`; };
const dt = (iso) => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1} · ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })}`; };

function useTick(on) {
  const [, setN] = useState(0);
  useEffect(() => { if (!on) return undefined; const t = setInterval(() => setN((n) => n + 1), 1000); return () => clearInterval(t); }, [on]);
}

export function Meetings({ project: pid0 }) {
  const s = useStore();
  const mine = myProjects();
  const [title, setTitle] = useState('');
  const [pid, setPid] = useState(pid0 || mine[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState(null);
  useEffect(() => { voiceStatus().then(setSt); }, []);
  const list = (s.meetings || []).filter((m) => mine.some((p) => p.id === m.project));
  const go = async (e) => {
    e.preventDefault();
    if (!pid) return;
    setBusy(true);
    const m = await startRecording({ title: title.trim() || `פגישה: ${project(pid).name}`, project: pid });
    setBusy(false);
    if (m) location.hash = `#/meeting/${m.id}`;
  };
  return html`<div class="page">
    <header class="page-head"><div><h1>פגישות</h1><p class="sub">מקליטים, והפלטפורמה מתמללת בעברית וכותבת סיכום דיון לתוצרים</p></div></header>
    ${s.recording ? html`<a class="card rec-now" href=${`#/meeting/${s.recording.id}`}><span class="rec-dot"></span><strong>מקליטים עכשיו: ${meeting(s.recording.id)?.title}</strong><${Icon} name="chevronLeft" size=${16} /></a>`
      : html`<form class="card mtg-new" onSubmit=${go}>
      <div class="mtg-new-top"><span class="mtg-ic"><${Icon} name="mic" size=${22} /></span><div class="grow"><strong>פגישה חדשה</strong>
        <span class="muted small">${st?.demo ? 'בנתוני הדמה מתנגנת פגישה לדוגמה' : st?.meetings ? 'תמלול בעברית של ElevenLabs' : st ? 'תמלול של הדפדפן (התמלול של ElevenLabs עוד לא הוגדר)' : ''}</span></div></div>
      <label class="lbl" for="mt-title">על מה</label>
      <input id="mt-title" class="input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder="למשל: סגירת התוכנית לכנס" />
      <label class="lbl">פרויקט</label>
      <div class="tool-pick">${mine.map((p) => html`<button type="button" class=${'tp' + (p.id === pid ? ' on' : '')} aria-pressed=${p.id === pid} onClick=${() => setPid(p.id)}><i class="pdot" style=${`background:${p.color}`}></i>${p.name}</button>`)}</div>
      <p class="muted small np-note"><${Icon} name="lock" size=${14} /> רק פגישות לא מסווגות. כולם בחדר צריכים לדעת שמקליטים.</p>
      <button type="submit" class="btn btn-primary rec-btn" disabled=${busy || !pid}><span class="rec-dot"></span>${busy ? 'מתחיל…' : 'להתחיל להקליט'}</button>
    </form>`}
    ${list.length ? html`<section class="sec"><div class="sec-head"><h2>פגישות אחרונות</h2></div>
      <div class="group">${list.map((m) => html`<a class="mrow" key=${m.id} href=${`#/meeting/${m.id}`} style=${`--bar:${project(m.project)?.color || 'var(--accent)'}`}>
        <span class="hrow-ic"><${Icon} name=${m.status === 'recording' ? 'mic' : 'file'} size=${18} /></span>
        <div class="grow"><strong>${m.title}</strong><span class="muted small">${project(m.project)?.name || ''} · ${dt(m.start)}${m.end ? ` · ${mmss(new Date(m.end) - new Date(m.start))}` : ''}</span>
          ${m.summary?.tldr ? html`<span class="small mrow-sum">${m.summary.tldr}</span>` : null}</div>
        <span class=${'spill ' + (m.status === 'summarized' ? 'ok' : '')}>${m.status === 'recording' ? (s.recording?.id === m.id ? 'מקליט' : 'לא הושלם') : m.status === 'summarized' ? 'מסוכם' : 'תמלול'}</span>
      </a>`)}</div></section>` : null}
  </div>`;
}

export function MeetingPage({ id }) {
  const s = useStore();
  const m = meeting(id);
  const live = s.recording?.id === id ? s.recording : null;
  useTick(!!live);
  const [text, setText] = useState(null);
  const box = useRef(null);
  useEffect(() => {
    if (live || !m) return;
    if (s.mode === 'live') meetingText(id).then(setText).catch(() => setText(''));
    else setText(s.meetingText[id] || '');
  }, [id, live, m?.status]);
  useEffect(() => { if (live && box.current) box.current.scrollTop = box.current.scrollHeight; }, [live?.text, live?.partial]);
  if (!m) return html`<div class="page"><p class="muted">הפגישה לא נמצאה, או שהיא בפרויקט שלא שלך.</p><a class="btn" href="#/meeting">לפגישות</a></div>`;
  const p = project(m.project);

  if (live) {
    return html`<div class="page mtg">
      <header class="page-head"><div><h1>${m.title}</h1><p class="sub">${p?.name || ''}</p></div></header>
      <section class=${'card rec-card' + (live.paused ? ' paused' : '')}>
        <div class="rec-top"><span class="rec-dot"></span><strong class="rec-time">${mmss(Date.now() - live.start)}</strong>
          <span class="muted small">${live.paused ? 'בהשהיה' : live.engine === 'scribe' ? 'מתמלל בעברית' : live.engine === 'demo' ? 'פגישה לדוגמה' : 'מתמלל (הדפדפן)'}</span></div>
        ${live.error ? html`<p class="err" role="alert">${live.error}</p>` : null}
        <div class="rec-text" ref=${box} aria-live="polite">${live.text ? live.text.split('\n').map((l) => html`<p>${l}</p>`) : null}
          ${live.partial ? html`<p class="partial">${live.partial}</p>` : !live.text ? html`<p class="muted">מתחילים לדבר, והמילים יופיעו כאן.</p>` : null}</div>
        <div class="rec-actions">
          <button type="button" class="btn" onClick=${pauseRecording} disabled=${live.stopping}><${Icon} name=${live.paused ? 'play' : 'pause'} size=${16} />${live.paused ? 'להמשיך' : 'השהיה'}</button>
          <button type="button" class="btn btn-primary rec-stop" onClick=${stopRecording} disabled=${live.stopping}><span class="rec-sq"></span>${live.stopping ? 'שומר…' : 'סיום ושמירה'}</button>
        </div>
      </section>
      <p class="muted small">אפשר לעבור למסכים אחרים: ההקלטה ממשיכה עד שלוחצים "סיום".</p>
    </div>`;
  }

  const sum = m.summary;
  const busy = s.summarizing?.[id];
  const err = s.summaryError?.[id];
  const file = () => download(m.title, meetingFile(m, text || ''));
  const copy = () => navigator.clipboard?.writeText(meetingFile(m, '').replace(/\nתמלול\n[\s\S]*$/, '')).then(() => toast('הסיכום הועתק'));
  const viaClaude = () => {
    navigator.clipboard?.writeText(text || '').catch(() => {});
    window.open(`https://claude.ai/new?q=${encodeURIComponent(`לכתוב סיכום דיון לפגישה "${m.title}"${p ? ` בפרויקט ${p.name}` : ''}: על מה דיברו, החלטות, משימות עם אחראי ותאריך, שאלות פתוחות והצעד הבא. התמלול הועתק ללוח, אדביק אותו כאן.`)}`, '_blank', 'noopener');
    toast('התמלול הועתק. מדביקים אותו בשיחה שנפתחה', { ms: 6000 });
  };
  return html`<div class="page mtg">
    <header class="page-head"><div><a class="back2" href="#/meeting"><${Icon} name="chevronRight" size=${16} />פגישות</a><h1>${m.title}</h1>
      <p class="sub">${p?.name ? `${p.name} · ` : ''}${dt(m.start)}${m.end ? ` · ${mmss(new Date(m.end) - new Date(m.start))}` : ''}</p></div>
      <div class="head-act">
        <button type="button" class="btn sm" onClick=${file} disabled=${text === null}><${Icon} name="download" size=${15} />קובץ טקסט</button>
        ${sum ? html`<button type="button" class="btn sm" onClick=${copy}><${Icon} name="copy" size=${15} />העתקת הסיכום</button>` : null}
      </div></header>

    ${sum ? html`<section class="card msum">
      <div class="sec-head"><h2><${ClaudeMark} size=${18} /> סיכום דיון</h2>
        <button type="button" class="link" disabled=${busy} onClick=${() => summarize(id)}>${busy ? 'כותב…' : 'לכתוב מחדש'}</button></div>
      <p class="msum-tldr">${sum.tldr}</p>
      ${sum.decisions?.length ? html`<h3>החלטות</h3><ul class="msum-list">${sum.decisions.map((d) => html`<li><${Icon} name="check" size=${14} />${d}</li>`)}</ul>` : null}
      ${sum.actions?.length ? html`<h3>משימות</h3><div class="msum-acts">${sum.actions.map((a, i) => html`<${ActionRow} key=${i} a=${a} m=${m} />`)}</div>` : null}
      ${sum.open?.length ? html`<h3>נשאר פתוח</h3><ul class="msum-list open">${sum.open.map((d) => html`<li><${Icon} name="decision" size=${14} />${d}</li>`)}</ul>` : null}
      ${sum.next ? html`<p class="msum-next"><strong>הצעד הבא:</strong> ${sum.next}</p>` : null}
    </section>`
      : html`<section class="card plan-empty">
      <${ClaudeMark} size=${30} live=${!!busy} />
      <div class="grow"><strong>${busy ? 'כותב את סיכום הדיון…' : err ? 'הסיכום לא נכתב' : 'עוד אין סיכום'}</strong>
        <span class="muted small">${busy ? 'זה לוקח עד דקה. אפשר לעבור למסך אחר' : err || 'הסיכום נכתב מהתמלול: החלטות, משימות ומה נשאר פתוח'}</span></div>
      ${!busy ? html`<div class="head-act"><button type="button" class="btn btn-primary" disabled=${!text} onClick=${() => summarize(id)}>לכתוב סיכום</button>
        ${err ? html`<button type="button" class="btn" disabled=${!text} onClick=${viaClaude}>עם Claude שלי</button>` : null}</div>` : null}
    </section>`}

    <section class="sec"><details class="card mtext" open=${!sum}>
      <summary><strong>תמלול</strong><span class="muted small">${text ? `${text.split(/\s+/).length} מילים` : ''}</span></summary>
      ${text === null ? html`<p class="muted">טוען…</p>` : text ? text.split('\n').map((l) => html`<p>${l}</p>`) : html`<p class="muted">אין תמלול.</p>`}
    </details></section>
  </div>`;
}

// A task from the summary: matched to a person on the team when the name was said, and added as their step on a tap.
function ActionRow({ a, m }) {
  const s = useStore();
  const guess = a.who ? findPerson(a.who) : null;
  const [who, setWho] = useState(guess?.id || s.me);
  const [added, setAdded] = useState(false);
  const team = s.people.filter((x) => x.isTeam !== false && !x.agent);
  const add = () => { addStep({ project: m.project, title: a.what, owner: who, due: a.due }); setAdded(true); toast(`נוסף ל"מה מחכה לי" של ${person(who).name}`); };
  return html`<div class=${'msum-act' + (added ? ' done' : '')}>
    <span class="grow"><strong>${a.what}</strong>${a.due ? html`<span class="muted small"> · עד ${a.due.slice(8, 10)}/${+a.due.slice(5, 7)}</span>` : null}</span>
    ${added ? html`<span class="ok-chip"><${Icon} name="check" size=${13} />${person(who).name}</span>`
      : html`<select aria-label="אחראי" class="input sm-select" value=${who} onChange=${(e) => setWho(e.currentTarget.value)}>
          ${team.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>
        <button type="button" class="btn sm" onClick=${add}><${Icon} name="plus" size=${14} />למטלות</button>`}
  </div>`;
}

// While a meeting records, a capsule in the bar leads back to it from anywhere.
export function RecordingPill() {
  const s = useStore();
  useTick(!!s.recording);
  if (!s.recording) return null;
  return html`<a class="rec-pill" href=${`#/meeting/${s.recording.id}`} aria-label="חזרה לפגישה שמוקלטת"><span class="rec-dot"></span>${mmss(Date.now() - s.recording.start)}</a>`;
}
