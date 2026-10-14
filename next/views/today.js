// "היום": what needs this person now, and what Claude did while they were away. Nothing here is typed in by hand:
// every line comes from what the Claude sessions reported, from the calendar, or from a decision someone made.
import { html, Icon, ClaudeMark, Ring } from '../ui.js';
import { DecisionCard, HumanTaskRow, OutputCard, AgentRow, MeetingAsk, EventRow } from '../parts.js';
import {
  useStore, person, myDecisions, myHumanTasks, myMeetingAsks, myOutputs, myAgents, bottlenecks, project, hoursLabel, openSheet,
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
          <div class="ostrip">${outs.slice(0, 6).map((o) => html`<${OutputCard} key=${o.id} o=${o} />`)}</div>
        </section>

        <section class="sec">
          <div class="sec-head"><h2>הסוכנים שלך</h2><span class="muted small">מתעדכן לבד</span></div>
          <div class="group">${ags.filter((a) => a.state !== 'done').map((a) => html`<${AgentRow} key=${a.id} a=${a} />`)}</div>
        </section>
      </div>

      <aside class="col-side">
        <section class="card side-card">
          <div class="sec-head"><h2>היום ביומן</h2><span class="gsync"><span class="gdot"></span>Google</span></div>
          <div class="evlist">${todayEv.map((e) => html`<${EventRow} key=${e.id} e=${e} />`)}</div>
          <a class="link" href="#/calendar">כל השבוע</a>
        </section>
        ${meets.length ? html`<section class="card side-card">
          <div class="sec-head"><h2>פגישות לקבוע</h2></div>
          ${meets.map((m) => html`<${MeetingAsk} key=${m.id} m=${m} />`)}
        </section>` : null}
        <section class="card side-card">
          <div class="sec-head"><h2>צווארי בקבוק</h2><a class="link" href="#/insights">ניתוח</a></div>
          ${bn.length ? bn.map((b, i) => html`<div class="bn-row">
            <span class="bn-n">${i + 1}</span>
            <div class="grow"><strong>${b.title}</strong>
              <span class="muted small">${person(b.owner).name} · ${project(b.project).name} · ${hoursLabel(Date.now() - new Date(b.since).getTime())}${b.stops ? ' · עוצר סוכן' : ''}</span></div>
          </div>`) : html`<p class="muted">אין צווארי בקבוק כרגע</p>`}
        </section>
        <button type="button" class="card iv-promo" onClick=${() => { location.hash = '#/interview'; }}>
          <${ClaudeMark} size=${34} />
          <div class="grow"><strong>Claude רוצה להתייעץ</strong><span class="muted small">3 שאלות על פלטפורמת הצוות, בערך 2 דקות</span></div>
          <${Icon} name="chevronLeft" />
        </button>
      </aside>
    </div>
  </div>`;
}

export function Outputs() {
  const outs = myOutputs().slice().sort((a, b) => b.at.localeCompare(a.at));
  useStore();
  return html`<div class="page">
    <header class="page-head"><div><h1>תוצרים</h1><p class="sub">כל מה ש-Claude הפיק בפרויקטים שלך, מסודר ועם קישורים, במקום לחפש בצ׳אט ישן</p></div></header>
    <div class="ogrid">${outs.map((o) => html`<${OutputCard} key=${o.id} o=${o} wide />`)}</div>
  </div>`;
}

export function OutputSheetBody({ id }) {
  const s = useStore();
  const o = s.outputs.find((x) => x.id === id);
  if (!o) return null;
  return html`<div class="osheet">
    <${OutputCard} o=${o} wide />
    <p class="muted small">בפלטפורמה האמיתית התוצר נפתח כאן ישירות: סרטון מתנגן, מסמך נקרא, ואפליקציה נפתחת בתצוגה מקדימה.</p>
    <div class="form-actions">
      <button type="button" class="btn" onClick=${() => openSheet('launch', { project: o.project, tool: 'doc', title: `שיפור: ${o.title}` })}><${Icon} name="edit" size=${15} />לבקש שינוי מ-Claude</button>
      <button type="button" class="btn" onClick=${() => openSheet('launch', { project: o.project, tool: 'deck', title: `מצגת מתוך: ${o.title}` })}><${Icon} name="grid" size=${15} />להפוך למצגת</button>
    </div>
  </div>`;
}
