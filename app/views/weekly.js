// The weekly meeting runs in front of this screen, 30 minutes (spec): open decisions (10), project status (10),
// next week's priorities (5) and the idea basket (5). It is the commander's main interface to the platform.
import { useEffect, useState } from 'preact/hooks';
import {
  person, updateProject, saveMeeting, createIdea, updateIdea, archiveIdea, createProject, openModal, flagItem,
} from '../store.js';
import { html, Icon, Avatar, HealthPill, InlineText, AutoText, Empty, BlmsNote } from '../ui.js';
import { DecisionCard } from './decisions.js';
import { openDecisions, liveProjects, projectSummary, canSee, STAGE } from '../model.js';
import { weekStart, weekEnd, addDays, shortDate, dueLabel, timeAgo } from '../util.js';

function Clock() {
  const [start, setStart] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!start) return undefined;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [start]);
  if (!start) return html`<button type="button" class="btn btn-primary" onClick=${() => setStart(Date.now())}><${Icon} name="play" size=${16} />התחלת הפגישה</button>`;
  const sec = Math.floor((Date.now() - start) / 1000);
  const mm = Math.floor(sec / 60);
  const part = mm < 10 ? 'החלטות פתוחות' : mm < 20 ? 'מצב הפרויקטים' : mm < 25 ? 'תעדוף לשבוע הבא' : mm < 30 ? 'סל הרעיונות' : 'הזמן נגמר';
  return html`<span class=${'wclock' + (mm >= 30 ? ' over' : '')} title="30 דקות">
    <span class="wclock-t">${mm}:${String(sec % 60).padStart(2, '0')}</span><span class="wclock-p">${part}</span>
    <button type="button" class="icon-btn sm" aria-label="איפוס השעון" onClick=${() => setStart(null)}><${Icon} name="x" size=${14} /></button></span>`;
}

function Part({ n, title, minutes, hint, children }) {
  return html`<section class="wpart">
    <header class="wpart-head"><span class="wpart-n">${n}</span><h2>${title}</h2><span class="wpart-min">${minutes} דק׳</span>
      ${hint ? html`<span class="muted small">${hint}</span>` : null}</header>
    ${children}
  </section>`;
}

function ProjectStatus({ p }) {
  const x = projectSummary(p);
  const risky = p.health === 'at_risk' || p.health === 'off_track';
  const lead = person(p.owner_id);
  return html`<div class=${'wproj' + (risky ? ' risky' : '')}>
    <div class="wproj-top">
      <a class="wproj-name" href=${'#/project/' + p.id}><i style=${`background:${p.color || 'var(--accent)'}`}></i>${p.name}</a>
      ${p.stage === 'proposed' ? html`<span class="stage-chip s-proposed">${STAGE.proposed.label}</span>` : html`<${HealthPill} p=${p} onPick=${(h) => updateProject(p.id, { health: h })} />`}
      ${lead ? html`<span class="wproj-lead"><${Avatar} p=${lead} size=${20} />${lead.name}</span>` : null}
    </div>
    <div class="wproj-line"><span class="fact-l">שורת מצב</span>
      <${InlineText} value=${p.health_note} placeholder="משפט אחד: איפה הפרויקט עומד" onSave=${(v) => updateProject(p.id, { health_note: v || null })} />
      <span class="muted small">${p.updated_at ? `עודכן ${timeAgo(p.updated_at)}` : ''}</span></div>
    ${risky || x.decisions.length || x.lateCommitments || x.stuck || x.nextMilestone ? html`<ul class="wproj-facts">
      ${x.nextMilestone ? html`<li><${Icon} name="flag" size=${13} />הבא: ${x.nextMilestone.title}${x.nextMilestone.due ? ` · ${dueLabel(x.nextMilestone.due)}` : ''}</li>` : null}
      ${x.decisions.length ? html`<li><${Icon} name="decision" size=${13} />${x.decisions.length === 1 ? 'החלטה אחת פתוחה' : `${x.decisions.length} החלטות פתוחות`}</li>` : null}
      ${x.stuck ? html`<li class="bad"><${Icon} name="octagon" size=${13} />${x.stuck === 1 ? 'חסם אחד' : `${x.stuck} חסמים`}</li>` : null}
      ${x.lateCommitments ? html`<li class="bad"><${Icon} name="swap" size=${13} />${x.lateCommitments === 1 ? 'התחייבות אחת באיחור' : `${x.lateCommitments} התחייבויות באיחור`}</li>` : null}
      ${x.review ? html`<li><${Icon} name="sparkle" size=${13} />${x.review} לבדיקה</li>` : null}
    </ul>` : null}
  </div>`;
}

