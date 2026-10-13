// Weekly report for the senior level: progress, risks, blockers and requests for help, as plain text to copy or email.
import { useState } from 'preact/hooks';
import { getState, visibleTasks, person, toast } from '../store.js';
import { html, Icon, Modal } from '../ui.js';
import { HEALTH_BY, isOverdue, isStuck, weekStart, weekEnd, shortDate, ymd, daysSince } from '../util.js';

export function buildWeeklyReport(s = getState()) {
  const tasks = visibleTasks(s).filter((t) => !t.private);
  const ws = weekStart();
  const we = weekEnd();
  const doneWeek = tasks.filter((t) => t.status === 'done' && t.done_at && ymd(new Date(t.done_at)) >= ws);
  const open = tasks.filter((t) => t.status !== 'done');
  const stuck = open.filter(isStuck);
  const late = open.filter(isOverdue);
  const name = (id) => person(id)?.name || 'ללא אחראי';
  const year = new Date().getFullYear();
  const L = [];
  L.push('דוח שבועי: צוות CTO');
  L.push(`שבוע ${shortDate(ws)} עד ${shortDate(we)}/${year}`);
  L.push('');
  L.push(`בשורה אחת: ${s.projects.length} פרויקטים פעילים, ${doneWeek.length} משימות הושלמו השבוע, ${stuck.length} חסמים פתוחים, ${late.length} משימות באיחור.`);
  L.push('');
  L.push('התקדמות לפי פרויקט');
  s.projects.forEach((p) => {
    const pt = tasks.filter((t) => t.project_id === p.id);
    const done = pt.filter((t) => t.status === 'done').length;
    const dw = doneWeek.filter((t) => t.project_id === p.id).length;
    const health = HEALTH_BY[p.health]?.label || '';
    L.push(`• ${p.name} (${health}): ${done}/${pt.length} הושלמו${dw ? `, ${dw} מהן השבוע` : ''}${p.target_date ? `. יעד ${shortDate(p.target_date)}` : ''}.`);
    if (p.health_note) L.push(`  ${p.health_note}`);
  });
  if (doneWeek.length) {
    L.push('');
    L.push('הושלם השבוע');
    doneWeek.slice(0, 15).forEach((t) => L.push(`• ${t.title} (${name(t.owner_id)})`));
    if (doneWeek.length > 15) L.push(`• ועוד ${doneWeek.length - 15}`);
  }
  const risky = s.projects.filter((p) => p.health && p.health !== 'on_track');
  if (risky.length || late.length) {
    L.push('');
    L.push('סיכונים');
    risky.forEach((p) => L.push(`• ${p.name}: ${HEALTH_BY[p.health]?.label}${p.health_note ? `. ${p.health_note}` : ''}`));
    late.slice(0, 10).forEach((t) => L.push(`• באיחור: ${t.title} (${name(t.owner_id)}, יעד ${shortDate(t.due)})`));
  }
  if (stuck.length) {
    L.push('');
    L.push('חסמים');
    stuck.forEach((t) => {
      const by = person(t.blocked_by_person);
      const since = daysSince(t.updated_at || t.created_at);
      L.push(`• ${t.title} (${name(t.owner_id)})${by ? `, מחכה ל${by.name}` : ''}${t.blocked_reason ? `: ${t.blocked_reason}` : ''}${since ? `. ${since} ימים` : ''}`);
    });
  }
  // Help requests: blockers that the team cannot clear on its own (an outside person, or no person named).
  const help = stuck.filter((t) => {
    const by = person(t.blocked_by_person);
    return !by || !by.is_team;
  });
  L.push('');
  L.push('בקשות לעזרה');
  if (help.length) help.forEach((t) => L.push(`• ${t.title}${t.blocked_reason ? `: ${t.blocked_reason}` : ''}`));
  else L.push('• אין השבוע');
  return L.join('\n');
}

export function ReportModal() {
  const [text, setText] = useState(() => buildWeeklyReport());
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast('הדוח הועתק'); } catch (e) { toast('לא הצלחתי להעתיק. אפשר לסמן את הטקסט ולהעתיק ידנית.', { kind: 'error' }); }
  };
  const mail = `mailto:?subject=${encodeURIComponent('דוח שבועי: צוות CTO')}&body=${encodeURIComponent(text)}`;
  return html`<${Modal} title="דוח שבועי לדרג הבכיר" wide>
    <p class="muted small">נוצר אוטומטית מהנתונים בכלי (בלי משימות פרטיות). אפשר לערוך לפני השליחה.</p>
    <textarea class="report-text" value=${text} rows=${18} onInput=${(e) => setText(e.currentTarget.value)} aria-label="טקסט הדוח"></textarea>
    <div class="form-actions">
      <button type="button" class="btn btn-primary" onClick=${copy}><${Icon} name="copy" size=${16} />העתקה</button>
      <a class="btn" href=${mail}><${Icon} name="message" size=${16} />פתיחה במייל</a>
    </div>
  <//>`;
}
