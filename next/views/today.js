// "היום": what needs this person now, and what Claude did while they were away. Nothing here is typed in by hand:
// every line comes from what the Claude sessions reported, from the calendar, or from a decision someone made.
import { useState } from 'preact/hooks';
import { html, Icon, ClaudeMark, Ring } from '../ui.js';
import { DecisionCard, HumanTaskRow, OutputCard, AgentRow, MeetingAsk, EventRow, OutputActions, Presence } from '../parts.js';
import { OUT_KIND } from '../ui.js';
import {
  useStore, person, myDecisions, myHumanTasks, myMeetingAsks, myOutputs, myAgents, myProjects, bottlenecks, project, hoursLabel, openSheet,
  requestChanges, approveOutput, closeSheet,
} from '../store.js';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
}

export function Today() {
  const s = useStore();
  const me = person(s.me);
  const decs = myDecisions();
  const tasks = myHumanTasks();
  const meets = myMeetingAsks();
  const outs = myOutputs().slice().sort((a, b) => (b.fresh - a.fresh) || b.at.localeCompare(a.at));
  const fresh = outs.filter((o) => o.fresh);
  const ags = myAgents();
  const running = ags.filter((a) => a.state === 'run');
  const ivLeft = Object.entries(s.interviews).map(([pid, iv]) => [pid, iv.questions.filter((q) => !(s.answers[pid] || {})[q.id]).length]).filter(([, n]) => n);
  const waiting = ags.filter((a) => a.state === 'wait');
  const blocking = tasks.filter((t) => t.blocks).length + decs.filter((d) => d.agent).length;
  const todayEv = s.events.filter((e) => new Date(e.start).toDateString() === new Date().toDateString()).sort((a, b) => a.start.localeCompare(b.start));
  const bn = bottlenecks().slice(0, 3);
  const asks = decs.length + tasks.length + meets.length;
  const mins = decs.length * 3 + tasks.length * 4 + meets.length;

  return html`<div class="page today">
    <header class="hero">
      <div class="hero-text">
        <p class="eyebrow">${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>${greeting()}, ${me.name}</h1>
        <p class="brief"><${ClaudeMark} size=${20} /><span>
          ${fresh.length ? html`Claude סיים <b>${fresh.length} תוצרים</b> מאז שהיית כאן. ` : null}
          ${running.length ? html`<b>${running.length} סוכנים</b> עובדים עכשיו${waiting.length ? html`, ו-<b class="bad">${waiting.length}</b> מחכים לאנשים` : null}. ` : null}
          ${asks ? html`<b>${asks} דברים</b> מחכים לך, בערך ${mins} דקות.` : 'אין כרגע שום דבר שמחכה לך.'}
        </span></p>
      </div>
      <div class="hero-stats">
        <button type="button" class="hstat" onClick=${() => document.getElementById('sec-unblock')?.scrollIntoView({ behavior: 'smooth' })}>
          <b class=${blocking ? 'bad' : ''}>${blocking}</b><span>עוצרים את Claude</span></button>
        <button type="button" class="hstat" onClick=${() => document.getElementById('sec-decide')?.scrollIntoView({ behavior: 'smooth' })}>
          <b>${decs.length}</b><span>החלטות</span></button>
        <button type="button" class="hstat" onClick=${() => document.getElementById('sec-out')?.scrollIntoView({ behavior: 'smooth' })}>
          <b>${fresh.length}</b><span>תוצרים חדשים</span></button>
      </div>
    </header>

    <div class="today-grid">
      <div class="col-main">
        ${tasks.length ? html`<section id="sec-unblock" class="sec">
          <div class="sec-head"><h2>Claude מחכה לך</h2><span class="muted small">דברים שרק אדם יכול לעשות</span></div>
          <div class="group">${tasks.map((t) => html`<${HumanTaskRow} key=${t.id} t=${t} />`)}</div>
        </section>` : null}

        <section id="sec-decide" class="sec">
          <div class="sec-head"><h2>להחליט</h2><span class="muted small">Claude הכין אפשרויות והמלצה</span></div>
          ${decs.length ? html`<div class="dgrid">${decs.map((d) => html`<${DecisionCard} key=${d.id} d=${d} />`)}</div>`
            : html`<div class="empty2"><${Icon} name="check" size=${22} />כל ההחלטות שלך התקבלו</div>`}
        </section>

        <section id="sec-out" class="sec">
          <div class="sec-head"><h2>תוצרים</h2><a class="link" href="#/outputs">הכל</a></div>
          ${outs.length ? html`<div class="ostrip">${outs.slice(0, 6).map((o) => html`<${OutputCard} key=${o.id} o=${o} />`)}</div>`
            : html`<div class="empty2 quiet"><${ClaudeMark} size=${22} />${s.connector.ready ? 'תוצרים יופיעו כאן לבד כש-Claude יעלה אותם דרך המחבר' : 'תוצרים יופיעו כאן לבד אחרי שהחיבור ל-Claude יופעל'}</div>`}
        </section>

        <section class="sec">
          <div class="sec-head"><h2>הסוכנים שלך</h2><span class="muted small">מתעדכן לבד</span></div>
          ${ags.some((a) => a.state !== 'done') ? html`<div class="group">${ags.filter((a) => a.state !== 'done').map((a) => html`<${AgentRow} key=${a.id} a=${a} />`)}</div>`
            : html`<div class="empty2 quiet"><${ClaudeMark} size=${22} />אין סשנים פעילים. <button type="button" class="link" onClick=${() => openSheet('claude')}>להפעיל את Claude</button></div>`}
        </section>
      </div>

      <aside class="col-side">
        ${s.gcal ? html`<section class="card side-card">
          <div class="sec-head"><h2>היום ביומן</h2><span class="gsync"><span class="gdot"></span>Google</span></div>
          <div class="evlist">${todayEv.map((e) => html`<${EventRow} key=${e.id} e=${e} />`)}</div>
          <a class="link" href="#/calendar">כל השבוע</a>
        </section>` : null}
        ${meets.length ? html`<section class="card side-card">
          <div class="sec-head"><h2>פגישות לקבוע</h2></div>
          ${meets.map((m) => html`<${MeetingAsk} key=${m.id} m=${m} />`)}
        </section>` : null}
        <section class="card side-card">
          <div class="sec-head"><h2>מי מחובר ל-Claude</h2><button type="button" class="link" onClick=${() => openSheet('connect')}>חיבור</button></div>
          <${Presence} compact />
        </section>
        <section class="card side-card">
          <div class="sec-head"><h2>צווארי בקבוק</h2><a class="link" href="#/insights">ניתוח</a></div>
          ${bn.length ? bn.map((b, i) => html`<div class="bn-row" key=${b.id}>
            <span class="bn-n">${i + 1}</span>
            <div class="grow"><strong>${b.title}</strong>
              <span class="muted small">${person(b.owner).name} · ${project(b.project).name} · ${hoursLabel(Date.now() - new Date(b.since).getTime())}${b.stops ? ' · עוצר סוכן' : ''}</span></div>
          </div>`) : html`<p class="muted">אין צווארי בקבוק כרגע</p>`}
        </section>
        ${ivLeft.length ? html`<button type="button" class="card iv-promo" onClick=${() => { location.hash = `#/interview/${ivLeft[0][0]}`; }}>
          <${ClaudeMark} size=${34} />
          <div class="grow"><strong>Claude רוצה להתייעץ</strong><span class="muted small">${ivLeft[0][1]} שאלות על ${project(ivLeft[0][0]).name}, בערך ${Math.max(1, Math.round(ivLeft[0][1] * 0.7))} דקות</span></div>
          <${Icon} name="chevronLeft" />
        </button>` : null}
        ${s.mode === 'live' && !s.connector.enabled ? html`<button type="button" class="card iv-promo" onClick=${() => openSheet('connect')}>
          <span class="hrow-ic"><${Icon} name="plug" size=${20} /></span>
          <div class="grow"><strong>חיבור ל-Claude</strong><span class="muted small">${s.connector.ready ? 'מוכן, ומחכה להפעלה לצוות' : 'עוד לא הותקן'}. כאן רואים איך זה עובד</span></div>
          <${Icon} name="chevronLeft" />
        </button>` : null}
      </aside>
    </div>
  </div>`;
}

