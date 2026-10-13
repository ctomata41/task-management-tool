// One-line task capture: "להכין מצגת @ירדן #פיילוט מחר !" -> title, owner, project, due, priority.
import { useRef, useState } from 'preact/hooks';
import { getState, createTask, person, project } from './store.js';
import { html, Icon } from './ui.js';
import { parseQuick, dueLabel, STATUS } from './util.js';

export function QuickAdd({ defaults = {}, placeholder, autoFocus, onDone }) {
  const [text, setText] = useState('');
  const ref = useRef();
  const s = getState();
  const parsed = text.trim() ? parseQuick(text, { people: s.people, projects: s.projects }) : null;
  const merged = parsed ? { ...defaults, ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)) } : null;
  const submit = async (e) => {
    e.preventDefault();
    if (!merged || !merged.title) return;
    setText('');
    await createTask(merged);
    if (onDone) onDone();
    else if (ref.current) ref.current.focus();
  };
  const owner = merged && person(merged.owner_id);
  const proj = merged && project(merged.project_id);
  return html`<form class="quickadd" onSubmit=${submit}>
    <div class="qa-row">
      <${Icon} name="plus" size=${18} cls="qa-plus" />
      <input ref=${ref} id="quickadd-input" value=${text} autoFocus=${autoFocus} autocomplete="off" enterkeyhint="done"
        placeholder=${placeholder || 'משימה חדשה… למשל: להכין מצגת @ירדן מחר !'}
        onInput=${(e) => setText(e.currentTarget.value)} />
      <button type="submit" class="btn btn-primary sm" disabled=${!merged?.title}>הוספה</button>
    </div>
    ${merged ? html`<div class="qa-chips">
      ${owner ? html`<span class="chip">אחראי: ${owner.name}</span>` : null}
      ${proj ? html`<span class="chip">פרויקט: ${proj.name}</span>` : null}
      ${merged.due ? html`<span class="chip">יעד: ${dueLabel(merged.due)}</span>` : null}
      ${merged.priority === 'high' ? html`<span class="chip warn">עדיפות גבוהה</span>` : null}
      ${merged.focus ? html`<span class="chip">פוקוס</span>` : null}
      ${merged.status && merged.status !== 'todo' ? html`<span class="chip">${STATUS[merged.status].label}</span>` : null}
    </div>` : html`<div class="qa-hint">@שם לאחראי · #פרויקט · מחר / בחמישי / 20/10 לתאריך · ! לעדיפות גבוהה</div>`}
  </form>`;
}
