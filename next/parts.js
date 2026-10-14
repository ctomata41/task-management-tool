// Cards that appear on several screens: a decision, a human step Claude waits on, an output, a running Claude, a meeting.
import { useState } from 'preact/hooks';
import { html, Icon, Avatar, Faces, ClaudeMark, Bar, ProjectTag, OUT_KIND, HTYPE, ago, dueWord, when, hm, dayWord } from './ui.js';
import {
  decide, completeHuman, bookMeeting, approveOutput, seeOutput, agent, person, project, stopAgent, resumeAgent, waitingOn, hoursLabel, openSheet,
} from './store.js';

export function DecisionCard({ d, compact }) {
  const [pick, setPick] = useState(null);
  const a = d.agent ? agent(d.agent) : null;
  const late = new Date(d.due) < new Date();
  if (d.choice) {
    return html`<div class="dcard2 done"><${Icon} name="check" size=${16} /><span><b>${d.q}</b> ${d.choice}</span></div>`;
  }
  return html`<article class="dcard2" style=${`--bar:${project(d.project).color}`}>
    <header class="dc2-head">
      <${ProjectTag} id=${d.project} />
      <span class=${'due2' + (late ? ' late' : '')}>${dueWord(d.due)}</span>
    </header>
    <h3 class="dc2-q">${d.q}</h3>
    <p class="dc2-why"><${Icon} name="bolt" size=${14} />משחרר: ${d.unblocks}${a && a.state === 'wait' ? html` <span class="muted">· Claude עצר ומחכה</span>` : null}</p>
    <div class=${'dc2-opts' + (compact ? ' compact' : '')}>
      ${d.options.map((o) => html`<button type="button" class=${'dc2-opt' + (o.id === d.rec ? ' rec' : '') + (pick === o.id ? ' sel' : '')}
        onClick=${() => { if (pick === o.id) decide(d.id, o.id); else setPick(o.id); }}>
        <span class="dc2-opt-l">${o.label}${o.id === d.rec ? html`<em>המלצת Claude</em>` : null}</span>
        <span class="dc2-opt-w">${o.why}</span>
        ${pick === o.id ? html`<span class="dc2-confirm">נגיעה נוספת לאישור</span>` : null}
      </button>`)}
    </div>
  </article>`;
}

export function HumanTaskRow({ t }) {
  const a = t.blocks ? agent(t.blocks) : null;
  const ty = HTYPE[t.type];
  const age = Date.now() - new Date(t.created).getTime();
  return html`<div class="hrow" style=${`--bar:${project(t.project).color}`}>
    <span class="hrow-ic"><${Icon} name=${ty.icon} size=${18} /></span>
    <div class="hrow-main">
      <strong>${t.title}</strong>
      <span class="hrow-meta">
        <${ProjectTag} id=${t.project} />
        ${a ? html`<span class="stops"><${ClaudeMark} size=${16} /> עוצר את "${a.title}"</span>` : t.note ? html`<span class="muted">${t.note}</span>` : null}
        <span class=${'age2' + (age > 864e5 ? ' old' : '')}>${hoursLabel(age)}</span>
      </span>
    </div>
    <button type="button" class="btn btn-primary sm" onClick=${() => completeHuman(t.id)}>${t.cta}</button>
  </div>`;
}