// Every output in the person's projects, filtered by project and by kind, and grouped by project when showing all.
export function Outputs() {
  useStore();
  const [pid, setPid] = useState('all');
  const [kind, setKind] = useState('all');
  const all = myOutputs().slice().sort((a, b) => b.at.localeCompare(a.at));
  const projects = myProjects().filter((p) => all.some((o) => o.project === p.id));
  const kinds = Object.keys(OUT_KIND).filter((k) => all.some((o) => (OUT_KIND[o.kind] ? o.kind : 'other') === k));
  const outs = all.filter((o) => (pid === 'all' || o.project === pid) && (kind === 'all' || (OUT_KIND[o.kind] ? o.kind : 'other') === kind));
  const groups = pid === 'all' ? projects.map((p) => [p, outs.filter((o) => o.project === p.id)]).filter(([, xs]) => xs.length) : [[project(pid), outs]];
  const chip = (on, c, label, n, click, icon) => html`<button type="button" class=${'tp' + (on ? ' on' : '')} style=${`--c:${c}`} aria-pressed=${on} onClick=${click}>${icon ? html`<${Icon} name=${icon} size=${15} />` : null}${label}${n != null ? html`<span class="tp-n">${n}</span>` : null}</button>`;
  return html`<div class="page">
    <header class="page-head"><div><h1>תוצרים</h1><p class="sub">כל מה ש-Claude הפיק בפרויקטים שלך, עם קישור שנפתח, לפי פרויקט ולפי סוג</p></div></header>
    <div class="ofilters">
      <div class="tool-pick" role="group" aria-label="פרויקט">
        ${chip(pid === 'all', 'var(--accent)', 'כל הפרויקטים', all.length, () => setPid('all'))}
        ${projects.map((p) => chip(pid === p.id, p.color, p.name, all.filter((o) => o.project === p.id).length, () => setPid(p.id)))}
      </div>
      <div class="tool-pick" role="group" aria-label="סוג">
        ${chip(kind === 'all', 'var(--accent)', 'כל הסוגים', null, () => setKind('all'))}
        ${kinds.map((k) => chip(kind === k, OUT_KIND[k].color, OUT_KIND[k].label, null, () => setKind(k), OUT_KIND[k].icon))}
      </div>
    </div>
    ${outs.length ? groups.map(([p, xs]) => html`<section class="sec" key=${p.id}>
      ${pid === 'all' ? html`<div class="sec-head"><h2><i class="pdot" style=${`background:${p.color}`}></i> ${p.name}</h2><span class="muted small">${xs.length} תוצרים</span></div>` : null}
      <div class="ogrid">${xs.map((o) => html`<${OutputCard} key=${o.id} o=${o} wide />`)}</div></section>`)
      : html`<div class="empty2 quiet"><${ClaudeMark} size=${22} />${all.length ? 'אין תוצרים שמתאימים לסינון' : 'עוד אין תוצרים. הם יופיעו כאן לבד כש-Claude יעלה אותם דרך המחבר'}</div>`}
  </div>`;
}

