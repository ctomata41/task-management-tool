// Side panel (desktop) / full sheet (phone) for one task: a מטלה a person does, or a Claude task done for an accountable
// person (spec). Every field, the review step for Claude's work, the checklist, comments and history.
import { useEffect, useState } from 'preact/hooks';
import {
  useStore, getState, updateTask, archiveTask, closeTask, addChecklistItem, toggleChecklistItem, removeChecklistItem,
  loadComments, addComment, person, openMenu, approveTask, returnTask, openDecision, flagItem, isCommand,
} from './store.js';
import {
  html, Icon, Avatar, StatusPill, OwnerButton, PriorityButton, DueButton, RichText, MentionInput, AutoText, Seg, BlmsNote,
  copyText, linksIn, humanPeople,
} from './ui.js';
import { FlagBar } from './views/decisions.js';
import { HTYPES, HTYPE, isClaude, reviewerOf, liveProjects } from './model.js';
import { activityWhat } from './activity.js';
import { taskBrief } from './export.js';
import { timeAgo } from './util.js';

function ReviewBox({ t }) {
  const my = getState().auth?.me;
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const reviewer = person(reviewerOf(t));
  return html`<div class="review-box">
    <div class="review-head"><${Icon} name="eye" size=${16} />${isClaude(t) ? 'Claude הגיש לבדיקה' : 'הוגש לבדיקה'}
      ${reviewer && reviewer.id !== my ? html`<span class="muted small">· הבדיקה של ${reviewer.name}</span>` : null}</div>
    ${t.evidence ? null : html`<p class="qc-line warn"><${Icon} name="alert" size=${14} />לא צורפו ראיות. אפשר להחזיר ולבקש קישור, קובץ או PR.</p>`}
    ${returning ? html`<form class="qc-return" onSubmit=${async (e) => { e.preventDefault(); await returnTask(t, note); setReturning(false); setNote(''); }}>
        <input class="input" value=${note} onInput=${(e) => setNote(e.currentTarget.value)} placeholder="מה לתקן?" aria-label="מה לתקן" autoFocus required />
        <button type="submit" class="btn btn-primary sm" disabled=${!note.trim()}>החזרה</button>
        <button type="button" class="btn sm" onClick=${() => setReturning(false)}>ביטול</button>
      </form>`
      : html`<div class="qc-actions">
        <button type="button" class="btn btn-primary sm" onClick=${() => approveTask(t)}><${Icon} name="check" size=${15} />אישור וסגירה</button>
        <button type="button" class="btn sm" onClick=${() => setReturning(true)}><${Icon} name="undo" size=${15} />החזרה לתיקון</button>
      </div>`}
  </div>`;
}

