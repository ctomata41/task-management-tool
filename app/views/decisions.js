// Decisions: people decide, Claude does the work (spec). A decision card is answered in two taps: pick an option, then
// confirm with an optional "why" that goes into the project's decision log. The kind of a decision routes it.
import { useState } from 'preact/hooks';
import {
  getState, person, project, decide, reopenDecision, cancelDecision, archiveDecision, updateDecision, createDecision,
  openModal, closeModal, openMenu, flagItem, clearFlag, redactItem, isCommand,
} from '../store.js';
import {
  html, Icon, Avatar, ProjectChip, AgeChip, Modal, Empty, Seg, BlmsNote, RichText, ConfirmButton, copyText, pickPerson, humanPeople,
} from '../ui.js';
import {
  DECISION_KINDS, DECISION_KIND, DEFAULT_OPTIONS, optionsOf, gateOptions, decidesFor, gateEscalated, commanderOf, deputyOf, canSee,
  openDecisions, liveProjects, isMember,
} from '../model.js';
import { dueLabel, timeAgo, shortDate, today } from '../util.js';
import { decisionBrief } from '../export.js';
import { activityLine } from '../activity.js';

export function KindChip({ kind }) {
  const k = DECISION_KIND[kind] || DECISION_KIND.direction;
  return html`<span class=${'kind-chip k-' + (kind || 'direction')}><${Icon} name="decision" size=${13} />${k.short}</span>`;
}

function waitsFor(d) {
  if (d.kind === 'priority' && !d.assignee_id) return 'מחכה לפגישה השבועית';
  const p = person(d.assignee_id);
  return p ? `מחכה ל${p.name}` : 'עוד לא שויכה';
}

// The banner command sees on an item marked as possibly classified.
export function FlagBar({ kind, id }) {
  if (!isCommand()) return html`<div class="flag-bar"><${Icon} name="alert" size=${15} />סומן כחשוד ומוסתר עד בדיקת הפיקוד.</div>`;
  return html`<div class="flag-bar"><${Icon} name="alert" size=${15} /><span class="grow">סומן כחשוד במידע מסווג. גלוי רק לפיקוד.</span>
    <button type="button" class="btn sm" onClick=${(e) => { e.stopPropagation(); clearFlag(kind, id); }}>תקין, להחזיר</button>
    <${ConfirmButton} label="הסרה מהכלי" confirm="להסיר לצמיתות?" cls="btn sm danger" onConfirm=${() => redactItem(kind, id)} /></div>`;
}

