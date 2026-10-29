// A Gantt of milestones, with a line for today. Bars that are done turn solid; the current one shows Claude's progress.
import { html, Icon } from '../ui.js';
import { project, projectProgress } from '../store.js';

const DAY = 864e5;
export function Gantt({ projects, from, days = 35 }) {
  const t0 = new Date(from); t0.setHours(0, 0, 0, 0);
  const span = days * DAY;
  const pos = (iso) => Math.max(0, Math.min(100, ((new Date(iso) - t0) / span) * 100));
  const ticks = [];
  for (let d = 0; d < days; d += 7) ticks.push(new Date(t0.getTime() + d * DAY));
  const todayX = pos(new Date().toISOString());
  return html`<div class="gantt" role="table" aria-label="גאנט">
    <div class="g-row g-head"><span class="g-name"></span><div class="g-track">
      ${ticks.map((d) => html`<span class="g-tick" style=${`inset-inline-start:${pos(d.toISOString())}%`}>${d.getDate()}/${d.getMonth() + 1}</span>`)}
    </div></div>
    ${projects.map((p) => html`<div class="g-group">
      <div class="g-row g-proj"><a class="g-name" href=${`#/project/${p.id}`}><i style=${`background:${p.color}`}></i>${p.name}</a>
        <div class="g-track"><span class="g-span" style=${`inset-inline-start:${pos(p.start)}%;width:${pos(p.end) - pos(p.start)}%;--c:${p.color}`}>
          <i style=${`width:${Math.round(projectProgress(p) * 100)}%`}></i></span>
          <span class="g-today" style=${`inset-inline-start:${todayX}%`}></span></div></div>
      ${p.milestones.map((m) => {
        const cur = !m.done && new Date(m.start) <= new Date() && new Date(m.end) >= new Date();
        return html`<div class="g-row"><span class="g-name g-ms">${m.done ? html`<${Icon} name="check" size=${13} />` : null}${m.title}</span>
          <div class="g-track"><span class=${'g-bar' + (m.done ? ' done' : '') + (cur ? ' cur' : '')}
            style=${`inset-inline-start:${pos(m.start)}%;width:${Math.max(1.2, pos(m.end) - pos(m.start))}%;--c:${p.color}`}></span>
            <span class="g-today" style=${`inset-inline-start:${todayX}%`}></span></div></div>`;
      })}
    </div>`)}
  </div>`;
}
export { project };
