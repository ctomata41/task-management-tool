// External commitments: what the team promised someone outside it, and what it is waiting to receive.
// The top cost of failure for the team is a missed commitment to an outside party (interview, round 1),
// so every one has an owner and a date, and comes up in "מה מחכה לי" five workdays before it is due.
import { useState } from 'preact/hooks';
import {
  person, createCommitment, updateCommitment, archiveCommitment, openModal, closeModal, flagItem, answerReminder,
} from '../store.js';
import { html, Icon, Avatar, ProjectChip, Modal, Empty, Seg, BlmsNote, humanPeople } from '../ui.js';
import { visibleCommitments, commitmentWhen, commitmentLate, counterpartOf, liveProjects, toWhom, fromWhom, openReminder } from '../model.js';
import { workdaysUntil, shortDate, timeAgo } from '../util.js';
import { FlagBar } from './decisions.js';

export function CommitmentRow({ c, showProject = true }) {
  const we = c.direction === 'we_owe';
  const owner = person(c.owner_id);
  const open = c.status === 'open';
  const late = commitmentLate(c);
  const soon = open && c.due && !late && workdaysUntil(c.due) <= 1;
  return html`<div class=${'crow' + (open ? '' : ' is-done') + (c._pending ? ' is-pending' : '')} role="button" tabindex="0"
    onClick=${() => openModal('commitment', { id: c.id })} onKeyDown=${(e) => { if (e.key === 'Enter') openModal('commitment', { id: c.id }); }}>
    <button type="button" class=${'cbox round' + (open ? '' : ' on')} role="checkbox" aria-checked=${open ? 'false' : 'true'}
      aria-label=${we ? 'סימון כנמסר' : 'סימון כהתקבל'} title=${open ? (we ? 'נמסר' : 'התקבל') : 'פתיחה מחדש'}
      onClick=${(e) => { e.stopPropagation(); updateCommitment(c.id, { status: open ? 'done' : 'open' }); }}>${open ? null : html`<${Icon} name="check" size=${13} />`}</button>
    <div class="crow-main">
      <div class="crow-title">${c.flagged ? html`<span class="flag-chip"><${Icon} name="alert" size=${12} />חשוד</span>` : null}${c.title}</div>
      <div class="crow-meta">
        <span class="cp">${we ? toWhom(counterpartOf(c)) : fromWhom(counterpartOf(c))}</span>
        ${showProject && c.project_id ? html`<${ProjectChip} id=${c.project_id} />` : null}
      </div>
    </div>
    <div class="crow-side">
      ${c.due ? html`<span class=${'due-chip' + (late ? ' late' : soon ? ' soon' : '')}>${open ? commitmentWhen(c) : shortDate(c.due)}</span>` : html`<span class="due-chip none">בלי מועד</span>`}
      <${Avatar} p=${owner} size=${24} title=${owner ? `באחריות ${owner.name}` : 'בלי אחראי'} />
    </div>
  </div>`;
}

