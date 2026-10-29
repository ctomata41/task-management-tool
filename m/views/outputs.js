// Outputs: everything a project produced, in one place for its partners. A pilot or final output can be opened to the
// whole team for feedback. In a restricted project an output is either unclassified material or a pointer: a name and
// where it lives on the classified network, never the content. In a project that is all there, only pointers.
import { useState } from 'preact/hooks';
import { html, Icon, Avatar, Pill, Seg, ProjectTag, Empty, ago, OUT_KIND, LEVEL } from '../ui.js';
import { useStore, project, person, canSeeDetail, canManage, visibleOutputs, openSheet, closeSheet, updateOutput, addFeedback, addOutput, toast } from '../store.js';
import { currentStage, placeOf, isRestricted } from '../card.js';

const KIND_COLOR = { doc: 'var(--accent)', sheet: 'var(--s-done)', deck: 'var(--s-progress)', meeting: 'var(--s-waiting)', image: 'var(--h-risk)', link: 'var(--s-todo)', pointer: 'var(--fg-3)' };

export function OutputCard({ o, showProject = true }) {
  const k = OUT_KIND[o.kind] || OUT_KIND.link;
  const lv = LEVEL[o.level] || LEVEL.draft;
  const p = project(o.project);
  const st = p?.stages.find((s) => s.id === o.stage);
  return html`<button type="button" class="ocard2" style=${`--c:${KIND_COLOR[o.kind] || 'var(--accent)'}`} onClick=${() => openSheet('output', { id: o.id })}>
    <span class="oc-ic"><${Icon} name=${k.icon} size=${20} /></span>
    <span class="oc-main">
      <strong class="oc-title">${o.title}</strong>
      <span class="oc-meta">${showProject && p ? html`<${ProjectTag} id=${p.id} />` : null}${st ? html`<span class="muted small">${st.name}</span>` : null}<span class="muted small">${person(o.by).name} · ${ago(o.at)}</span></span>
      <span class="oc-tags"><${Pill} color=${lv.color}>${lv.label}</${Pill}>
        ${openToTeam(o) ? html`<${Pill} color="var(--accent)">פתוח למשוב${o.feedback?.length ? ` · ${o.feedback.length}` : ''}</${Pill}>` : null}
        ${o.kind === 'pointer' ? html`<span class="cls-tag sm"><${Icon} name="lock" size=${11} />ברשת המסווגת</span>` : null}
        ${o.hasAudio ? html`<span class="muted small"><${Icon} name="mic" size=${12} /> הקלטה מצורפת</span>` : null}</span>
    </span>
  </button>`;
}

// Open for feedback reaches the whole team, even those outside the project, but never past the lock on a restricted
// project: there an output stays with the project's people, so it is never offered or shown as open.
const openToTeam = (o) => !!o.open && !isRestricted(project(o.project));

export function Outputs() {
  const s = useStore();
  const [filter, setFilter] = useState('all');
  const all = visibleOutputs().filter((o) => !project(o.project)?.personal || project(o.project)?.personal === s.me);
  // Open-for-feedback outputs reach the whole team, even from projects they are not part of, and an outside partner
  // only from their own projects (canSeeDetail).
  const openAll = s.outputs.filter((o) => openToTeam(o) && !project(o.project)?.personal && canSeeDetail(project(o.project)));
  const shown = filter === 'open' ? openAll : filter === 'mine' ? all.filter((o) => o.by === s.me) : all;
  return html`<div class="page">
    <header class="page-head2"><div><h1>תוצרים</h1><p class="sub">מסמכים, טבלאות, סיכומי פגישות ומצביעים לחומר שברשת המסווגת, מכל הפרויקטים שלך.</p></div></header>
    <${Seg} label="סינון" value=${filter} onChange=${setFilter} options=${[{ id: 'all', label: 'הכול', n: all.length }, { id: 'open', label: 'פתוחים למשוב', n: openAll.length || null }, { id: 'mine', label: 'שהעליתי' }]} />
    ${filter === 'open' ? html`<p class="muted small">תוצרים שהגיעו לפיילוט או לגרסה סופית ונפתחו לכל הצוות. משוב קצר עוזר יותר מכל ישיבה.</p>` : null}
    ${shown.length ? html`<div class="ogrid">${shown.map((o) => html`<${OutputCard} key=${o.id} o=${o} />`)}</div>` : html`<${Empty} icon="file">אין כאן תוצרים עדיין.</${Empty}>`}
  </div>`;
}

