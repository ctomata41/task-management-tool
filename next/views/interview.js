// "ראיון": Claude understands the project and keeps consulting on direction. It breaks the goal into the decisions it
// needs, asks one at a time with options and a recommendation, and every answer lands in the decision log.
import { useState } from 'preact/hooks';
import { html, Icon, ClaudeMark, Seg } from '../ui.js';
import { useStore, project, answerInterview } from '../store.js';

export function Interview({ id }) {
  const s = useStore();
  const ids = Object.keys(s.interviews);
  const pid = ids.includes(id) ? id : ids[0];
  const iv = s.interviews[pid];
  const p = project(pid);
  const ans = s.answers[pid] || {};
  const pending = iv.questions.filter((q) => !ans[q.id]);
  const q = pending[0];
  const decided = iv.tree.reduce((n, b) => n + b.decided.length, 0);
  const open = iv.tree.reduce((n, b) => n + b.open.length, 0);
  return html`<div class="page">
    <header class="page-head"><div><h1>ראיון עם Claude</h1><p class="sub">Claude מפרק את היעד של הפרויקט להחלטות, ושואל רק את מה שהוא צריך כדי להמשיך</p></div>
      <${Seg} value=${pid} onChange=${(v) => { location.hash = `#/interview/${v}`; }} label="פרויקט" options=${ids.map((x) => ({ id: x, label: project(x).name, n: s.interviews[x].questions.filter((qq) => !(s.answers[x] || {})[qq.id]).length || null }))} /></header>
    <div class="iv-grid">
      <div class="iv-chat">
        ${iv.questions.filter((x) => ans[x.id]).map((x) => html`<div class="iv-done">
          <div class="bubble claude"><${ClaudeMark} size=${22} /><span>${x.q}</span></div>
          <div class="bubble me">${ans[x.id]}</div>
        </div>`)}
        ${q ? html`<${Question} key=${pid + q.id} pid=${pid} q=${q} n=${iv.questions.length - pending.length + 1} total=${iv.questions.length} />`
          : html`<div class="card iv-end"><${ClaudeMark} size=${40} /><h2>זהו לבינתיים</h2>
              <p class="muted">כל התשובות נכנסו ליומן ההחלטות של ${p.name}, ו-Claude ממשיך לעבוד לפיהן. כשהוא יגיע לצומת הבא, השאלה תופיע כאן וב"היום".</p>
              <a class="btn btn-primary" href=${`#/project/${pid}`}>לפרויקט</a></div>`}
      </div>
      <aside class="col-side">
        <section class="card side-card">
          <div class="sec-head"><h2>מהיעד להחלטות</h2><span class="muted small">${decided} הוחלטו · ${open} פתוחות</span></div>
          <div class="goal"><${Icon} name="target" size=${16} /><span>${iv.goal}</span></div>
          <ul class="tree">${iv.tree.map((b) => html`<li>
            <strong>${b.title}</strong>
            <ul>
              ${b.decided.map((x) => html`<li class="dec"><${Icon} name="check" size=${12} />${x}</li>`)}
              ${b.open.map((x) => html`<li class=${'opn' + (q && q.resolves === x ? ' cur' : '')}><i></i>${x}</li>`)}
            </ul>
          </li>`)}</ul>
        </section>
      </aside>
    </div>
  </div>`;
}

function Question({ pid, q, n, total }) {
  const [other, setOther] = useState('');
  const [more, setMore] = useState(false);
  return html`<div class="card iv-q">
    <div class="iv-q-head"><${ClaudeMark} size=${30} live /><span class="muted small">שאלה ${n} מתוך ${total} · ${q.branch}</span></div>
    <h2>${q.q}</h2>
    <p class="iv-ctx">${q.context}</p>
    ${more ? html`<p class="iv-more"><${Icon} name="sparkle" size=${14} /> Claude: בדקתי איך זה עובד בפרויקטים האחרים של הצוות. כשהתוצר עולה לבד ומחכה לאישור, הוא נבדק בממוצע תוך 3 שעות. כשהוא נשלח בצ׳אט, תוך יומיים.</p>` : null}
    <div class="iv-opts">
      ${q.options.map((o) => html`<button type="button" class=${'dc2-opt' + (o.rec ? ' rec' : '')} onClick=${() => answerInterview(pid, q.id, o.id)}>
        <span class="dc2-opt-l">${o.label}${o.rec ? html`<em>המלצת Claude</em>` : null}</span><span class="dc2-opt-w">${o.why}</span></button>`)}
    </div>
    <form class="iv-other" onSubmit=${(e) => { e.preventDefault(); if (other.trim()) answerInterview(pid, q.id, other.trim()); }}>
      <input class="input" placeholder="תשובה אחרת, במילים שלך" value=${other} onInput=${(e) => setOther(e.target.value)} aria-label="תשובה אחרת" />
      <button class="btn" type="submit" disabled=${!other.trim()}>שליחה</button>
    </form>
    <div class="iv-foot">
      ${!more ? html`<button type="button" class="link" onClick=${() => setMore(true)}>להסביר יותר</button>` : null}
      <button type="button" class="link" onClick=${() => answerInterview(pid, q.id, 'לדון בפגישה השבועית')}>לדחות לפגישה השבועית</button>
    </div>
  </div>`;
}