export function DecisionCard({ d, compact = false, showProject = true }) {
  const s = getState();
  const my = s.auth?.me;
  const [picked, setPicked] = useState(null); // an option key, or 'other'
  const [why, setWhy] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const opts = optionsOf(d);
  const open = d.status === 'open';
  const assignee = person(d.assignee_id);
  const escalated = gateEscalated(d);
  const deputy = deputyOf(s);
  const late = open && d.due && d.due < today();
  const pickedOpt = opts.find((o) => o.key === picked);

  const confirm = async (e) => {
    e.preventDefault();
    const label = picked === 'other' ? other.trim() : pickedOpt?.label;
    if (!label || busy) return;
    setBusy(true);
    const saved = await decide(d, { key: picked === 'other' ? null : picked, label, rationale: why });
    setBusy(false);
    if (saved) { setPicked(null); setWhy(''); setOther(''); }
  };

  const more = (e) => {
    e.stopPropagation();
    const anchor = e.currentTarget;
    const items = [{ id: 'edit', label: 'עריכה', icon: 'edit' }];
    if (open && d.kind !== 'gate') items.push({ id: 'assign', label: 'שיוך למישהו אחר', icon: 'user' });
    if (!open) items.push({ id: 'reopen', label: 'פתיחה מחדש', icon: 'undo' });
    if (open) items.push({ id: 'cancel', label: 'ביטול ההחלטה', icon: 'x' });
    items.push({ id: 'copy', label: 'העתקה ל-Claude', icon: 'copy' });
    if (!d.flagged) items.push({ id: 'flag', label: 'סימון כחשוד במידע מסווג', icon: 'alert' });
    items.push({ id: 'archive', label: 'מחיקה', icon: 'trash', danger: true });
    openMenu(anchor, items, (id) => {
      if (id === 'edit') openModal('decision', { id: d.id });
      if (id === 'assign') pickPerson(anchor, { selected: d.assignee_id, onPick: (pid) => pid && updateDecision(d.id, { assignee_id: pid }) });
      if (id === 'reopen') reopenDecision(d);
      if (id === 'cancel') cancelDecision(d);
      if (id === 'copy') copyText(decisionBrief(d), 'ההחלטה הועתקה. אפשר להדביק בשיחה עם Claude.');
      if (id === 'flag') flagItem('decision', d.id);
      if (id === 'archive') archiveDecision(d.id);
    });
  };

  return html`<article class=${'dc' + (compact ? ' compact' : '') + (open ? '' : ' is-' + d.status) + (d._pending ? ' is-pending' : '')}>
    ${d.flagged ? html`<${FlagBar} kind="decision" id=${d.id} />` : null}
    <header class="dc-top">
      <div class="dc-chips">
        <${KindChip} kind=${d.kind} />
        ${showProject && d.project_id ? html`<${ProjectChip} id=${d.project_id} />` : null}
        ${open ? html`<${AgeChip} at=${d.created_at} />` : null}
        ${open && d.due ? html`<span class=${'due-chip' + (late ? ' late' : '')}>עד ${dueLabel(d.due)}</span>` : null}
      </div>
      <button type="button" class="icon-btn sm" aria-label="אפשרויות להחלטה" onClick=${more}><${Icon} name="more" size=${16} /></button>
    </header>
    <h3 class="dc-title">${d.title}</h3>
    ${d.context ? html`<p class="dc-context"><${RichText} text=${d.context} /></p>` : null}

    ${open ? html`
      <div class="dc-options" role="group" aria-label="אפשרויות">
        ${opts.map((o) => html`<button type="button" key=${o.key} class=${'dc-opt' + (picked === o.key ? ' on' : '') + (o.recommended ? ' rec' : '')}
          aria-pressed=${picked === o.key ? 'true' : 'false'} onClick=${() => setPicked(picked === o.key ? null : o.key)}>
          <span class="dc-opt-label">${o.label}${o.recommended ? html`<span class="rec-badge">מומלץ</span>` : null}</span>
          ${o.note ? html`<span class="dc-opt-note">${o.note}</span>` : null}
        </button>`)}
        <button type="button" class=${'dc-opt other' + (picked === 'other' ? ' on' : '')} aria-pressed=${picked === 'other' ? 'true' : 'false'}
          onClick=${() => setPicked(picked === 'other' ? null : 'other')}><span class="dc-opt-label">${opts.length ? 'אפשרות אחרת' : 'לענות במילים'}</span></button>
      </div>
      ${d.reason ? html`<p class="dc-reason"><b>למה ההמלצה:</b> ${d.reason}</p>` : null}
      ${d.unblocks ? html`<p class="dc-unblocks"><${Icon} name="unlock" size=${14} /><span><b>מחכה להחלטה:</b> ${d.unblocks}</span></p>` : null}
      ${picked ? html`<form class="dc-confirm" onSubmit=${confirm}>
        ${picked === 'other' ? html`<input class="input" value=${other} onInput=${(e) => setOther(e.currentTarget.value)} placeholder="מה ההחלטה?" aria-label="מה ההחלטה" autoFocus required />` : null}
        <input class="input" value=${why} onInput=${(e) => setWhy(e.currentTarget.value)} placeholder="למה? (לא חובה, נשמר ביומן ההחלטות)" aria-label="למה" />
        ${!decidesFor(d, my) && d.assignee_id ? html`<p class="dc-note">ההחלטה משויכת ל${assignee?.name || 'מישהו אחר'}. היא תירשם על שמך.</p>` : null}
        <div class="dc-confirm-actions">
          <button type="submit" class="btn btn-primary" disabled=${busy || (picked === 'other' && !other.trim())}>
            <${Icon} name="check" size=${16} />${picked === 'other' ? 'להחליט' : `להחליט: ${pickedOpt?.label || ''}`}</button>
          <button type="button" class="btn" onClick=${() => setPicked(null)}>ביטול</button>
        </div>
      </form>` : null}
      <footer class="dc-foot">
        ${assignee ? html`<${Avatar} p=${assignee} size=${20} />` : html`<${Icon} name="users" size=${16} />`}
        <span>${waitsFor(d)}</span>
        ${d.kind === 'gate' && deputy && d.assignee_id === commanderOf(s)?.id ? html`<span class="muted">${escalated
          ? `· אחרי 3 ימי עבודה, פתוחה גם ל${deputy.name}`
          : `· עוברת גם ל${deputy.name} אחרי 3 ימי עבודה`}</span>` : null}
      </footer>` : null}

    ${d.status === 'decided' ? html`<div class="dc-result">
      <${Icon} name="check" size=${16} />
      <div><div>הוחלט: <b>${d.chosen_label}</b></div>
        ${d.rationale ? html`<p class="dc-rationale">${d.rationale}</p>` : null}
        <span class="muted small">${person(d.decided_by)?.name || ''}${d.decided_at ? ` · ${timeAgo(d.decided_at)}` : ''}</span></div>
    </div>` : null}
    ${d.status === 'cancelled' ? html`<div class="dc-result cancelled"><${Icon} name="x" size=${16} /><div>ההחלטה בוטלה</div></div>` : null}
  </article>`;
}