export function OutputCard({ o, wide }) {
  const k = OUT_KIND[o.kind] || OUT_KIND.doc;
  const p = project(o.project);
  return html`<article class=${'ocard' + (wide ? ' wide' : '') + (o.fresh ? ' fresh' : '')}>
    <a class="ocard-thumb" href=${o.url} target=${o.url.startsWith('http') ? '_blank' : null} rel="noopener" onClick=${(e) => { seeOutput(o.id); if (!o.url.startsWith('http')) { e.preventDefault(); openSheet('output', { id: o.id }); } }}
      style=${`--c:${k.color}`}>
      <span class="ocard-glyph"><${Icon} name=${k.icon} size=${28} /></span>
      ${o.duration ? html`<span class="ocard-dur">${o.duration}</span>` : null}
      ${o.fresh ? html`<span class="ocard-new">חדש</span>` : null}
    </a>
    <div class="ocard-body">
      <span class="ocard-kind" style=${`--c:${k.color}`}>${k.label} · ${p.name}</span>
      <h3>${o.title}</h3>
      <p>${o.summary}</p>
      <footer>
        <span class="muted small"><${ClaudeMark} size=${14} /> ${ago(o.at)}</span>
        ${o.review ? html`<button type="button" class="btn sm btn-primary" onClick=${() => approveOutput(o.id)}>אישור</button>`
          : o.approved ? html`<span class="ok-chip"><${Icon} name="check" size=${13} />אושר</span>`
          : html`<a class="btn sm" href=${o.url} target="_blank" rel="noopener" onClick=${(e) => { seeOutput(o.id); if (!o.url.startsWith('http')) { e.preventDefault(); openSheet('output', { id: o.id }); } }}>פתיחה<${Icon} name="external" size=${13} /></a>`}
      </footer>
    </div>
  </article>`;
}

const STATE = {
  run: { label: 'עובד', c: 'var(--s-done)' },
  wait: { label: 'מחכה לאדם', c: 'var(--s-blocked)' },
  review: { label: 'מוכן לבדיקה', c: 'var(--s-review)' },
  done: { label: 'הסתיים', c: 'var(--s-todo)' },
};
export function AgentRow({ a, showProject = true }) {
  const st = STATE[a.state];
  return html`<div class=${'arow ' + a.state}>
    <${ClaudeMark} size=${30} live=${a.state === 'run'} />
    <div class="arow-main">
      <div class="arow-top"><strong>${a.title}</strong><span class="spill" style=${`--c:${st.c}`}>${a.state === 'wait' ? `מחכה ל${waitingOn(a)}` : st.label}</span></div>
      <div class="arow-step">${showProject ? html`<${ProjectTag} id=${a.project} />` : null}<span>${a.step}</span></div>
      ${a.state !== 'done' ? html`<${Bar} value=${a.progress} color=${st.c} />` : null}
    </div>
    ${a.state === 'run' ? html`<button type="button" class="icon-btn sm" aria-label="עצירה" title="עצירה" onClick=${() => stopAgent(a.id)}><${Icon} name="pause" size=${15} /></button>`
      : a.state === 'wait' && a.step === 'נעצר ביד אדם' ? html`<button type="button" class="icon-btn sm" aria-label="המשך" title="המשך" onClick=${() => resumeAgent(a.id)}><${Icon} name="play" size=${15} /></button>` : null}
  </div>`;
}

export function MeetingAsk({ m }) {
  return html`<div class="mask" style=${`--bar:${project(m.project).color}`}>
    <div class="mask-top">
      <span class="hrow-ic"><${Icon} name="calendar" size=${18} /></span>
      <div class="grow"><strong>${m.title}</strong><span class="muted small">${m.mins} דק׳ · ${m.why}</span></div>
      <${Faces} ids=${m.with} size=${22} />
    </div>
    <div class="slots"><span class="muted small">פנוי לכולם:</span>
      ${m.slots.map((s) => html`<button type="button" class="slot" onClick=${() => bookMeeting(m.id, s)}>${dayWord(s)} ${hm(s)}</button>`)}
    </div>
  </div>`;
}

export function EventRow({ e }) {
  const end = new Date(new Date(e.start).getTime() + e.mins * 60e3).toISOString();
  const past = new Date(end) < new Date();
  const nowOn = !past && new Date(e.start) <= new Date();
  return html`<div class=${'evrow' + (past ? ' past' : '') + (nowOn ? ' now' : '')} style=${`--c:${e.project ? project(e.project).color : 'var(--s-todo)'}`}>
    <span class="evrow-t">${hm(e.start)}</span>
    <i></i>
    <div class="grow"><strong>${e.title}</strong>
      <span class="muted small">${e.mins} דק׳${e.src === 'here' ? ' · נקבע מהפלטפורמה' : ''}${e.summary ? ' · סיכום אוטומטי' : ''}</span></div>
    ${nowOn ? html`<span class="spill" style="--c:var(--s-blocked)">עכשיו</span>` : null}
  </div>`;
}

export { when };
