// "יומן": the week from Google Calendar, with what the platform set up marked, and the Gantt of every project.
import { useState } from 'preact/hooks';
import { html, Icon, Seg, Faces, hm } from '../ui.js';
import { MeetingAsk } from '../parts.js';
import { Gantt } from './gantt.js';
import { useStore, myProjects, myMeetingAsks, project } from '../store.js';

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const H0 = 8;
const H1 = 18;

export function Calendar() {
  const s = useStore();
  const [view, setView] = useState(s.gcal ? 'week' : 'gantt');
  const [open, setOpen] = useState(null);
  const sun = new Date(); sun.setHours(0, 0, 0, 0); sun.setDate(sun.getDate() - sun.getDay());
  const days = [0, 1, 2, 3, 4].map((i) => new Date(sun.getTime() + i * 864e5));
  const meets = myMeetingAsks();
  const mine = myProjects();
  const from = mine.length ? new Date(Math.min(...mine.map((p) => new Date(p.start)))).toISOString() : new Date().toISOString();
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  const ev = open && s.events.find((e) => e.id === open);
  return html`<div class="page">
    <header class="page-head"><div><h1>יומן וגאנט</h1><p class="sub">${s.gcal ? html`<span class="gsync"><span class="gdot"></span>מסונכרן עם Google Calendar</span> פגישות שנקבעו כאן נכנסות ליומן לבד, ואחריהן מגיע סיכום` : 'Google Calendar עוד לא מחובר, אז השבוע ריק. הגאנט כבר מחושב מאבני הדרך של הפרויקטים'}</p></div>
      <${Seg} value=${view} onChange=${setView} label="תצוגה" options=${[{ id: 'week', label: 'שבוע' }, { id: 'gantt', label: 'גאנט' }]} /></header>
    ${view === 'week' ? html`<div class="cal-wrap">
      <div class="card cal">
        <div class="cal-head"><span></span>${days.map((d) => html`<span class=${d.toDateString() === new Date().toDateString() ? 'today' : ''}>${DAYS[d.getDay()]} <b>${d.getDate()}</b></span>`)}</div>
        <div class="cal-body" style=${`--rows:${H1 - H0}`}>
          <div class="cal-hours">${Array.from({ length: H1 - H0 }, (_, i) => html`<span>${H0 + i}:00</span>`)}</div>
          ${days.map((d) => {
            const list = s.events.filter((e) => new Date(e.start).toDateString() === d.toDateString());
            const isToday = d.toDateString() === new Date().toDateString();
            return html`<div class="cal-day">
              ${isToday && nowH > H0 && nowH < H1 ? html`<span class="cal-now" style=${`top:${((nowH - H0) / (H1 - H0)) * 100}%`}></span>` : null}
              ${list.map((e) => {
                const st = new Date(e.start); const hh = st.getHours() + st.getMinutes() / 60;
                const c = e.project ? project(e.project).color : 'var(--s-todo)';
                return html`<button type="button" class=${'cal-ev' + (e.src === 'here' ? ' here' : '') + (e.fresh ? ' fresh' : '')}
                  style=${`top:${((hh - H0) / (H1 - H0)) * 100}%;height:${Math.max(7, (e.mins / 60 / (H1 - H0)) * 100)}%;--c:${c}`} onClick=${() => setOpen(e.id)}>
                  <strong>${e.title}</strong><span>${hm(e.start)}${e.src === 'here' ? ' · מהפלטפורמה' : ''}</span></button>`;
              })}
            </div>`;
          })}
        </div>
      </div>
      <aside class="col-side">
        ${ev ? html`<section class="card side-card evdetail" style=${`--c:${ev.project ? project(ev.project).color : 'var(--s-todo)'}`}>
          <div class="sec-head"><h2>${ev.title}</h2><button type="button" class="icon-btn sm" aria-label="סגירה" onClick=${() => setOpen(null)}><${Icon} name="x" size=${14} /></button></div>
          <p class="muted">${new Date(ev.start).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' })}, ${hm(ev.start)} · ${ev.mins} דק׳</p>
          ${ev.project ? html`<p>פרויקט: <a href=${`#/project/${ev.project}`}>${project(ev.project).name}</a></p>` : null}
          ${ev.with?.length ? html`<p class="row-gap"><${Faces} ids=${ev.with} size=${24} /></p>` : null}
          ${ev.summaryText ? html`<div class="sumbox"><strong><${Icon} name="sparkle" size=${14} /> סיכום אוטומטי</strong><p>${ev.summaryText}</p></div>`
            : ev.summary ? html`<p class="muted small"><${Icon} name="sparkle" size=${13} /> Claude יסכם את הפגישה ויפתח מטלות לפי מה שהוחלט</p>` : null}
        </section>` : null}
        ${meets.length ? html`<section class="card side-card"><div class="sec-head"><h2>פגישות לקבוע</h2><span class="muted small">Claude מצא זמנים פנויים</span></div>
          ${meets.map((m) => html`<${MeetingAsk} key=${m.id} m=${m} />`)}</section>` : null}
        <section class="card side-card"><div class="sec-head"><h2>מקרא</h2></div>
          <div class="legend"><span><i class="lg here"></i>נקבע מהפלטפורמה</span><span><i class="lg"></i>מ-Google Calendar</span></div>
          <div class="legend">${mine.map((p) => html`<span><i class="lg" style=${`background:${p.color}`}></i>${p.name}</span>`)}</div>
        </section>
      </aside>
    </div>` : html`<div class="card"><${Gantt} projects=${mine} from=${from} days=${40} /></div>`}
  </div>`;
}