// ---------- the decision editor ----------
function defaultAssignee(kind, projectId, s = getState()) {
  if (kind === 'gate') return commanderOf(s)?.id || '';
  if (kind === 'priority') return '';
  return project(projectId)?.owner_id || s.auth?.me || '';
}

export function DecisionEditor({ s }) {
  const data = s.modalData || {};
  const d = data.id ? s.decisions.find((x) => x.id === data.id) : null;
  const def = data.defaults || {};
  const [title, setTitle] = useState(d?.title || def.title || '');
  const [kind, setKind] = useState(d?.kind || def.kind || 'direction');
  const [projectId, setProjectId] = useState(d?.project_id || def.project_id || '');
  const [assignee, setAssignee] = useState(d ? d.assignee_id || '' : def.assignee_id || defaultAssignee(def.kind || 'direction', def.project_id));
  const [due, setDue] = useState(d?.due || '');
  const [context, setContext] = useState(d?.context || '');
  const [options, setOptions] = useState(d?.options?.length ? d.options.map((o) => ({ ...o })) : []);
  const [reason, setReason] = useState(d?.reason || '');
  const [unblocks, setUnblocks] = useState(d?.unblocks || '');
  const [more, setMore] = useState(!!(d && (d.context || d.reason || d.unblocks || d.due)));
  const [busy, setBusy] = useState(false);
  const proj = project(projectId);
  const cmd = commanderOf(s);
  const deputy = deputyOf(s);

  const pickKind = (k) => {
    setKind(k);
    if (k === 'gate' || k === 'priority') setAssignee(defaultAssignee(k, projectId));
    else if (!assignee || assignee === cmd?.id) setAssignee(defaultAssignee(k, projectId));
  };
  const pickProject = (pid) => {
    setProjectId(pid);
    const p = project(pid);
    if ((kind === 'direction' || kind === 'approval') && p && !isMember(p, assignee)) setAssignee(p.owner_id || assignee);
  };
  const setOpt = (i, patch) => setOptions(options.map((o, j) => (j === i ? { ...o, ...patch } : patch.recommended ? { ...o, recommended: false } : o)));
  const addOpt = () => setOptions([...options, { key: 'o' + Math.random().toString(36).slice(2, 8), label: '', note: '' }]);
  const people = humanPeople().filter((p) => p.is_team);
  const members = proj ? people.filter((p) => isMember(proj, p.id)) : [];
  const others = people.filter((p) => !members.includes(p));

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    let opts = options.filter((o) => (o.label || '').trim()).map((o) => {
      const x = { ...o, label: o.label.trim() };
      if ((x.note || '').trim()) x.note = x.note.trim(); else delete x.note;
      if (!x.recommended) delete x.recommended;
      return x;
    });
    if (kind === 'gate' && projectId && !opts.length) opts = gateOptions(proj?.stage === 'proposed' ? 'open' : 'stop');
    const fields = {
      title: title.trim(), kind, project_id: projectId || null, assignee_id: kind === 'priority' ? null : assignee || null,
      due: due || null, context: context.trim() || null, options: opts, reason: reason.trim() || null, unblocks: unblocks.trim() || null,
    };
    setBusy(true);
    const saved = d ? await updateDecision(d.id, fields) : await createDecision(fields);
    setBusy(false);
    if (saved) closeModal();
  };

  return html`<${Modal} title=${d ? 'עריכת החלטה' : 'החלטה חדשה'}>
    <form class="form" onSubmit=${submit}>
      <label class="lbl" for="de-title">מה צריך להחליט?</label>
      <input id="de-title" class="input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} required autoFocus
        placeholder="שאלה אחת, למשל: איזה כלי בוחרים לסיכומי פגישות?" />
      <span class="lbl">סוג</span>
      <div class="kind-pick" role="radiogroup" aria-label="סוג ההחלטה">
        ${DECISION_KINDS.map((k) => html`<button type="button" role="radio" key=${k.id} aria-checked=${kind === k.id ? 'true' : 'false'}
          class=${'kind-opt' + (kind === k.id ? ' on' : '')} onClick=${() => pickKind(k.id)}><b>${k.label}</b><span>${k.route}</span></button>`)}
      </div>
      <div class="form-2">
        <div><label class="lbl" for="de-project">פרויקט</label>
          <select id="de-project" class="input" value=${projectId} onChange=${(e) => pickProject(e.currentTarget.value)}>
            <option value="">בלי פרויקט</option>
            ${liveProjects(s).map((p) => html`<option value=${p.id}>${p.name}</option>`)}
          </select></div>
        <div><label class="lbl" for="de-assignee">מי מחליט</label>
          ${kind === 'gate' ? html`<p class="fixed-who" id="de-assignee">${cmd?.name || 'המפקד'}${deputy ? `, ואחרי 3 ימי עבודה גם ${deputy.name}` : ''}</p>`
            : kind === 'priority' ? html`<p class="fixed-who" id="de-assignee">בפגישה השבועית</p>`
            : html`<select id="de-assignee" class="input" value=${assignee} onChange=${(e) => setAssignee(e.currentTarget.value)}>
              ${members.map((p) => html`<option value=${p.id}>${p.name}${proj?.owner_id === p.id ? ' (מוביל)' : ' (שותף)'}</option>`)}
              ${others.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
            </select>`}</div>
      </div>

      <span class="lbl">אפשרויות</span>
      <div class="opt-edit">
        ${options.map((o, i) => html`<div class="opt-row" key=${o.key}>
          <input class="input" value=${o.label} onInput=${(e) => setOpt(i, { label: e.currentTarget.value })} placeholder=${`אפשרות ${i + 1}`} aria-label=${`אפשרות ${i + 1}`} />
          <input class="input note" value=${o.note || ''} onInput=${(e) => setOpt(i, { note: e.currentTarget.value })} placeholder="מה זה אומר (לא חובה)" aria-label="הסבר לאפשרות" />
          <button type="button" class=${'rec-toggle' + (o.recommended ? ' on' : '')} aria-pressed=${o.recommended ? 'true' : 'false'}
            onClick=${() => setOpt(i, { recommended: !o.recommended })}>מומלץ</button>
          <button type="button" class="icon-btn sm" aria-label="הסרת האפשרות" onClick=${() => setOptions(options.filter((_, j) => j !== i))}><${Icon} name="x" size=${14} /></button>
        </div>`)}
        <button type="button" class="link add-opt" onClick=${addOpt}><${Icon} name="plus" size=${14} />אפשרות</button>
        ${!options.length ? html`<p class="hint">${kind === 'gate' && projectId ? 'בלי אפשרויות: לפתוח, לא עכשיו או לעצור, לפי מצב הפרויקט'
          : DEFAULT_OPTIONS[kind]?.length ? `בלי אפשרויות: ${DEFAULT_OPTIONS[kind].join(', ')}` : 'בלי אפשרויות, עונים במילים'}</p>` : null}
      </div>

      ${more ? html`
        <label class="lbl" for="de-context">הקשר</label>
        <textarea id="de-context" class="input area" rows="3" value=${context} onInput=${(e) => setContext(e.currentTarget.value)} placeholder="מה צריך לדעת כדי להחליט"></textarea>
        <label class="lbl" for="de-reason">למה ההמלצה</label>
        <input id="de-reason" class="input" value=${reason} onInput=${(e) => setReason(e.currentTarget.value)} placeholder="משפט אחד" />
        <label class="lbl" for="de-unblocks">מה מחכה להחלטה</label>
        <input id="de-unblocks" class="input" value=${unblocks} onInput=${(e) => setUnblocks(e.currentTarget.value)} placeholder="למשל: Claude ממשיך בבניית המסך" />
        <label class="lbl" for="de-due">עד מתי</label>
        <input id="de-due" class="input" type="date" value=${due} onChange=${(e) => setDue(e.currentTarget.value)} />`
        : html`<button type="button" class="link more-fields" onClick=${() => setMore(true)}><${Icon} name="plus" size=${14} />הקשר, המלצה ומועד</button>`}
      <${BlmsNote} />
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" disabled=${!title.trim() || busy}>${d ? 'שמירה' : 'פתיחת החלטה'}</button>
        <button type="button" class="btn" onClick=${closeModal}>ביטול</button>
      </div>
    </form>
  <//>`;
}

