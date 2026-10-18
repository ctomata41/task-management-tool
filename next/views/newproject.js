// Opening a project: a name, a template whose milestones lay out over the time budget, who works on it, whether only
// the lead sees it, and its Claude Project. Then Claude builds the work plan with the person. The milestones stay
// editable for the life of the project: the track on the project page shows what is done and what is left.
import { useState } from 'preact/hooks';
import { html, Icon, Avatar, Seg, ClaudeMark } from '../ui.js';
import { useStore, createProject, setMilestones, toggleMilestone, closeSheet, openSheet, project, toast } from '../store.js';
import { TEMPLATES, BUDGETS, layout, msId, isoDay } from '../templates.js';

const CLAUDE_URL = /^https:\/\/claude\.ai\//;

export function NewProjectSheetBody() {
  const s = useStore();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [tpl, setTpl] = useState('app');
  const [weeks, setWeeks] = useState('6');
  const [ms, setMs] = useState(() => layout('app', '6'));
  const [partners, setPartners] = useState([]);
  const [who, setWho] = useState('team');
  const [url, setUrl] = useState('');
  const mates = s.people.filter((p) => p.id !== s.me && p.isTeam !== false && !p.agent);
  const personal = who === 'me';
  const badUrl = url.trim() && !CLAUDE_URL.test(url.trim());
  const relayout = (t, w) => { setTpl(t); setWeeks(w); setMs(layout(t, w)); };
  const toggle = (id) => setPartners((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const go = (plan) => {
    if (!name.trim() || badUrl) return;
    const id = createProject({ name, goal, partners, personal, claudeUrl: url, milestones: ms }, { plan });
    closeSheet();
    location.hash = `#/project/${id}`;
  };

  return html`<form class="launch evform npform" onSubmit=${(e) => { e.preventDefault(); go(true); }}>
    <label class="lbl" for="np-name">שם הפרויקט</label>
    <input id="np-name" class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder="למשל: כלי לתיאום משמרות" autoFocus required />
    <label class="lbl" for="np-goal">מה רוצים להשיג <span class="muted">(לא חובה)</span></label>
    <textarea id="np-goal" class="input area" rows="2" value=${goal} onInput=${(e) => setGoal(e.currentTarget.value)} placeholder="משפט או שניים. Claude ישאל את השאר"></textarea>

    <label class="lbl">סוג הפרויקט</label>
    <div class="tpl-grid" role="radiogroup" aria-label="סוג הפרויקט">${TEMPLATES.map((t) => html`<button type="button" role="radio" aria-checked=${t.id === tpl}
      class=${'tpl' + (t.id === tpl ? ' on' : '')} style=${`--c:${t.color}`} onClick=${() => relayout(t.id, weeks)}>
      <span class="tpl-ic"><${Icon} name=${t.icon} size=${17} /></span><strong>${t.label}</strong><span>${t.blurb}</span></button>`)}</div>
    <label class="lbl">כמה זמן</label>
    <${Seg} value=${weeks} onChange=${(w) => relayout(tpl, w)} label="כמה זמן" options=${BUDGETS} />

    <label class="lbl">אבני דרך <span class="muted">(אפשר לשנות עכשיו ובכל שלב)</span></label>
    ${ms.length ? html`<${MilestoneEditor} list=${ms} onChange=${setMs} />`
      : html`<p class="muted small np-blank"><${ClaudeMark} size=${16} /> Claude יציע את השלבים כשיבנה איתך את התוכנית. אפשר גם להוסיף כאן.</p>
        <button type="button" class="btn sm" onClick=${() => setMs([{ id: msId(), title: '', due: isoDay(Date.now() + 7 * 864e5), done: false }])}><${Icon} name="plus" size=${14} />הוספת שלב</button>`}

    <label class="lbl">מי רואה</label>
    <${Seg} value=${who} onChange=${setWho} label="מי רואה" options=${[{ id: 'team', label: 'כל הצוות' }, { id: 'me', label: 'רק אני' }]} />
    ${personal ? html`<p class="muted small np-note"><${Icon} name="lock" size=${14} /> פרויקט אישי: הוא, ההחלטות, השלבים והתוצרים שלו לא מופיעים אצל אף אחד אחר.</p>`
      : mates.length ? html`<label class="lbl">שותפים</label>
        <div class="tool-pick">${mates.map((p) => html`<button type="button" class=${'tp' + (partners.includes(p.id) ? ' on' : '')} aria-pressed=${partners.includes(p.id)} onClick=${() => toggle(p.id)}>
          <${Avatar} id=${p.id} size=${20} />${p.name}</button>`)}</div>` : null}

    <label class="lbl" for="np-url">הפרויקט ב-Claude <span class="muted">(לא חובה)</span></label>
    <input id="np-url" class="input" type="url" dir="ltr" value=${url} onInput=${(e) => setUrl(e.currentTarget.value)} placeholder="https://claude.ai/project/…" />
    ${badUrl ? html`<p class="err" role="alert">הקישור צריך להתחיל ב-https://claude.ai/</p>` : null}

    <div class="form-actions">
      <button type="submit" class="btn btn-primary" disabled=${!name.trim() || badUrl}><${ClaudeMark} size=${18} />יצירה ובניית תוכנית עם Claude</button>
      <button type="button" class="btn" disabled=${!name.trim() || badUrl} onClick=${() => go(false)}>יצירה בלבד</button>
    </div>
    <p class="muted small">${s.mode === 'live' ? 'Claude ישאל אותך כאן, בפלטפורמה, ויכתוב את התוכנית לפרויקט. שלבים של אנשים יגיעו אליהם לבד.' : 'בנתוני הדמה הפרויקט נשמר רק כאן.'}</p>
  </form>`;
}

// Milestones as a list to edit: rename, change the date, move up or down, remove, add.
export function MilestoneEditor({ list, onChange }) {
  const put = (i, patch) => onChange(list.map((m, k) => (k === i ? { ...m, ...patch } : m)));
  const move = (i, d) => { const l = list.slice(); [l[i], l[i + d]] = [l[i + d], l[i]]; onChange(l); };
  const add = () => {
    const last = list.at(-1)?.due;
    onChange([...list, { id: msId(), title: '', due: isoDay((last ? new Date(`${last}T12:00`).getTime() : Date.now()) + 7 * 864e5), done: false }]);
  };
  return html`<div class="mse">
    ${list.map((m, i) => html`<div class=${'mse-row' + (m.done ? ' done' : '')} key=${m.id}>
      <span class="mse-n">${m.done ? html`<${Icon} name="check" size=${12} />` : i + 1}</span>
      <input class="input mse-t" value=${m.title} aria-label=${`שם השלב ${i + 1}`} placeholder="שם השלב" onInput=${(e) => put(i, { title: e.currentTarget.value })} />
      <input class="input mse-d" type="date" value=${m.due || ''} aria-label=${`עד מתי שלב ${i + 1}`} onInput=${(e) => put(i, { due: e.currentTarget.value })} />
      <span class="mse-act">
        <button type="button" class="icon-btn sm" aria-label="למעלה" disabled=${i === 0} onClick=${() => move(i, -1)}><${Icon} name="chevronUp" size=${15} /></button>
        <button type="button" class="icon-btn sm" aria-label="למטה" disabled=${i === list.length - 1} onClick=${() => move(i, 1)}><${Icon} name="chevronDown" size=${15} /></button>
        <button type="button" class="icon-btn sm" aria-label="הסרה" onClick=${() => onChange(list.filter((_, k) => k !== i))}><${Icon} name="trash" size=${15} /></button>
      </span>
    </div>`)}
    <button type="button" class="btn sm mse-add" onClick=${add}><${Icon} name="plus" size=${14} />הוספת שלב</button>
  </div>`;
}

// Editing a running project's milestones, from its page.
export function MilestonesSheetBody({ id }) {
  const p = project(id);
  const [list, setList] = useState(() => p.milestones.map((m) => ({ id: m.id, title: m.title, due: isoDay(m.end), done: m.done })));
  const save = (e) => {
    e.preventDefault();
    if (list.some((m) => !m.title.trim())) { toast('לכל שלב צריך שם'); return; }
    setMilestones(id, list);
    closeSheet();
  };
  return html`<form class="launch evform" onSubmit=${save}>
    <p class="muted small">שלב שהושלם נשאר מסומן. Claude רואה את השינויים בבדיקה הבאה שלו, ויכול להציע שינויים עם תוכנית מעודכנת.</p>
    <${MilestoneEditor} list=${list} onChange=${setList} />
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">שמירה</button>
      <button type="button" class="btn" onClick=${closeSheet}>ביטול</button>
    </div>
  </form>`;
}

// The project on one line: every milestone as a stop, done ones filled, the current one marked, with how much is left.
export function MilestoneTrack({ p, edit = true }) {
  const ms = p.milestones;
  if (!ms.length) return null;
  const done = ms.filter((m) => m.done).length;
  const cur = ms.findIndex((m) => !m.done);
  const left = ms.length - done;
  const end = ms.at(-1).end;
  const days = Math.ceil((new Date(end) - Date.now()) / 864e5);
  const late = (m) => !m.done && new Date(m.end) < new Date(new Date().toDateString());
  const fill = ms.length > 1 ? (cur === -1 ? 1 : Math.max(0, cur) / (ms.length - 1)) : done ? 1 : 0;
  return html`<section class="card mtrack" style=${`--c:${p.color}`}>
    <div class="sec-head"><h2>הדרך לסיום</h2>
      ${edit ? html`<button type="button" class="btn sm" onClick=${() => openSheet('milestones', { id: p.id })}><${Icon} name="edit" size=${14} />עריכה</button>` : null}</div>
    <p class="mt-sum"><strong>${done} מתוך ${ms.length} שלבים</strong>
      <span class="muted">${left ? ` · נשארו ${left === 1 ? 'שלב אחד' : `${left} שלבים`}${days >= 0 ? ` · ${days === 0 ? 'מסתיים היום' : `עוד ${days} ימים`}` : ` · עבר המועד ב-${-days} ימים`}` : ' · הכול הושלם'}</span></p>
    <ol class="mt-line" style=${`--fill:${fill};--n:${ms.length}`}>${ms.map((m, i) => html`<li key=${m.id} class=${(m.done ? 'done' : i === cur ? 'cur' : '') + (late(m) ? ' late' : '')}>
      <button type="button" class="mt-dot" aria-label=${m.done ? `לבטל: ${m.title} הושלם` : `לסמן: ${m.title} הושלם`} aria-pressed=${m.done} onClick=${() => toggleMilestone(p.id, m.id)}>
        ${m.done ? html`<${Icon} name="check" size=${13} />` : null}</button>
      <span class="mt-t">${m.title}</span>
      <span class="mt-d">${late(m) ? 'באיחור · ' : i === cur ? 'עכשיו · ' : ''}${new Date(m.end).getDate()}/${new Date(m.end).getMonth() + 1}</span>
    </li>`)}</ol>
  </section>`;
}