export function OutputSheetBody({ id }) {
  const s = useStore();
  const [note, setNote] = useState('');
  const o = s.outputs.find((x) => x.id === id);
  if (!o) return null;
  return html`<div class="osheet">
    <${OutputCard} o=${o} wide />
    <${OutputActions} o=${o} />
    ${o.feedback ? html`<p class="sumbox"><strong>ההערות שנשלחו</strong> ${o.feedback}</p>` : null}
    ${o.review && s.mode === 'live' ? html`<label class="lbl" for="o-note">מה לשנות</label>
      <textarea id="o-note" class="input area" rows="3" placeholder="מה לתקן, להוסיף או להוריד" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" disabled=${!note.trim()} onClick=${() => { requestChanges(o.id, note.trim()); closeSheet(); }}><${Icon} name="send" size=${15} />שליחה ל-Claude</button>
        <button type="button" class="btn" onClick=${() => { approveOutput(o.id); closeSheet(); }}><${Icon} name="check" size=${15} />אישור כמו שזה</button>
      </div>
      <p class="muted small">Claude מקבל את ההערות בפעם הבאה שהסשן בודק מה השתנה, וממשיך לעבוד עליהן.</p>` : null}
    ${s.mode === 'demo' ? html`<p class="muted small">בפלטפורמה האמיתית התוצר נפתח כאן ישירות: סרטון מתנגן, מסמך נקרא, ואפליקציה נפתחת בתצוגה מקדימה.</p>` : null}
    <div class="form-actions">
      <button type="button" class="btn" onClick=${() => openSheet('launch', { project: o.project, tool: 'doc', title: `שיפור: ${o.title}` })}><${Icon} name="edit" size=${15} />לבקש שינוי מ-Claude</button>
      <button type="button" class="btn" onClick=${() => openSheet('launch', { project: o.project, tool: 'deck', title: `מצגת מתוך: ${o.title}` })}><${Icon} name="grid" size=${15} />להפוך למצגת</button>
    </div>
  </div>`;
}
