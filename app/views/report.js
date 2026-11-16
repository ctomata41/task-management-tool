// The weekly report to the senior level: one fixed page (spec). The tool drafts it from the data only; the commander writes
// the bottom line and sends it personally. It is never sent automatically.
import { useState } from 'preact/hooks';
import { getState, visibleTasks, person } from '../store.js';
import { html, Icon, Modal, copyText } from '../ui.js';
import {
  liveProjects, projectLine, openDecisions, significant, commanderOf, commitmentWhen, counterpartOf, fromWhom, STAGE,
} from '../model.js';
import { HEALTH_BY, isStuck, weekStart, weekEnd, shortDate, ymd, workdaysUntil } from '../util.js';

// Nothing marked as possibly classified, and nobody's private items.
const clean = (x) => !x.flagged && !x.private;

export function buildWeeklyReport(s = getState()) {
  const ws = weekStart();
  const tasks = visibleTasks(s).filter(clean);
  const projects = liveProjects(s).filter(clean);
  const active = projects.filter((p) => (p.stage || 'active') === 'active');
  const proposed = projects.filter((p) => p.stage === 'proposed');
  const decided = s.decisions.filter((d) => clean(d) && d.status === 'decided' && d.decided_at && ymd(new Date(d.decided_at)) >= ws)
    .sort((a, b) => a.decided_at.localeCompare(b.decided_at));
  const openD = openDecisions(s).filter(clean);
  const doneWeek = tasks.filter((t) => t.status === 'done' && t.done_at && ymd(new Date(t.done_at)) >= ws);
  const commitments = s.commitments.filter((c) => clean(c) && c.status === 'open' && c.due);
  const weOwe = commitments.filter((c) => c.direction === 'we_owe' && workdaysUntil(c.due) <= 5).sort((a, b) => a.due.localeCompare(b.due));
  const theyLate = commitments.filter((c) => c.direction === 'they_owe' && workdaysUntil(c.due) < 0).sort((a, b) => a.due.localeCompare(b.due));
  const title = (x) => x.d?.title || x.t?.title || x.c?.title || x.p?.name || '';
  const risks = significant(s).filter((x) => x.type !== 'commitment' && clean(x.d || x.t || x.p || {}));
  const help = tasks.filter((t) => t.status !== 'done' && isStuck(t) && !person(t.blocked_by_person)?.is_team);

  const L = [];
  L.push(`במספרים: ${active.length} פרויקטים פעילים${proposed.length ? `, ${proposed.length} מחכים להחלטה על פתיחה` : ''}. `
    + `${decided.length} החלטות התקבלו השבוע ו-${openD.length} פתוחות. ${doneWeek.length} מטלות ומשימות הושלמו השבוע.`);
  L.push('');
  L.push('הפרויקטים');
  projects.forEach((p) => {
    const state = p.stage === 'proposed' ? STAGE.proposed.label : HEALTH_BY[p.health]?.label || '';
    L.push(`• ${p.name} (${state}): ${projectLine(p, s).text}`);
  });
  if (!projects.length) L.push('• אין פרויקטים פעילים');
  if (decided.length) {
    L.push('');
    L.push('החלטות שהתקבלו השבוע');
    decided.forEach((d) => L.push(`• ${d.title} ← ${d.chosen_label}${d.rationale ? `. ${d.rationale}` : ''}`));
  }
  if (weOwe.length || theyLate.length) {
    L.push('');
    L.push('התחייבויות לגורמים חיצוניים');
    weOwe.forEach((c) => L.push(`• התחייבנו כלפי ${counterpartOf(c)}: ${c.title}, ${commitmentWhen(c)}`));
    theyLate.forEach((c) => L.push(`• מחכים ${fromWhom(counterpartOf(c))}: ${c.title}, ${commitmentWhen(c)}`));
  }
  if (risks.length) {
    L.push('');
    L.push('סיכונים וחסמים');
    risks.forEach((x) => L.push(`• ${title(x)}: ${x.why}`));
  }
  L.push('');
  L.push('בקשות לעזרה');
  if (help.length) help.forEach((t) => L.push(`• ${t.title}${t.blocked_reason ? `: ${t.blocked_reason}` : ''}`));
  else L.push('• אין השבוע');
  return L.join('\n');
}

export function ReportModal() {
  const s = getState();
  const cmd = commanderOf(s);
  const [bottom, setBottom] = useState('');
  const [body, setBody] = useState(() => buildWeeklyReport());
  const ws = weekStart();
  const full = [
    'דוח שבועי: צוות CTO',
    `שבוע ${shortDate(ws)} עד ${shortDate(weekEnd())}/${new Date().getFullYear()}`,
    '',
    `השורה התחתונה: ${bottom.trim() || '…'}`,
    '',
    body.trim(),
    '',
    `הטיוטה הוכנה מהנתונים בכלי. השורה התחתונה: ${cmd?.name || 'המפקד'}.`,
  ].join('\n');
  const mail = `mailto:?subject=${encodeURIComponent('דוח שבועי: צוות CTO')}&body=${encodeURIComponent(full)}`;
  return html`<${Modal} title="דוח שבועי לדרג הבכיר" wide>
    <p class="muted small">טיוטה מהנתונים בכלי, בלי פריטים פרטיים ובלי פריטים שסומנו כחשודים. השורה התחתונה והשליחה הן של ${cmd?.name || 'המפקד'}, והדוח לא נשלח אף פעם אוטומטית.</p>
    <label class="lbl" for="rp-bottom">השורה התחתונה</label>
    <textarea id="rp-bottom" class="input area" rows="2" value=${bottom} onInput=${(e) => setBottom(e.currentTarget.value)}
      placeholder="בשורה או שתיים: מה הדרג הבכיר צריך לדעת השבוע"></textarea>
    <label class="lbl" for="rp-body">הטיוטה</label>
    <textarea id="rp-body" class="report-text" value=${body} rows=${16} onInput=${(e) => setBody(e.currentTarget.value)}></textarea>
    <div class="form-actions">
      <button type="button" class="btn btn-primary" onClick=${() => copyText(full, 'הדוח הועתק')}><${Icon} name="copy" size=${16} />העתקה</button>
      <a class="btn" href=${mail}><${Icon} name="message" size=${16} />פתיחה במייל</a>
      ${!bottom.trim() ? html`<span class="muted small hint-inline">השורה התחתונה עוד ריקה.</span>` : null}
    </div>
  <//>`;
}