function Ideas({ s }) {
  const [title, setTitle] = useState('');
  const [showDropped, setShowDropped] = useState(false);
  const ideas = s.ideas.filter((i) => canSee(i, s));
  const live = ideas.filter((i) => i.status === 'new' || i.status === 'chosen').sort((a, b) => (a.status === 'chosen' ? -1 : 0) - (b.status === 'chosen' ? -1 : 0));
  const dropped = ideas.filter((i) => i.status === 'dropped');
  const toProject = async (i) => {
    const p = await createProject({ name: i.title, description: i.notes || null });
    if (p) await updateIdea(i.id, { status: 'project', project_id: p.id });
  };
  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const saved = await createIdea({ title });
    if (saved) setTitle('');
  };
  return html`<div class="ideas">
    ${live.length ? html`<ul class="idea-list">${live.map((i) => html`<li key=${i.id} class=${'idea' + (i.status === 'chosen' ? ' chosen' : '') + (i._pending ? ' is-pending' : '')}>
      <div class="idea-main"><span class="idea-title">${i.status === 'chosen' ? html`<span class="badge ok">נבחר</span>` : null}${i.title}</span>
        <span class="muted small">${person(i.created_by)?.name || ''}${i.notes ? ` · ${i.notes}` : ''}</span></div>
      <div class="idea-actions">
        <button type="button" class="btn sm" onClick=${() => toProject(i)}><${Icon} name="folder" size=${14} />לפרויקט</button>
        ${i.status !== 'chosen' ? html`<button type="button" class="btn sm" onClick=${() => updateIdea(i.id, { status: 'chosen' })}>לבחור</button>` : null}
        <button type="button" class="btn sm ghost" onClick=${() => updateIdea(i.id, { status: 'dropped' })}>לא עכשיו</button>
        <button type="button" class="icon-btn sm" aria-label="סימון כחשוד" title="סימון כחשוד במידע מסווג" onClick=${() => flagItem('idea', i.id)}><${Icon} name="alert" size=${14} /></button>
      </div></li>`)}</ul>` : html`<p class="none">הסל ריק. רעיון שעולה במהלך השבוע נכנס לכאן, ובפגישה מחליטים מה עושים איתו.</p>`}
    <form class="inline-add idea-add" onSubmit=${add}>
      <${Icon} name="bulb" size=${16} />
      <input id="new-idea" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder="רעיון חדש לסל" aria-label="רעיון חדש לסל" />
      <button type="submit" class="btn sm" disabled=${!title.trim()}>הוספה</button>
    </form>
    ${dropped.length ? html`<button type="button" class="link sm" onClick=${() => setShowDropped(!showDropped)}>${showDropped ? 'הסתרה' : `הוצאו מהסל (${dropped.length})`}</button>` : null}
    ${showDropped ? html`<ul class="idea-list dropped">${dropped.map((i) => html`<li key=${i.id} class="idea">
      <div class="idea-main"><span class="idea-title">${i.title}</span></div>
      <div class="idea-actions"><button type="button" class="btn sm" onClick=${() => updateIdea(i.id, { status: 'new' })}>להחזיר לסל</button>
        <button type="button" class="icon-btn sm" aria-label="מחיקה" onClick=${() => archiveIdea(i.id)}><${Icon} name="trash" size=${14} /></button></div></li>`)}</ul>` : null}
  </div>`;
}

export function Weekly({ s }) {
  const ws = weekStart();
  const meeting = s.meetings.find((m) => m.week_start === ws);
  const prev = s.meetings.find((m) => m.week_start === addDays(ws, -7));
  const open = openDecisions(s).sort((a, b) => (a.kind === 'priority' ? 0 : 1) - (b.kind === 'priority' ? 0 : 1) || new Date(a.created_at) - new Date(b.created_at));
  const health = { off_track: 0, at_risk: 1, on_track: 2 };
  const projects = liveProjects(s).sort((a, b) => (a.stage === 'proposed' ? -1 : 0) - (b.stage === 'proposed' ? -1 : 0) || (health[a.health] ?? 3) - (health[b.health] ?? 3));
  return html`<div class="page weekly">
    <header class="page-head">
      <div><p class="eyebrow">שבוע ${shortDate(ws)} עד ${shortDate(weekEnd())}</p><h1>הפגישה השבועית</h1>
        <p class="sub">30 דקות מול המסך: החלטות פתוחות, מצב הפרויקטים, תעדוף לשבוע הבא וסל הרעיונות.</p></div>
      <div class="head-actions"><${Clock} />
        <button type="button" class="btn" onClick=${() => openModal('report')}><${Icon} name="report" size=${16} />דוח שבועי</button></div>
    </header>

    <${Part} n="1" title="החלטות פתוחות" minutes="10" hint="הוותיקות קודם. תעדוף בין פרויקטים מחליטים כאן.">
      ${open.length ? html`<div class="dc-grid">${open.map((d) => html`<${DecisionCard} key=${d.id} d=${d} compact />`)}</div>`
        : html`<p class="none">אין החלטות פתוחות.</p>`}
      <button type="button" class="link add-opt" onClick=${() => openModal('decision', { defaults: { kind: 'priority' } })}><${Icon} name="plus" size=${14} />החלטת תעדוף לפגישה</button>
    <//>

    <${Part} n="2" title="מצב הפרויקטים" minutes="10" hint="שורה לכל פרויקט. מה שבסיכון נפתח לדיון.">
      ${projects.length ? html`<div class="wprojects">${projects.map((p) => html`<${ProjectStatus} key=${p.id} p=${p} />`)}</div>`
        : html`<${Empty} title="אין פרויקטים פעילים" icon="folder" />`}
    <//>

    <${Part} n="3" title="תעדוף לשבוע הבא" minutes="5">
      ${prev?.priorities ? html`<div class="prev-prio"><span class="fact-l">מה קבענו בשבוע שעבר</span><p>${prev.priorities}</p></div>` : null}
      <${AutoText} cls="field-text prio-text" rows=${3} value=${meeting?.priorities} label="התעדוף לשבוע הבא"
        placeholder="שורה לכל עדיפות, הכי חשוב למעלה" onSave=${(v) => saveMeeting(ws, { priorities: v.trim() || null })} />
    <//>

    <${Part} n="4" title="סל הרעיונות" minutes="5"><${Ideas} s=${s} /><//>

    <section class="wpart">
      <header class="wpart-head"><h2>סיכום הפגישה</h2></header>
      <${AutoText} cls="field-text" rows=${3} value=${meeting?.notes} label="סיכום הפגישה"
        placeholder="מה סוכם ומי לוקח מה. החלטות נרשמות בכרטיסי ההחלטה." onSave=${(v) => saveMeeting(ws, { notes: v.trim() || null })} />
      <${BlmsNote} />
    </section>
  </div>`;
}
