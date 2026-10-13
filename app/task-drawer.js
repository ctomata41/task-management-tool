// Side panel (desktop) / full sheet (phone) for one task: every field, checklist, comments and history.
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  useStore, getState, updateTask, archiveTask, closeTask, addChecklistItem, toggleChecklistItem, removeChecklistItem,
  loadComments, addComment, person, openMenu,
} from './store.js';
import { html, Icon, Avatar, StatusPill, OwnerButton, PriorityButton, DueButton, RichText, MentionInput, linksIn } from './ui.js';
import { STATUS, timeAgo, shortDate } from './util.js';

function AutoText({ value, onSave, placeholder, cls, rows = 1 }) {
  const [v, setV] = useState(value || '');
  const ref = useRef();
  useEffect(() => setV(value || ''), [value]);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, [v]);
  const commit = () => { if ((v || '') !== (value || '')) onSave(v); };
  return html`<textarea ref=${ref} class=${cls} rows=${rows} value=${v} placeholder=${placeholder}
    onInput=${(e) => setV(e.currentTarget.value)} onBlur=${commit}
    onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && cls === 'title-input') { e.preventDefault(); e.currentTarget.blur(); } }}></textarea>`;
}

function activityText(a) {
  const st = (id) => STATUS[id]?.label || id;
  switch (a.kind) {
    case 'created': return 'המשימה נוצרה';
    case 'status': return `סטטוס: ${st(a.payload?.from)} ← ${st(a.payload?.to)}`;
    case 'assigned': return `הוקצתה ל${person(a.payload?.to)?.name || 'מישהו'}`;
    case 'due': return a.payload?.to ? `תאריך יעד: ${shortDate(a.payload.to)}` : 'תאריך היעד הוסר';
    case 'comment': return 'תגובה חדשה';
    default: return a.kind;
  }
}

