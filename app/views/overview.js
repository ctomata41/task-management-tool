// "תמונת מצב": the commander's view of the whole team at a glance.
import { visibleTasks, team, person, openTask, me, openModal } from '../store.js';
import { html, Icon, Avatar, Progress, HealthPill, Empty, navigate } from '../ui.js';
import { STATUSES, STATUS, isOverdue, isStuck, weekStart, ymd, greeting, longDate, timeAgo, daysSince, shortDate } from '../util.js';

export function stuckSince(t, activity) {
  const a = activity.find((x) => x.task_id === t.id && x.kind === 'status' && (x.payload?.to === 'blocked' || x.payload?.to === 'waiting'));
  return daysSince(a ? a.at : t.updated_at || t.created_at);
}

export function activityLine(a) {
  const who = person(a.actor_id)?.name;
  const title = a.payload?.title || '';
  const st = (id) => STATUS[id]?.label || id;
  let what;
  switch (a.kind) {
    case 'created': what = html`משימה חדשה: <b>${title}</b>`; break;
    case 'status': what = html`<b>${title}</b> ← <span class="st" style=${`--c:${STATUS[a.payload?.to]?.color}`}>${st(a.payload?.to)}</span>`; break;
    case 'assigned': what = html`<b>${title}</b> הוקצתה ל${person(a.payload?.to)?.name || 'מישהו'}`; break;
    case 'comment': what = html`תגובה על <b>${title}</b>: ${a.payload?.body || ''}`; break;
    case 'due': what = html`<b>${title}</b>: יעד ${a.payload?.to ? shortDate(a.payload.to) : 'הוסר'}`; break;
    default: what = title;
  }
  return html`<span class="act-who">${who || 'מערכת'}</span><span class="act-what">${what}</span>`;
}