export function TaskDrawer() {
  const s = useStore();
  const t = s.tasks.find((x) => x.id === s.openTaskId);
  const [newItem, setNewItem] = useState('');
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (!s.openTaskId) return undefined;
    loadComments(s.openTaskId);
    const onKey = (e) => { if (e.key === 'Escape' && !getState().menu && !getState().guardAsk) closeTask(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.openTaskId]);
  if (!s.openTaskId || !t) return null;
  const cmd = isCommand(s);
  if (t.flagged && !cmd) return null;

  const claude = isClaude(t);
  const items = s.checklist.filter((c) => c.task_id === t.id).sort((a, b) => a.sort - b.sort);
  const comments = (s.comments[t.id] || []).filter((c) => cmd || !c.flagged);
  const history = s.activity.filter((a) => a.task_id === t.id && a.kind !== 'comment').slice(0, 8);
  const stuck = t.status === 'blocked' || t.status === 'waiting';
  const creator = person(t.created_by);
  const decision = t.decision_id ? s.decisions.find((d) => d.id === t.decision_id) : null;
  const proj = s.projects.find((p) => p.id === t.project_id);
  const blocker = person(t.blocked_by_person);
  const ht = HTYPE[t.htype] || HTYPE.general;

  const pickProject = (e) => openMenu(e.currentTarget, [
    ...liveProjects(s).map((p) => ({ id: p.id, label: p.name, color: p.color || 'var(--accent)', dot: true })),
    { id: '', label: 'בלי פרויקט' },
  ], (id) => updateTask(t.id, { project_id: id || null }), t.project_id || '');
  const pickBlocker = (e) => openMenu(e.currentTarget, [
    ...humanPeople().filter((p) => p.id !== t.owner_id).map((p) => ({ id: p.id, label: p.name, person: p })),
    { id: '', label: 'גורם חיצוני או לא אדם' },
  ], (id) => updateTask(t.id, { blocked_by_person: id || null }), t.blocked_by_person || '');
  const pickType = (e) => openMenu(e.currentTarget, HTYPES.map((h) => ({ id: h.id, label: h.label, icon: h.icon })), (id) => updateTask(t.id, { htype: id }), t.htype);
  const more = (e) => {
    const list = [{ id: 'copy', label: 'העתקה ל-Claude', icon: 'copy' }];
    if (!t.flagged) list.push({ id: 'flag', label: 'סימון כחשוד במידע מסווג', icon: 'alert' });
    list.push({ id: 'archive', label: claude ? 'מחיקת המשימה' : 'מחיקת המטלה', icon: 'trash', danger: true });
    openMenu(e.currentTarget, list, (id) => {
      if (id === 'copy') copyText(taskBrief(t), claude ? 'המשימה הועתקה. אפשר להדביק בשיחה עם Claude.' : 'המטלה הועתקה. אפשר להדביק בשיחה עם Claude.');
      if (id === 'flag') flagItem('task', t.id);
      if (id === 'archive') archiveTask(t.id);
    });
  };

  return html`<div class="drawer-wrap" onClick=${closeTask}>
    <aside class=${'drawer' + (claude ? ' is-claude' : '')} role="dialog" aria-modal="true" aria-label=${claude ? 'משימת Claude' : 'מטלה'} onClick=${(e) => e.stopPropagation()}>
      <header class="drawer-head">
        <${StatusPill} t=${t} size="lg" />
        ${claude ? html`<span class="claude-chip"><${Icon} name="sparkle" size=${13} />משימת Claude</span>` : null}
        <div class="grow"></div>
        <button type="button" class="icon-btn" aria-label="אפשרויות" onClick=${more}><${Icon} name="more" /></button>
        <button type="button" class="icon-btn" aria-label="סגירה" onClick=${closeTask}><${Icon} name="x" /></button>
      </header>
      <div class="drawer-body">
        ${t.flagged ? html`<${FlagBar} kind="task" id=${t.id} />` : null}
        <${AutoText} cls="title-input" value=${t.title} label="כותרת" placeholder=${claude ? 'מה Claude עושה' : 'מה צריך לעשות'} onSave=${(v) => v.trim() && updateTask(t.id, { title: v.trim() })} />

        ${t.status === 'review' ? html`<${ReviewBox} t=${t} />` : null}

        ${stuck ? html`<div class="blocker-box">
          <div class="blocker-head"><${Icon} name="octagon" size=${16} />${t.status === 'blocked' ? 'מה תוקע?' : 'על מי או על מה מחכים?'}</div>
          <div class="field-row">
            <span class="field-label">מי יכול לשחרר</span>
            <button type="button" class="field-btn" onClick=${pickBlocker}>
              ${blocker ? html`<${Avatar} p=${blocker} size=${22} />${blocker.name}` : html`<span class="muted">בחירת אדם (תגיע אליו התראה)</span>`}
            </button>
          </div>
          <${AutoText} cls="field-text" value=${t.blocked_reason} label="סיבה" placeholder="סיבה בקצרה, למשל: מחכים לאישור תקציב"
            onSave=${(v) => updateTask(t.id, { blocked_reason: v.trim() || null })} />
        </div>` : null}

        <div class="fields">
          <div class="field-row"><span class="field-label">מי מבצע</span>
            <${Seg} label="מי מבצע" value=${claude ? 'claude' : 'human'} onChange=${(k) => updateTask(t.id, { kind: k })}
              options=${[{ id: 'human', label: 'אדם' }, { id: 'claude', label: 'Claude', icon: 'sparkle' }]} /></div>
          <div class="field-row"><span class="field-label">${claude ? 'באחריות' : 'אחראי'}</span><${OwnerButton} t=${t} size=${24} /></div>
          ${!claude ? html`<div class="field-row"><span class="field-label">סוג</span>
            <button type="button" class="field-btn" onClick=${pickType}><${Icon} name=${ht.icon} size=${15} />${ht.label}</button>
            <span class="field-hint">${t.htype === 'general' ? '' : 'מופיעה ב"מה מחכה לי"'}</span></div>` : null}
          <div class="field-row"><span class="field-label">תאריך יעד</span><${DueButton} t=${t} empty="בלי תאריך" /></div>
          <div class="field-row"><span class="field-label">פרויקט</span>
            <button type="button" class="field-btn" onClick=${pickProject}>
              ${proj ? html`<span class="dot" style=${`background:${proj.color || 'var(--accent)'}`}></span>${proj.name}` : html`<span class="muted">בלי פרויקט</span>`}
            </button></div>
          <div class="field-row"><span class="field-label">עדיפות</span><${PriorityButton} t=${t} /></div>
          <div class="field-row"><span class="field-label">פוקוס</span>
            <button type="button" class=${'toggle' + (t.focus ? ' on' : '')} role="switch" aria-checked=${t.focus ? 'true' : 'false'} aria-label="פוקוס"
              onClick=${() => updateTask(t.id, { focus: !t.focus })}><span></span></button>
            <span class="field-hint">${t.focus ? 'בפוקוס השבוע' : 'עד 3 בשבוע'}</span></div>
          <div class="field-row"><span class="field-label">פרטית</span>
            <button type="button" class=${'toggle' + (t.private ? ' on' : '')} role="switch" aria-checked=${t.private ? 'true' : 'false'} aria-label="פרטית"
              onClick=${() => updateTask(t.id, { private: !t.private })}><span></span></button>
            <span class="field-hint">${t.private ? 'גלויה רק לך' : 'כל הצוות רואה'}</span></div>
          ${decision ? html`<div class="field-row"><span class="field-label">נפתחה מהחלטה</span>
            <button type="button" class="field-btn" onClick=${() => openDecision(decision.id)}><${Icon} name="decision" size=${15} />${decision.title}</button></div>` : null}
        </div>

        ${claude ? html`<section class="dsec">
          <h3>הגדרת סיום</h3>
          <${AutoText} cls="field-text" rows=${2} value=${t.done_def} label="הגדרת סיום" placeholder="מתי זה גמור, ואיזו ראיה מצרפים לכל תנאי"
            onSave=${(v) => updateTask(t.id, { done_def: v.trim() || null })} />
          <h3>ראיות</h3>
          <${AutoText} cls="field-text" rows=${1} value=${t.evidence} label="ראיות" placeholder="קישור, קובץ או PR לכל תנאי סיום"
            onSave=${(v) => updateTask(t.id, { evidence: v.trim() || null })} />
          ${linksIn(t.evidence).length ? html`<div class="note-links">${linksIn(t.evidence).map((u) => html`<a key=${u} href=${u} target="_blank" rel="noopener noreferrer"><${Icon} name="link" size=${13} />${u.replace(/^https?:\/\//, '').slice(0, 48)}</a>`)}</div>` : null}
          ${t.status !== 'review' && t.status !== 'done' ? html`<div><button type="button" class="btn sm" onClick=${() => updateTask(t.id, { status: 'review' })}>
            <${Icon} name="eye" size=${15} />הגשה לבדיקה</button></div>` : null}
        </section>` : null}

        <section class="dsec">
          <h3>פרטים</h3>
          <${AutoText} cls="field-text notes" rows=${2} value=${t.notes} label="פרטים" placeholder="פרטים וקישורים"
            onSave=${(v) => updateTask(t.id, { notes: v.trim() || null })} />
          ${linksIn(t.notes).length ? html`<div class="note-links">${linksIn(t.notes).map((u) => html`<a key=${u} href=${u} target="_blank" rel="noopener noreferrer"><${Icon} name="link" size=${13} />${u.replace(/^https?:\/\//, '').slice(0, 48)}</a>`)}</div>` : null}
        </section>

        <section class="dsec">
          <h3>שלבים ${items.length ? html`<span class="count">${items.filter((i) => i.done).length}/${items.length}</span>` : null}</h3>
          <ul class="checklist">
            ${items.map((it) => html`<li key=${it.id} class=${it.done ? 'done' : ''}>
              <button type="button" class="cbox" role="checkbox" aria-checked=${it.done ? 'true' : 'false'} aria-label=${it.title} onClick=${() => toggleChecklistItem(it)}>${it.done ? html`<${Icon} name="check" size=${13} />` : null}</button>
              <span>${it.title}</span>
              <button type="button" class="icon-btn sm" aria-label="הסרה" onClick=${() => removeChecklistItem(it)}><${Icon} name="x" size=${14} /></button>
            </li>`)}
          </ul>
          <form class="inline-add" onSubmit=${(e) => { e.preventDefault(); addChecklistItem(t.id, newItem); setNewItem(''); }}>
            <${Icon} name="plus" size=${15} />
            <input id="new-subtask" value=${newItem} onInput=${(e) => setNewItem(e.currentTarget.value)} placeholder="שלב חדש" aria-label="שלב חדש" />
          </form>
        </section>

        <section class="dsec">
          <h3>תגובות ${comments.length ? html`<span class="count">${comments.length}</span>` : null}</h3>
          <ul class="comments">
            ${comments.map((c) => html`<li key=${c.id} class=${c.flagged ? 'is-flagged' : ''}>
              <${Avatar} p=${person(c.author_id)} size=${26} />
              <div><div class="c-head"><strong>${person(c.author_id)?.name || 'מישהו'}</strong><span>${timeAgo(c.created_at)}</span>
                ${c.flagged ? html`<span class="flag-chip"><${Icon} name="alert" size=${12} />חשוד</span>`
                  : html`<button type="button" class="c-flag" title="סימון כחשוד במידע מסווג" aria-label="סימון התגובה כחשודה" onClick=${() => flagItem('comment', c.id)}><${Icon} name="alert" size=${13} /></button>`}</div>
              <div class="c-body"><${RichText} text=${c.body} /></div></div>
            </li>`)}
          </ul>
          <form class="comment-form" onSubmit=${async (e) => { e.preventDefault(); if (await addComment(t.id, comment)) setComment(''); }}>
            <${MentionInput} id="new-comment" value=${comment} onInput=${setComment} placeholder="עדכון או שאלה… @שם כדי לתייג" />
            <button type="submit" class="btn btn-primary sm" disabled=${!comment.trim()}>שליחה</button>
          </form>
          <${BlmsNote} />
        </section>

        ${history.length ? html`<section class="dsec">
          <h3>היסטוריה</h3>
          <ul class="history">
            ${history.map((a) => html`<li key=${a.id}><span class="h-what">${activityWhat(a)}</span><span class="muted">${person(a.actor_id)?.name || 'מערכת'} · ${timeAgo(a.at)}</span></li>`)}
          </ul>
        </section>` : null}

        <p class="meta-foot">${creator ? `נפתחה על ידי ${creator.name} · ` : ''}${t.created_at ? timeAgo(t.created_at) : ''}</p>
      </div>
    </aside>
  </div>`;
}