// ---------- one output ----------
export function OutputSheetBody({ id }) {
  const s = useStore();
  const o = s.outputs.find((x) => x.id === id);
  const [text, setText] = useState('');
  if (!o) return html`<${Empty}>התוצר נמחק.</${Empty}>`;
  const p = project(o.project);
  // A project's output is for whoever sees the project in detail, and one open for feedback for the whole team too.
  if (p && !(canSeeDetail(p) || (openToTeam(o) && person(s.me).role !== 'external'))) return html`<${Empty} icon="lock">התוצר הזה רק למי שבפרויקט</${Empty}>`;
  const member = p && canSeeDetail(p); // past a locked project's one line, as everywhere
  const mgr = p && (canManage(p) || o.by === s.me);
  const m = o.kind === 'meeting' ? s.meetings.find((x) => x.id === o.meeting || x.output === o.id) : null;
  const k = OUT_KIND[o.kind] || OUT_KIND.link;
  const canFeedback = member || openToTeam(o);
  return html`<div class="osheet">
    <div class="os-head" style=${`--c:${KIND_COLOR[o.kind] || 'var(--accent)'}`}><span class="oc-ic"><${Icon} name=${k.icon} size=${22} /></span>
      <div class="grow"><strong>${o.title}</strong><div class="muted small">${k.label}${p ? ` · ${p.name}` : ''} · ${person(o.by).name} · ${ago(o.at)}</div></div></div>

    ${o.kind === 'pointer' ? html`<div class="note-band lock"><${Icon} name="lock" size=${16} /><span><b>החומר ברשת המסווגת.</b> ${o.where || 'המיקום לא צוין'}</span></div>` : null}
    ${o.url ? html`<a class="btn btn-primary block" href=${o.url} target="_blank" rel="noopener"><${Icon} name="external" size=${16} />פתיחה</a>` : null}
    ${o.fileName ? html`<div class="file-chip"><${Icon} name="file" size=${16} />${o.fileName}<span class="muted small">נשמר רק בדפדפן הזה בגרסת הדמו</span></div>` : null}
    ${m ? html`<${MeetingSummary} m=${m} />` : null}
    ${o.audio ? html`<div class="sec"><span class="lbl">ההקלטה המקורית</span><audio controls src=${o.audio} class="audio"></audio></div>` : o.hasAudio ? html`<p class="muted small">ההקלטה המקורית נשמרת בגרסה החיה. בדמו היא זמינה רק עד שסוגרים את הלשונית.</p>` : null}

    ${mgr ? html`<div class="os-controls">
      <span class="lbl">שלב בשלות</span>
      <${Seg} label="שלב בשלות" value=${o.level || 'draft'} onChange=${(lv) => updateOutput(o.id, { level: lv, open: lv === 'draft' ? false : o.open })} options=${Object.entries(LEVEL).map(([id, v]) => ({ id, label: v.label }))} />
      ${o.level && o.level !== 'draft' && !p?.personal && !isRestricted(p) ? html`<label class="toggle-row"><input type="checkbox" checked=${!!o.open} onChange=${(e) => { updateOutput(o.id, { open: e.currentTarget.checked }); if (e.currentTarget.checked) toast('התוצר פתוח עכשיו למשוב של כל הצוות'); }} />
        <span><b>פתוח למשוב של כל הצוות</b><span class="muted small">גם מי שלא בפרויקט יראה אותו ויוכל להגיב</span></span></label>` : null}
    </div>` : null}

    ${canFeedback ? html`<div class="sec">
      <span class="lbl">משוב${o.feedback?.length ? ` · ${o.feedback.length}` : ''}</span>
      ${(o.feedback || []).map((f) => html`<div class="fb-row"><${Avatar} id=${f.who} size=${26} /><div class="grow"><div>${f.text}</div><div class="muted small">${person(f.who).name} · ${ago(f.at)}</div></div></div>`)}
      <form class="inline-form" onSubmit=${(e) => { e.preventDefault(); if (text.trim()) { addFeedback(o.id, text.trim()); setText(''); } }}>
        <input class="input" value=${text} onInput=${(e) => setText(e.currentTarget.value)} placeholder="מה עובד, מה חסר" aria-label="משוב" />
        <button type="submit" class="btn btn-primary" disabled=${!text.trim()}>שליחה</button></form>
    </div>` : null}
  </div>`;
}

export function MeetingSummary({ m }) {
  const sm = m.summary;
  if (!sm) return html`<div class="muted small">הסיכום עוד לא מוכן.</div>`;
  const part = (title, list, icon) => (list && list.length ? html`<div class="ms-part"><span class="lbl"><${Icon} name=${icon} size=${14} />${title}</span><ul>${list.map((x) => html`<li>${typeof x === 'string' ? x : html`${x.text}${x.owner ? html` <span class="muted small">· ${x.owner}</span>` : null}`}</li>`)}</ul></div>` : null);
  return html`<div class="msum">
    <div class="muted small">${m.purpose ? `מטרה: ${m.purpose} · ` : ''}${m.minutes ? `${m.minutes} דקות` : ''}</div>
    ${part('החלטות', sm.decisions, 'decision')}
    ${part('משימות', sm.tasks, 'checklist')}
    ${part('שאלות פתוחות', sm.questions, 'bulb')}
    ${sm.next ? html`<div class="ms-part"><span class="lbl"><${Icon} name="chevronLeft" size=${14} />הצעד הבא</span><div>${sm.next}</div></div>` : null}
  </div>`;
}

