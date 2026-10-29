// "תמונת מצב": the team view (spec, round 3). One line per project and only what is significant, each with why it rose.
// Figures are for the whole team: the tool never counts or compares per person.
import { visibleTasks, team, openModal } from '../store.js';
import { html, Icon, Empty, navigate } from '../ui.js';
import { RiseList, ProjectLines } from './command.js';
import { openDecisions, significant, liveProjects, isAgent, isMember, canSee, median } from '../model.js';
import { activityLine, openActivity, visibleActivity } from '../activity.js';
import { weekStart, ymd, longDate, timeAgo } from '../util.js';

export function Overview({ s }) {
  const tasks = visibleTasks(s).filter((t) => canSee(t, s));
  const open = tasks.filter((t) => t.status !== 'done');
  const review = open.filter((t) => t.status === 'review').length;
  const ws = weekStart();
  const doneWeek = tasks.filter((t) => t.status === 'done' && t.done_at && ymd(new Date(t.done_at)) >= ws).length;
  const rose = significant(s);
  const decisions = openDecisions(s).length;
  const health = { off_track: 0, at_risk: 1, on_track: 2 };
  const projects = liveProjects(s).sort((a, b) => (a.stage === 'proposed' ? -1 : 0) - (b.stage === 'proposed' ? -1 : 0) || (health[a.health] ?? 3) - (health[b.health] ?? 3));
  // Projects in motion: how many active projects each team member leads or partners in, shown only as the team's median.
  const active = projects.filter((p) => (p.stage || 'active') === 'active');
  const inMotion = median(team().filter((p) => !isAgent(p)).map((p) => active.filter((x) => isMember(x, p.id)).length));
  const recent = visibleActivity(s.activity).slice(0, 12);
  return html`<div class="page overview">
    <header class="page-head">
      <div><p class="eyebrow">${longDate()}</p><h1>תמונת מצב</h1>
        <p class="sub">שורה לכל פרויקט, ורק מה שמשמעותי. החלטה, חסם או בדיקה שמחכים יותר משני ימי עבודה עולים לכאן.</p></div>
      <div class="head-actions">
        <a class="btn" href="#/weekly"><${Icon} name="calendar" size=${16} />פגישה שבועית</a>
        <button type="button" class="btn" onClick=${() => openModal('report')}><${Icon} name="report" size=${16} />דוח שבועי</button>
      </div>
    </header>

    <section class="kpis">
      <button type="button" class="kpi" onClick=${() => navigate('#/decisions')}><span class="kpi-n">${decisions}</span><span class="kpi-l">החלטות פתוחות</span></button>
      <div class=${'kpi' + (rose.length ? ' warn' : '')}><span class="kpi-n">${rose.length}</span><span class="kpi-l">עלו לצוות</span></div>
      <div class="kpi"><span class="kpi-n">${review}</span><span class="kpi-l">מחכות לבדיקה</span></div>
      <div class="kpi ok"><span class="kpi-n">${doneWeek}</span><span class="kpi-l">הושלמו השבוע</span></div>
      <div class="kpi" title="כמה פרויקטים פעילים כל אחד מוביל או שותף בהם, כחציון של הצוות"><span class="kpi-n">${Number.isInteger(inMotion) ? inMotion : inMotion.toFixed(1)}</span><span class="kpi-l">פרויקטים בתנועה לאדם (חציון)</span></div>
    </section>

    <section class="card">
      <header class="card-head"><h2>מה עלה</h2><span class="muted small">רק מה שמחכה יותר משני ימי עבודה, באיחור מול גורם חיצוני, או בסיכון</span></header>
      <${RiseList} items=${rose} empty="שום דבר לא עלה. הכל זורם אצל המובילים." />
    </section>

    <section class="card">
      <header class="card-head"><h2>הפרויקטים</h2><a href="#/projects" class="link">לכל הפרויקטים</a></header>
      ${projects.length ? html`<${ProjectLines} projects=${projects} />` : html`<${Empty} title="אין פרויקטים פעילים" icon="folder">פותחים פרויקט בעמוד הפרויקטים.<//>`}
    </section>

    <section class="card">
      <header class="card-head"><h2>מה קרה לאחרונה</h2></header>
      ${recent.length ? html`<ul class="activity">
        ${recent.map((a) => html`<li key=${a.id}><button type="button" class="act-row" onClick=${() => openActivity(a)}>
          ${activityLine(a)}<span class="act-time">${timeAgo(a.at)}</span></button></li>`)}
      </ul>` : html`<${Empty} title="עוד אין פעילות" icon="clock" />`}
    </section>
  </div>`;
}
