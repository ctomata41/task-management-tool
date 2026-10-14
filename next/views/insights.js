// "תובנות": progress, patterns and impact across the person's projects, with the main bottlenecks raised to the top.
import { html, Icon, Ring, ClaudeMark } from '../ui.js';
import { weekly } from '../data.js';
import { useStore, myProjects, projectProgress, bottlenecks, person, project, hoursLabel } from '../store.js';

function Bars({ values, labels, color, unit }) {
  const max = Math.max(...values);
  return html`<div class="bars" role="img" aria-label=${values.map((v, i) => `${labels[i]}: ${v}${unit}`).join(', ')}>
    ${values.map((v, i) => html`<div class="bar-col"><span class="bar-v">${v}</span><i style=${`height:${(v / max) * 100}%;background:${color};opacity:${i === values.length - 1 ? 1 : 0.45}`}></i><span class="bar-l">${labels[i]}</span></div>`)}
  </div>`;
}

export function Insights() {
  const s = useStore();
  const mine = myProjects();
  const bn = bottlenecks();
  const types = {};
  s.humanTasks.filter((t) => !t.done).forEach((t) => { types[t.type] = (types[t.type] || 0) + (Date.now() - new Date(t.created).getTime()) / 3600e3; });
  const names = { connect: 'חיבור כלים ו-API', auth: 'אישורים והזדהות', file: 'קבצים', pay: 'תשלומים' };
  const tmax = Math.max(1, ...Object.values(types));
  const outs = weekly.outputs[weekly.outputs.length - 1];
  return html`<div class="page">
    <header class="page-head"><div><h1>תובנות</h1><p class="sub">מה זז, איפה נתקעים ומה ההשפעה, מחושב מהפעילות של הצוות ושל Claude</p></div></header>
    <div class="kpis">
      <div class="kpi"><span class="kpi-n">${outs}</span><span class="kpi-l">תוצרים השבוע</span><span class="trend up">פי 4.7 משבוע 1</span></div>
      <div class="kpi"><span class="kpi-n">12 ש׳</span><span class="kpi-l">Claude חיכה לאנשים</span><span class="trend up">ירידה של 71%</span></div>
      <div class="kpi"><span class="kpi-n">17 ש׳</span><span class="kpi-l">זמן ממוצע להחלטה</span><span class="trend up">ירידה של 67%</span></div>
      <div class="kpi"><span class="kpi-n">${s.agents.filter((a) => a.state === 'run').length}</span><span class="kpi-l">סוכנים עובדים עכשיו</span><span class="trend">על 5 פרויקטים</span></div>
    </div>
    <div class="ins-grid">
      <section class="card"><div class="sec-head"><h2>תוצרים בשבוע</h2><span class="muted small">6 שבועות</span></div>
        <${Bars} values=${weekly.outputs} labels=${weekly.labels} color="var(--claude)" unit=" תוצרים" /></section>
      <section class="card"><div class="sec-head"><h2>שעות ש-Claude חיכה לאדם</h2><span class="muted small">המדד הראשי של הפיילוט</span></div>
        <${Bars} values=${weekly.waitHours} labels=${weekly.labels} color="var(--s-blocked)" unit=" שעות" /></section>
      <section class="card"><div class="sec-head"><h2>איפה נתקעים</h2><span class="muted small">שעות המתנה לפי סוג</span></div>
        ${Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<div class="hbar"><span>${names[k] || k}</span><span class="hbar-t"><i style=${`width:${(v / tmax) * 100}%`}></i></span><b>${Math.round(v)} ש׳</b></div>`)}
      </section>
      <section class="card"><div class="sec-head"><h2>התקדמות לפי פרויקט</h2></div>
        ${mine.map((p) => html`<a class="prog-row" href=${`#/project/${p.id}`}><${Ring} value=${projectProgress(p)} size=${38} stroke=${4} color=${p.color} /><span class="grow">${p.name}</span><span class="muted small">${s.outputs.filter((o) => o.project === p.id).length} תוצרים</span></a>`)}
      </section>
      <section class="card span2"><div class="sec-head"><h2><${ClaudeMark} size=${20} /> מה Claude רואה</h2><span class="muted small">דפוסים מ-6 השבועות האחרונים</span></div>
        <ul class="patterns">
          <li><${Icon} name="bolt" size=${16} /><span><b>החלטה שמחכה יותר מ-48 שעות מאטה את הפרויקט פי 2.</b> רוב ההמתנה היא על החלטות שאין להן מועד. כדאי לתת לכל החלטה מועד כבר כשהיא נפתחת.</span></li>
          <li><${Icon} name="plug" size=${16} /><span><b>חיבורי API הם צוואר הבקבוק הגדול.</b> ${bn[0] ? `"${bn[0].title}" מחכה ל${person(bn[0].owner).name} כבר ${hoursLabel(Date.now() - new Date(bn[0].since).getTime())}.` : ''} אפשר לרכז את כל המפתחות פעם אחת בתחילת פרויקט.</span></li>
          <li><${Icon} name="chart" size=${16} /><span><b>מאז שתוצרים עולים לבד, הם נבדקים תוך 3 שעות במקום יומיים.</b> פרויקטים עם תוצר בשבוע מתקדמים מהר יותר מפרויקטים עם תוצר גדול אחד.</span></li>
          <li><${Icon} name="users" size=${16} /><span><b>${project('summit').name} תלוי בשלושה אנשים.</b> שתי החלטות פתוחות בו מחכות לאותו אדם. כדאי לחלק אותן בפגישה השבועית.</span></li>
        </ul>
      </section>
      <section class="card span2"><div class="sec-head"><h2>השפעה</h2><span class="muted small">לדרג הבכיר</span></div>
        <p class="impact">צוות של 4 אנשים מריץ השבוע <b>5 פרויקטים</b> במקביל, עם <b>${s.agents.length} סוכנים</b>. Claude הפיק <b>${outs} תוצרים</b>, והאנשים קיבלו <b>${s.decisions.filter((d) => d.choice).length + 9} החלטות</b>. בשבוע הראשון של הפיילוט אותו צוות הפיק 3 תוצרים.</p>
      </section>
    </div>
  </div>`;
}