// ---------- a new output ----------
export function NewOutputBody({ project: pid }) {
  const s = useStore();
  const p = project(pid);
  const restricted = isRestricted(p);
  const there = !!p && placeOf(p) === 'there'; // only a pointer: a name and where it is (store.addOutput)
  const [pick, setHow] = useState(restricted ? 'pointer' : 'link');
  const how = there ? 'pointer' : pick;
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [where, setWhere] = useState('');
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('doc');
  const [stage, setStage] = useState(currentStage(p || { stages: [] })?.id || '');
  const [ok, setOk] = useState(!restricted);
  const ready = title.trim() && (how === 'link' ? url.trim() : how === 'file' ? file : where.trim()) && (how === 'pointer' || ok);
  const save = (e) => {
    e.preventDefault();
    if (!ready) return;
    const out = addOutput({ project: pid, title: title.trim(), kind: how === 'pointer' ? 'pointer' : how === 'link' ? 'link' : kind, url: how === 'link' ? url.trim() : null,
      where: how === 'pointer' ? where.trim() : null, fileName: how === 'file' ? file.name : null, stage: stage || null });
    if (!out) return; // refused: not mine to add to (canAddOutput)
    closeSheet();
    toast('התוצר נוסף לפרויקט');
  };
  return html`<form class="form" onSubmit=${save}>
    ${there ? html`<div class="note-band lock"><${Icon} name="lock" size=${16} /><span>בפרויקט שכולו ברשת המסווגת מוסיפים רק מצביע: שם ומיקום, בלי התוכן.</span></div>`
      : html`<${Seg} label="מה מוסיפים" value=${how} onChange=${setHow} options=${[{ id: 'link', label: 'קישור' }, { id: 'file', label: 'קובץ' }, ...(restricted ? [{ id: 'pointer', label: 'מצביע לרשת המסווגת' }] : [])]} />`}
    <label class="lbl" for="o-title">שם התוצר</label>
    <input id="o-title" class="input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder="למשל: מסמך אפיון, גרסה 2" />
    ${how === 'link' ? html`<label class="lbl" for="o-url">קישור</label><input id="o-url" class="input" type="url" dir="ltr" value=${url} onInput=${(e) => setUrl(e.currentTarget.value)} placeholder="https://" />` : null}
    ${how === 'file' ? html`<label class="lbl">קובץ</label><label class="file-pick"><input type="file" onChange=${(e) => setFile(e.currentTarget.files[0] || null)} /><${Icon} name="upload" size=${16} />${file ? file.name : 'בחירת קובץ'}</label>
      <label class="lbl">סוג</label><${Seg} label="סוג" value=${kind} onChange=${setKind} options=${['doc', 'sheet', 'deck', 'image'].map((k) => ({ id: k, label: OUT_KIND[k].label }))} />` : null}
    ${how === 'pointer' ? html`<label class="lbl" for="o-where">איפה זה ברשת המסווגת</label><input id="o-where" class="input" value=${where} onInput=${(e) => setWhere(e.currentTarget.value)} placeholder="למשל: תיקיית הצוות > ניסויים > דוח 3" />
      <p class="muted small">רק שם ומיקום. בלי תוכן, בלי תקציר ובלי מספרים.</p>` : null}
    ${p?.stages.length ? html`<label class="lbl">שייך לשלב</label><select class="input" value=${stage} onChange=${(e) => setStage(e.currentTarget.value)}>
      <option value="">בלי שלב</option>${p.stages.map((st) => html`<option value=${st.id}>${st.name}</option>`)}</select>` : null}
    ${restricted && how !== 'pointer' ? html`<label class="toggle-row"><input type="checkbox" checked=${ok} onChange=${(e) => setOk(e.currentTarget.checked)} /><span><b>החומר הזה בלמ"ס</b><span class="muted small">בפרויקט שמור/סודי מעלים לכאן רק חומר לא מסווג</span></span></label>` : null}
    <div class="form-actions"><button type="submit" class="btn btn-primary" disabled=${!ready}>הוספה</button><button type="button" class="btn" onClick=${closeSheet}>ביטול</button></div>
  </form>`;
}