export function TaskDrawer() {
  const s = useStore();
  const t = s.tasks.find((x) => x.id === s.openTaskId);
  const [newItem, setNewItem] = useState('');
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (!s.openTaskId) return undefined;
    loadComments(s.openTaskId);
    const onKey = (e) => { if (e.key === 'Escape' && !getState().menu) closeTask(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.openTaskId]);
  if (!s.openTaskId) return null;
  if (!t) return null;

  const items = s.checklist.filter((c) => c.task_id === t.id).sort((a, b) => a.sort - b.sort);
  const comments = s.comments[t.id] || [];
  const history = s.activity.filter((a) => a.task_id === t.id && a.kind !== 'comment').slice(0, 8);
  const stuck = t.status === 'blocked' || t.status === 'waiting';
  const creator = person(t.created_by);
  const projects = s.projects;

  const pickProject = (e) => openMenu(e.currentTarget, [
    ...projects.map((p) => ({ id: p.id, label: p.name, color: p.color || 'var(--accent)', dot: true })),
    { id: '', label: 'בלי פרויקט (אישי)' },
  ], (id) => updateTask(t.id, { project_id: id || null }), t.project_id || '');
  const pickBlocker = (e) => openMenu(e.currentTarget, [
    ...s.people.filter((p) => p.id !== t.owner_id).map((p) => ({ id: p.id, label: p.name, person: p })),
    { id: '', label: 'גורם חיצוני / לא אדם' },
  ], (id) => updateTask(t.id, { blocked_by_person: id || null }), t.blocked_by_person || '');
  const proj = projects.find((p) => p.id === t.project_id);
  const blocker = person(t.blocked_by_person);

  return html`<div class="drawer-wrap" onClick=${closeTask}>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="פרטי משימה" onClick=${(e) => e.stopPropagation()}>
      <header class="drawer-head">
        <${StatusPill} t=${t} size="lg" />
        <div class="grow"></div>
        <button type="button" class="icon-btn" title="מחיקה" aria-label="מחק משימה" onClick=${() => archiveTask(t.id)}><${Icon} name="trash" /></button>
        <button type="button" class="icon-btn" aria-label="סגור" onClick=${closeTask}><${Icon} name="x" /></button>
      </header>
      <div class="drawer-body">
        <${AutoText} cls="title-input" value=${t.title} placeholder="שם המשימה" onSave=${(v) => v.trim() && updateTask(t.id, { title: v.trim() })} />

        ${stuck ? html`<div class="blocker-box">
          <div class="blocker-head"><${Icon} name="octagon" size=${16} />${t.status === 'blocked' ? 'מה תוקע את המשימה?' : 'על מי או מה מחכים?'}</div>
          <div class="field-row">
            <span class="field-label">מי חוסם</span>
            <button type="button" class="field-btn" onClick=${pickBlocker}>
              ${blocker ? html`<${Avatar} p=${blocker} size=${22} />${blocker.name}` : html`<span class="muted">בחירת אדם (יקבל התראה)</span>`}
            </button>
          </div>
          <${AutoText} cls="field-text" value=${t.blocked_reason} placeholder="סיבה בקצרה, למשל: מחכים לאישור תקציב"
            onSave=${(v) => updateTask(t.id, { blocked_reason: v.trim() || null })} />
        </div>` : null}

        <div class="fields">
          <div class="field-row"><span class="field-label">אחראי</span><${OwnerButton} t=${t} size=${24} /></div>
          <div class="field-row"><span class="field-label">תאריך יעד</span><${DueButton} t=${t} empty="בלי תאריך" /></div>
          <div class="field-row"><span class="field-label">פרויקט</span>
            <button type="button" class="field-btn" onClick=${pickProject}>
              ${proj ? html`<span class="dot" style=${`background:${proj.color || 'var(--accent)'}`}></span>${proj.name}` : html`<span class="muted">בלי פרויקט</span>`}
            </button></div>
          <div class="field-row"><span class="field-label">עדיפות</span><${PriorityButton} t=${t} /></div>
          <div class="field-row"><span class="field-label">פוקוס</span>
            <button type="button" class=${'toggle' + (t.focus ? ' on' : '')} role="switch" aria-checked=${t.focus ? 'true' : 'false'}
              onClick=${() => updateTask(t.id, { focus: !t.focus })}><span></span></button>
            <span class="field-hint">${t.focus ? 'בפוקוס השבוע' : 'עד 3 משימות בשבוע'}</span></div>
          <div class="field-row"><span class="field-label">פרטית</span>
            <button type="button" class=${'toggle' + (t.private ? ' on' : '')} role="switch" aria-checked=${t.private ? 'true' : 'false'}
              onClick=${() => updateTask(t.id, { private: !t.private })}><span></span></button>
            <span class="field-hint">${t.private ? 'גלויה רק לך' : 'כל הצוות רואה'}</span></div>
        </div>

        <section class="dsec">
          <h3>תיאור</h3>
          <${AutoText} cls="field-text notes" rows=${2} value=${t.notes} placeholder="פרטים, קישורים, הגדרת 'סיום'…"
            onSave=${(v) => updateTask(t.id, { notes: v.trim() || null })} />
          ${linksIn(t.notes).length ? html`<div class="note-links">${linksIn(t.notes).map((u) => html`<a key=${u} href=${u} target="_blank" rel="noopener noreferrer"><${Icon} name="link" size=${13} />${u.replace(/^https?:\/\//, '').slice(0, 48)}</a>`)}</div>` : null}
        </section>

        <section class="dsec">
          <h3>תתי-משימות ${items.length ? html`<span class="count">${items.filter((i) => i.done).length}/${items.length}</span>` : null}</h3>
          <ul class="checklist">
            ${items.map((it) => html`<li key=${it.id} class=${it.done ? 'done' : ''}>
              <button type="button" class="cbox" role="checkbox" aria-checked=${it.done ? 'true' : 'false'} onClick=${() => toggleChecklistItem(it)}>${it.done ? html`<${Icon} name="check" size=${13} />` : null}</button>
              <span>${it.title}</span>
              <button type="button" class="icon-btn sm" aria-label="מחק" onClick=${() => removeChecklistItem(it)}><${Icon} name="x" size=${14} /></button>
            </li>`)}
          </ul>
          <form class="inline-add" onSubmit=${(e) => { e.preventDefault(); addChecklistItem(t.id, newItem); setNewItem(''); }}>
            <${Icon} name="plus" size=${15} />
            <input id="new-subtask" value=${newItem} onInput=${(e) => setNewItem(e.currentTarget.value)} placeholder="תת-משימה חדשה" />
          </form>
        </section>

        <section class="dsec">
          <h3>תגובות ${comments.length ? html`<span class="count">${comments.length}</span>` : null}</h3>
          <ul class="comments">
            ${comments.map((c) => html`<li key=${c.id}>
              <${Avatar} p=${person(c.author_id)} size=${26} />
              <div><div class="c-head"><strong>${person(c.author_id)?.name || 'מישהו'}</strong><span>${timeAgo(c.created_at)}</span></div>
              <div class="c-body"><${RichText} text=${c.body} /></div></div>
            </li>`)}
          </ul>
          <form class="comment-form" onSubmit=${(e) => { e.preventDefault(); addComment(t.id, comment); setComment(''); }}>
            <${MentionInput} id="new-comment" value=${comment} onInput=${setComment} placeholder="עדכון או שאלה… @שם כדי לתייג" />
            <button type="submit" class="btn btn-primary sm" disabled=${!comment.trim()}>שליחה</button>
          </form>
        </section>

        ${history.length ? html`<section class="dsec">
          <h3>היסטוריה</h3>
          <ul class="history">
            ${history.map((a) => html`<li key=${a.id}><span>${activityText(a)}</span><span class="muted">${person(a.actor_id)?.name || ''} · ${timeAgo(a.at)}</span></li>`)}
          </ul>
        </section>` : null}

        <p class="meta-foot">${creator ? `נוצרה על ידי ${creator.name} · ` : ''}${t.created_at ? timeAgo(t.created_at) : ''}</p>
      </div>
    </aside>
  </div>`;
}
