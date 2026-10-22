// "חדש": one place to add anything. A מטלה, a Claude task or an idea is written right here; a decision, a commitment
// or a project opens its own form. Only the title is required.
import { useState } from 'preact/hooks';
import { getState, createTask, createIdea, openModal, closeModal, person, project } from './store.js';
import { html, Icon, Modal, BlmsNote, humanPeople } from './ui.js';
import { HTYPES, liveProjects } from './model.js';
import { parseQuick, dueLabel } from './util.js';

const TYPES = [
  { id: 'task', label: 'מטלה', icon: 'check', hint: 'משהו שאדם עושה' },
  { id: 'decision', label: 'החלטה', icon: 'decision', hint: 'שאלה שמחכה לאדם' },
  { id: 'claude', label: 'משימת Claude', icon: 'sparkle', hint: 'Claude מבצע, אדם אחראי' },
  { id: 'commitment', label: 'התחייבות', icon: 'swap', hint: 'הבטחנו או מחכים מבחוץ' },
  { id: 'idea', label: 'רעיון', icon: 'bulb', hint: 'לסל הרעיונות' },
  { id: 'project', label: 'פרויקט', icon: 'folder', hint: 'נפתח בהחלטה של המפקד' },
];

function routeProject() {
  const parts = (location.hash || '').replace(/^#\/?/, '').split('/');
  return parts[0] === 'project' && project(parts[1]) ? parts[1] : '';
}

function TaskForm({ kind }) {
  const s = getState();
  const my = s.auth?.me || '';
  const [text, setText] = useState('');
  const [htype, setHtype] = useState('general');
  const [who, setWho] = useState(my);
  const [projectId, setProjectId] = useState(routeProject());
  const [due, setDue] = useState('');
  const [doneDef, setDoneDef] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = text.trim() ? parseQuick(text, { people: humanPeople(), projects: s.projects }) : {};
  const claude = kind === 'claude';
  const submit = async (e) => {
    e.preventDefault();
    if (!parsed.title || busy) return;
    const owner = parsed.owner_id || who || null;
    const fields = {
      title: parsed.title, project_id: parsed.project_id || projectId || null, due: parsed.due || due || null,
      ...(parsed.priority ? { priority: parsed.priority } : {}), ...(parsed.focus ? { focus: true } : {}),
    };
    setBusy(true);
    const saved = claude
      ? await createTask({ ...fields, kind: 'claude', accountable_id: owner, done_def: doneDef.trim() || null })
      : await createTask({ ...fields, kind: 'human', htype, owner_id: owner });
    setBusy(false);
    if (saved) closeModal();
  };
  const people = humanPeople().filter((p) => p.is_team);
  const parsedWho = parsed.owner_id && person(parsed.owner_id);
  return html`<form class="form" onSubmit=${submit}>
    <label class="lbl" for="ni-title">${claude ? 'מה Claude צריך לעשות?' : 'מה צריך לעשות?'}</label>
    <input id="ni-title" class="input" value=${text} onInput=${(e) => setText(e.currentTarget.value)} autoFocus required autocomplete="off"
      placeholder=${claude ? 'למשל: טיוטת דוח רבעוני מהנתונים' : 'למשל: לקבוע פגישה עם ממונה הביטחון מחר'} />
    ${parsed.title && (parsedWho || parsed.due || parsed.project_id) ? html`<div class="qa-chips">
      ${parsedWho ? html`<span class="chip">${claude ? 'באחריות' : 'אחראי'}: ${parsedWho.name}</span>` : null}
      ${parsed.project_id ? html`<span class="chip">פרויקט: ${project(parsed.project_id)?.name}</span>` : null}
      ${parsed.due ? html`<span class="chip">יעד: ${dueLabel(parsed.due)}</span>` : null}</div>` : null}
    ${!claude ? html`<span class="lbl">סוג</span>
      <div class="chips-pick" role="radiogroup" aria-label="סוג המטלה">${HTYPES.map((h) => html`<button type="button" role="radio" key=${h.id}
        aria-checked=${htype === h.id ? 'true' : 'false'} class=${'pick-chip' + (htype === h.id ? ' on' : '')} onClick=${() => setHtype(h.id)}>
        <${Icon} name=${h.icon} size=${14} />${h.label}</button>`)}</div>` : null}
    <div class="form-2">
      <div><label class="lbl" for="ni-who">${claude ? 'באחריות' : 'אחראי'}</label>
        <select id="ni-who" class="input" value=${who} onChange=${(e) => setWho(e.currentTarget.value)}>
          ${people.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
        </select></div>
      <div><label class="lbl" for="ni-project">פרויקט</label>
        <select id="ni-project" class="input" value=${projectId} onChange=${(e) => setProjectId(e.currentTarget.value)}>
          <option value="">בלי פרויקט</option>
          ${liveProjects(s).map((p) => html`<option value=${p.id}>${p.name}</option>`)}
        </select></div>
    </div>
    ${claude ? html`<label class="lbl" for="ni-done">הגדרת סיום</label>
      <input id="ni-done" class="input" value=${doneDef} onInput=${(e) => setDoneDef(e.currentTarget.value)} placeholder="מתי זה גמור, ואיזו ראיה מצרפים" />` : null}
    <label class="lbl" for="ni-due">תאריך יעד</label>
    <input id="ni-due" class="input" type="date" value=${due} onChange=${(e) => setDue(e.currentTarget.value)} />
    <${BlmsNote} />
    <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!parsed.title || busy}>הוספה</button>
      <button type="button" class="btn" onClick=${closeModal}>ביטול</button></div>
  </form>`;
}

function IdeaForm() {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const saved = await createIdea({ title, notes: notes.trim() || null });
    setBusy(false);
    if (saved) closeModal();
  };
  return html`<form class="form" onSubmit=${submit}>
    <label class="lbl" for="ni-idea">הרעיון</label>
    <input id="ni-idea" class="input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} autoFocus required placeholder="משפט אחד" />
    <label class="lbl" for="ni-idea-notes">עוד פרטים</label>
    <textarea id="ni-idea-notes" class="input area" rows="2" value=${notes} onInput=${(e) => setNotes(e.currentTarget.value)} placeholder="לא חובה"></textarea>
    <p class="muted small">הרעיון נכנס לסל, ובפגישה השבועית מחליטים מה עושים איתו.</p>
    <${BlmsNote} />
    <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!title.trim() || busy}>לסל הרעיונות</button>
      <button type="button" class="btn" onClick=${closeModal}>ביטול</button></div>
  </form>`;
}

export function NewItemModal({ s }) {
  const [type, setType] = useState(s.modalData?.type || 'task');
  const pick = (id) => {
    const pid = routeProject();
    if (id === 'decision') return openModal('decision', { defaults: { project_id: pid } });
    if (id === 'commitment') return openModal('commitment', { defaults: { project_id: pid } });
    if (id === 'project') return openModal('newproject');
    return setType(id);
  };
  return html`<${Modal} title="חדש">
    <div class="type-pick" role="tablist" aria-label="מה מוסיפים">
      ${TYPES.map((t) => html`<button type="button" role="tab" key=${t.id} aria-selected=${type === t.id ? 'true' : 'false'}
        class=${'type-opt' + (type === t.id ? ' on' : '')} onClick=${() => pick(t.id)}>
        <${Icon} name=${t.icon} size=${18} /><b>${t.label}</b><span>${t.hint}</span></button>`)}
    </div>
    ${type === 'idea' ? html`<${IdeaForm} />` : html`<${TaskForm} key=${type} kind=${type} />`}
  <//>`;
}