// One decision in a sheet: the card and its history.
export function DecisionView({ s }) {
  const d = s.decisions.find((x) => x.id === s.modalData?.id);
  if (!d || !canSee(d, s)) return html`<${Modal} title="החלטה"><${Empty} title="ההחלטה לא נמצאה" icon="decision">ייתכן שהיא נמחקה.<//><//>`;
  const history = s.activity.filter((a) => a.decision_id === d.id).slice(0, 8);
  return html`<${Modal} title="החלטה">
    <${DecisionCard} d=${d} />
    ${history.length ? html`<section class="dsec dv-history"><h3>היסטוריה</h3><ul class="activity">
      ${history.map((a) => html`<li key=${a.id}><div class="act-row static">${activityLine(a)}<span class="act-time">${timeAgo(a.at)}</span></div></li>`)}
    </ul></section>` : null}
  <//>`;
}

// ---------- the decisions page: what is open, oldest first, and the decision log ----------
export function Decisions({ s }) {
  const my = s.auth?.me;
  const [tab, setTab] = useState('open');
  const [who, setWho] = useState('all');
  const all = openDecisions(s);
  const open = all.filter((d) => who === 'all' || decidesFor(d, my, s)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const log = s.decisions.filter((d) => d.status !== 'open' && canSee(d, s))
    .sort((a, b) => (b.decided_at || b.updated_at || '').localeCompare(a.decided_at || a.updated_at || ''));
  return html`<div class="page decisions">
    <header class="page-head">
      <div><h1>החלטות</h1><p class="sub">אנשים מחליטים, Claude מבצע. החלטה שמחכה יותר משני ימי עבודה עולה לפיקוד.</p></div>
      <div class="head-actions"><button type="button" class="btn btn-primary" onClick=${() => openModal('decision', {})}><${Icon} name="plus" size=${16} />החלטה חדשה</button></div>
    </header>
    <div class="view-bar">
      <${Seg} label="תצוגה" value=${tab} onChange=${setTab} options=${[{ id: 'open', label: 'פתוחות', count: all.length }, { id: 'log', label: 'יומן החלטות' }]} />
      ${tab === 'open' ? html`<${Seg} label="של מי" value=${who} onChange=${setWho} options=${[{ id: 'all', label: 'כל הצוות' }, { id: 'mine', label: 'שלי' }]} />` : null}
    </div>
    ${tab === 'open' ? (open.length
      ? html`<div class="dc-grid">${open.map((d) => html`<${DecisionCard} key=${d.id} d=${d} />`)}</div>`
      : html`<${Empty} title=${who === 'mine' ? 'אין החלטות שמחכות לך' : 'אין החלטות פתוחות'} icon="decision">
          החלטה היא שאלה אחת עם אפשרויות. פותחים אותה כאן או מתוך פרויקט, והיא מגיעה למי שמחליט.<//>`)
      : (log.length ? html`<div class="rows dlog">${log.map((d) => html`<button type="button" class="dlog-row" key=${d.id} onClick=${() => openModal('decisionView', { id: d.id })}>
          <span class="dlog-date">${d.decided_at ? shortDate(d.decided_at.slice(0, 10)) : ''}</span>
          <span class="dlog-main"><span class="dlog-title">${d.title}</span>
            <span class="dlog-meta">${d.status === 'decided' ? html`<b>${d.chosen_label}</b>` : html`<span class="muted">בוטלה</span>`}
              ${d.rationale ? html`<span class="muted"> · ${d.rationale}</span>` : null}</span></span>
          <span class="dlog-side">${d.project_id ? html`<${ProjectChip} id=${d.project_id} />` : null}
            <span class="muted small">${person(d.decided_by)?.name || ''}</span></span>
        </button>`)}</div>`
        : html`<${Empty} title="יומן ההחלטות ריק" icon="list">כל החלטה שמתקבלת נרשמת כאן, עם מי החליט ולמה.<//>`)}
  </div>`;
}