export function Overview({ s }) {
  const tasks = visibleTasks(s);
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter(isOverdue);
  const stuck = open.filter(isStuck);
  const ws = weekStart();
  const doneWeek = tasks.filter((t) => t.status === 'done' && t.done_at && ymd(new Date(t.done_at)) >= ws);
  const people = team();
  const maxLoad = Math.max(1, ...people.map((p) => open.filter((t) => t.owner_id === p.id).length));
  const projects = s.projects.map((p) => {
    const pt = tasks.filter((t) => t.project_id === p.id);
    return { p, total: pt.length, done: pt.filter((t) => t.status === 'done').length, stuck: pt.filter(isStuck).length, overdue: pt.filter(isOverdue).length };
  });
  const blockers = [...stuck].sort((a, b) => stuckSince(b, s.activity) - stuckSince(a, s.activity)).slice(0, 6);
  const m = me();

  return html`<div class="page overview">
    <header class="page-head">
      <div><p class="eyebrow">${longDate()}</p><h1>${greeting()}${m ? `, ${m.name}` : ''}</h1></div>
      <div class="head-actions">
        <a class="btn" href="#/daily"><${Icon} name="sun" size=${16} />דיילי</a>
        <button type="button" class="btn" onClick=${() => openModal('report')}><${Icon} name="report" size=${16} />דוח שבועי</button>
      </div>
    </header>

    <section class="kpis">
      <button type="button" class="kpi" onClick=${() => navigate('#/team')}><span class="kpi-n">${open.length}</span><span class="kpi-l">משימות פתוחות</span></button>
      <button type="button" class=${'kpi' + (overdue.length ? ' bad' : '')} onClick=${() => navigate('#/blockers')}><span class="kpi-n">${overdue.length}</span><span class="kpi-l">באיחור</span></button>
      <button type="button" class=${'kpi' + (stuck.length ? ' warn' : '')} onClick=${() => navigate('#/blockers')}><span class="kpi-n">${stuck.length}</span><span class="kpi-l">תקועות או ממתינות</span></button>
      <div class="kpi ok"><span class="kpi-n">${doneWeek.length}</span><span class="kpi-l">הושלמו השבוע</span></div>
    </section>

    <div class="ov-grid">
      <section class="card">
        <header class="card-head"><h2>עומס צוות</h2><a href="#/team" class="link">ללוח הצוות</a></header>
        <div class="load-list">
          ${people.map((p) => {
            const mine = open.filter((t) => t.owner_id === p.id);
            const od = mine.filter(isOverdue).length;
            const st = mine.filter(isStuck).length;
            return html`<a class="load-row" href="#/team" key=${p.id}>
              <${Avatar} p=${p} size=${30} />
              <div class="load-main">
                <div class="load-top"><strong>${p.name}</strong><span class="muted">${p.role || ''}</span>
                  <span class="grow"></span>
                  ${od ? html`<span class="badge bad">${od} באיחור</span>` : null}
                  ${st ? html`<span class="badge warn">${st} תקועות</span>` : null}
                  <span class="load-n">${mine.length}</span></div>
                <div class="stack" style=${`width:${Math.max(6, (mine.length / maxLoad) * 100)}%`}>
                  ${STATUSES.filter((x) => x.id !== 'done').map((x) => {
                    const n = mine.filter((t) => t.status === x.id).length;
                    return n ? html`<i style=${`flex:${n};background:${x.color}`} title=${`${x.label}: ${n}`}></i>` : null;
                  })}
                </div>
              </div>
            </a>`;
          })}
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h2>חסמים פתוחים</h2><a href="#/blockers" class="link">לכל החסמים</a></header>
        ${blockers.length ? html`<ul class="mini-list">
          ${blockers.map((t) => {
            const by = person(t.blocked_by_person);
            const d = stuckSince(t, s.activity);
            return html`<li key=${t.id}><button type="button" class="mini-row" onClick=${() => openTask(t.id)}>
              <span class="dot" style=${`background:${STATUS[t.status].color}`}></span>
              <span class="mini-title">${t.title}</span>
              <span class="mini-meta">${person(t.owner_id)?.name || ''}${by ? ` · מחכה ל${by.name}` : t.blocked_reason ? ` · ${t.blocked_reason}` : ''}</span>
              <span class=${'days' + (d >= 2 ? ' bad' : '')}>${d === 0 ? 'היום' : `${d} ימים`}</span>
            </button></li>`;
          })}
        </ul>` : html`<${Empty} title="אין חסמים פתוחים" icon="check">כשמישהו יסמן משימה כתקועה, היא תופיע כאן.<//>`}
      </section>

      <section class="card span-2">
        <header class="card-head"><h2>פרויקטים</h2><a href="#/projects" class="link">לכל הפרויקטים</a></header>
        ${projects.length ? html`<div class="proj-table">
          ${projects.map(({ p, total, done, stuck: st, overdue: od }) => html`<a class="proj-row" href=${'#/project/' + p.id} key=${p.id}>
            <span class="proj-name"><i style=${`background:${p.color || 'var(--accent)'}`}></i>${p.name}</span>
            <${HealthPill} p=${p} />
            <span class="proj-prog"><${Progress} value=${done} total=${total} /><span class="muted">${done}/${total}</span></span>
            <span class="proj-flags">${od ? html`<span class="badge bad">${od} באיחור</span>` : null}${st ? html`<span class="badge warn">${st} תקועות</span>` : null}</span>
            <span class="proj-note muted">${p.health_note || ''}</span>
            <span class="proj-date muted">${p.target_date ? `יעד ${shortDate(p.target_date)}` : ''}</span>
          </a>`)}
        </div>` : html`<${Empty} title="אין עדיין פרויקטים" icon="folder">צרו פרויקט ראשון בעמוד הפרויקטים.<//>`}
      </section>

      <section class="card span-2">
        <header class="card-head"><h2>מה קרה לאחרונה</h2></header>
        ${s.activity.length ? html`<ul class="activity">
          ${s.activity.filter((a) => !a.task_id || s.tasks.some((t) => t.id === a.task_id)).slice(0, 12).map((a) => html`<li key=${a.id}>
            <button type="button" class="act-row" onClick=${() => a.task_id && openTask(a.task_id)}>
              ${activityLine(a)}<span class="act-time">${timeAgo(a.at)}</span>
            </button></li>`)}
        </ul>` : html`<${Empty} title="עוד אין פעילות" icon="clock" />`}
      </section>
    </div>
  </div>`;
}