export function CommitmentEditor({ s }) {
  const data = s.modalData || {};
  const c = data.id ? s.commitments.find((x) => x.id === data.id) : null;
  const def = data.defaults || {};
  const [title, setTitle] = useState(c?.title || def.title || '');
  const [direction, setDirection] = useState(c?.direction || def.direction || 'we_owe');
  const [counterpart, setCounterpart] = useState(c?.counterpart || '');
  const [contact, setContact] = useState(c?.contact || '');
  const [owner, setOwner] = useState(c ? c.owner_id || '' : def.owner_id || s.auth?.me || '');
  const [due, setDue] = useState(c?.due || def.due || '');
  const [projectId, setProjectId] = useState(c?.project_id || def.project_id || '');
  const [notes, setNotes] = useState(c?.notes || '');
  const [busy, setBusy] = useState(false);
  const we = direction === 'we_owe';
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    const fields = {
      title: title.trim(), direction, counterpart: counterpart.trim() || null, contact: contact.trim() || null, owner_id: owner || null,
      due: due || null, project_id: projectId || null, notes: notes.trim() || null,
    };
    setBusy(true);
    const saved = c ? await updateCommitment(c.id, fields) : await createCommitment(fields);
    setBusy(false);
    if (saved) closeModal();
  };
  const history = c ? s.activity.filter((a) => a.commitment_id === c.id).slice(0, 5) : [];
  const reminder = c ? openReminder(c, s) : null;
  return html`<${Modal} title=${c ? 'התחייבות' : 'התחייבות חדשה'}>
    ${c?.flagged ? html`<${FlagBar} kind="commitment" id=${c.id} />` : null}
    ${reminder ? html`<div class="remind-bar" role="status"><${Icon} name="bell" size=${16} />
      <span class="grow">תזכורת נשלחה ${timeAgo(reminder.sent_at)}. אם הכל בזמן, מספיק לסמן. אם משהו השתנה, מעדכנים כאן מועד או הערה ושומרים.</span>
      <button type="button" class="btn sm" onClick=${() => answerReminder(c)}><${Icon} name="check" size=${14} />בזמן</button></div>` : null}
    <form class="form" onSubmit=${submit}>
      <${Seg} label="כיוון" value=${direction} onChange=${setDirection} options=${[{ id: 'we_owe', label: 'הבטחנו', icon: 'swap' }, { id: 'they_owe', label: 'מחכים להם', icon: 'clock' }]} />
      <label class="lbl" for="ce-title">${we ? 'מה הבטחנו?' : 'מה מחכים לקבל?'}</label>
      <input id="ce-title" class="input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} required autoFocus=${!c}
        placeholder=${we ? 'למשל: מצגת סיכום לדרג הבכיר' : 'למשל: נתוני שימוש מהרבעון'} />
      <div class="form-2">
        <div><label class="lbl" for="ce-cp">${we ? 'למי' : 'ממי'}</label>
          <input id="ce-cp" class="input" value=${counterpart} onInput=${(e) => setCounterpart(e.currentTarget.value)} placeholder="אדם או גוף מחוץ לצוות" /></div>
        <div><label class="lbl" for="ce-due">עד מתי</label>
          <input id="ce-due" class="input" type="date" value=${due} onChange=${(e) => setDue(e.currentTarget.value)} /></div>
      </div>
      <div class="form-2">
        <div><label class="lbl" for="ce-owner">מי בצוות אחראי</label>
          <select id="ce-owner" class="input" value=${owner} onChange=${(e) => setOwner(e.currentTarget.value)}>
            ${humanPeople().filter((p) => p.is_team).map((p) => html`<option value=${p.id}>${p.name}</option>`)}
          </select></div>
        <div><label class="lbl" for="ce-project">פרויקט</label>
          <select id="ce-project" class="input" value=${projectId} onChange=${(e) => setProjectId(e.currentTarget.value)}>
            <option value="">בלי פרויקט</option>
            ${liveProjects(s).map((p) => html`<option value=${p.id}>${p.name}</option>`)}
          </select></div>
      </div>
      <label class="lbl" for="ce-contact">איש קשר</label>
      <input id="ce-contact" class="input" value=${contact} onInput=${(e) => setContact(e.currentTarget.value)} placeholder="שם ודרך להשיג (לא חובה)" />
      <label class="lbl" for="ce-notes">הערות</label>
      <textarea id="ce-notes" class="input area" rows="2" value=${notes} onInput=${(e) => setNotes(e.currentTarget.value)}></textarea>
      <${BlmsNote} />
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" disabled=${!title.trim() || busy}>${c ? 'שמירה' : 'הוספה'}</button>
        <button type="button" class="btn" onClick=${closeModal}>ביטול</button>
        ${c ? html`<span class="grow"></span>
          ${!c.flagged ? html`<button type="button" class="icon-btn" title="סימון כחשוד במידע מסווג" aria-label="סימון כחשוד" onClick=${() => { flagItem('commitment', c.id); closeModal(); }}><${Icon} name="alert" /></button>` : null}
          <button type="button" class="icon-btn" title="מחיקה" aria-label="מחיקת ההתחייבות" onClick=${() => { archiveCommitment(c.id); closeModal(); }}><${Icon} name="trash" /></button>` : null}
      </div>
    </form>
    ${history.length ? html`<p class="muted small ce-hist">${history.map((a) => `${person(a.actor_id)?.name || 'מערכת'} · ${timeAgo(a.at)}`).join(' | ')}</p>` : null}
  <//>`;
}

function Section({ title, hint, list, empty, direction }) {
  return html`<section class="csec">
    <header class="section-head"><h2>${title}</h2><span class="count">${list.length}</span><span class="muted small">${hint}</span>
      <span class="grow"></span>
      <button type="button" class="btn sm" onClick=${() => openModal('commitment', { defaults: { direction } })}><${Icon} name="plus" size=${14} />הוספה</button></header>
    ${list.length ? html`<div class="rows">${list.map((c) => html`<${CommitmentRow} key=${c.id} c=${c} />`)}</div>` : html`<p class="none">${empty}</p>`}
  </section>`;
}

export function Commitments({ s }) {
  const [view, setView] = useState('open');
  const all = visibleCommitments(s);
  const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');
  const open = all.filter((c) => c.status === 'open').sort(byDue);
  const closed = all.filter((c) => c.status !== 'open').sort((a, b) => (b.done_at || b.updated_at || '').localeCompare(a.done_at || a.updated_at || ''));
  const list = view === 'open' ? open : closed;
  const late = open.filter(commitmentLate).length;
  return html`<div class="page commitments">
    <header class="page-head">
      <div><h1>התחייבויות</h1><p class="sub">מה הבטחנו החוצה ומה מחכים שיגיע אלינו. לכל אחת אחראי ומועד, והיא עולה ב"מה מחכה לי" חמישה ימי עבודה לפני המועד.</p></div>
      <div class="head-actions"><button type="button" class="btn btn-primary" onClick=${() => openModal('commitment', {})}><${Icon} name="plus" size=${16} />התחייבות חדשה</button></div>
    </header>
    <div class="view-bar">
      <${Seg} label="תצוגה" value=${view} onChange=${setView} options=${[{ id: 'open', label: 'פתוחות', count: open.length }, { id: 'closed', label: 'נסגרו' }]} />
      ${late ? html`<span class="badge bad">${late} באיחור</span>` : null}
    </div>
    ${view === 'open' && !open.length ? html`<${Empty} title="אין התחייבויות פתוחות" icon="swap">
      כשמבטיחים משהו למישהו מחוץ לצוות, או מחכים למשהו ממנו, רושמים את זה כאן עד סוף אותו יום עבודה.<//>` : html`
      <${Section} title="הבטחנו" hint="מה אנחנו צריכים למסור" direction="we_owe" list=${list.filter((c) => c.direction === 'we_owe')}
        empty=${view === 'open' ? 'אין כרגע מסירות פתוחות.' : 'עוד לא נסגרו מסירות.'} />
      <${Section} title="מחכים להם" hint="מה אמור להגיע אלינו" direction="they_owe" list=${list.filter((c) => c.direction === 'they_owe')}
        empty=${view === 'open' ? 'לא מחכים כרגע לאף אחד מבחוץ.' : 'עוד לא התקבל כלום.'} />`}
  </div>`;
}
