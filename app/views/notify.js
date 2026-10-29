// Settings for what reaches the phone (spec, chapter 9): notifications on this device, the team's quiet hours and digest
// time (part of the work agreement), and the fixed rules: plain Hebrew text that a person approves before it runs, with
// a log of every run.
import { useEffect, useState } from 'preact/hooks';
import { me, person, saveSettings, setRule } from '../store.js';
import { html, Icon } from '../ui.js';
import { timeAgo } from '../util.js';
import { pushState, pushOn, pushOff, pushTest, pushDigest, pushRemove } from '../push.js';

const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const hm = (t, fallback) => (t ? String(t).slice(0, 5) : fallback);
const pad = (n) => String(n).padStart(2, '0');
// "היום ב-08:00", "אתמול ב-08:00", "12/10 ב-08:00"
function stamp(iso) {
  const d = new Date(iso);
  const n = new Date();
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  const day = days === 0 ? 'היום' : days === 1 ? 'אתמול' : `${d.getDate()}/${d.getMonth() + 1}`;
  return `${day} ב-${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// "שישי ושבת", "שבת", "ראשון, שני ושלישי"
function daysText(days) {
  const names = [...(days || [])].sort().map((d) => DAY_NAMES[d]).filter(Boolean);
  if (names.length < 2) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`;
}
// The quiet hours and the digest time, with the defaults of the work agreement until the team sets them.
export function quiet(s) {
  const t = s.settings || {};
  return { from: hm(t.quiet_from, '19:00'), to: hm(t.quiet_to, '08:00'), days: t.quiet_days || [5, 6], digest: hm(t.digest_at, '08:00') };
}
const quietLine = (q) => `${q.from} עד ${q.to}${q.days.length ? `, וימי ${daysText(q.days)} כל היום` : ''}`;

// ---------- this device ----------
export function PhoneNotifications({ s }) {
  const m = me();
  const commander = m?.role === 'מפקד';
  const q = quiet(s);
  const digestOn = s.rules.some((r) => r.key === 'digest' && r.status === 'active');
  const [st, setSt] = useState({ phase: 'checking', devices: [] });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const check = () => pushState().then(setSt).catch(() => setSt({ phase: 'not_ready', devices: [] }));
  useEffect(() => { check(); }, [m?.id]);
  // Each action runs straight from the tap: turning on asks the phone's permission question, which needs one.
  const run = (name, fn) => async () => {
    setBusy(name);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'משהו השתבש' });
    }
    setBusy('');
    check();
  };
  const turnOn = run('on', async () => { await pushOn(m.id); return 'ההתראות הופעלו במכשיר הזה.'; });
  const turnOff = run('off', async () => { await pushOff(); return 'ההתראות כובו במכשיר הזה.'; });
  const test = run('test', async () => {
    const r = await pushTest(st.endpoint);
    if (!r.ok) throw new Error(r.error === 'not_registered' ? 'המכשיר לא רשום. אפשר לכבות ולהפעיל מחדש.' : `השליחה נכשלה${r.status ? ` (${r.status})` : ''}. אפשר לכבות ולהפעיל מחדש.`);
    return 'נשלחה התראת בדיקה. אם היא לא מגיעה תוך דקה, כדאי לבדוק שההתראות של האפליקציה מותרות בהגדרות הטלפון.';
  });
  const digest = run('digest', async () => {
    const r = await pushDigest(st.endpoint);
    if (r.empty) return 'אין כרגע מה לשלוח: שום דבר לא מחכה לך.';
    if (!r.ok) throw new Error('השליחה נכשלה. אפשר לנסות שוב בעוד רגע.');
    return 'התקציר נשלח.';
  });
  const others = st.devices.filter((d) => d.endpoint !== st.endpoint);

  const policy = commander
    ? html`<p>מגיע מיד רק כשמחכה לך החלטה על פתיחה או עצירה של פרויקט. אין תקציר יומי: הכל מחכה במסך "המפקד בדקה".</p>`
    : html`<p>מגיע מיד: מטלה או החלטה חדשה שלך, התחייבות שעברה אליך, אזכור, חסם בפרויקט שלך ומישהו שמחכה לך. רק כשאדם יצר אותם, לא Claude.</p>
      <p>כל השאר מגיע בתקציר אחד בכל יום עבודה ב-${q.digest}${digestOn ? '' : ', אחרי שהכלל "תקציר יומי" יאושר בכללים הקבועים'}.</p>`;
  let body;
  if (st.phase === 'checking') body = html`<p class="muted">בודק את המכשיר…</p>`;
  else if (st.phase === 'ios_home') {
    body = html`<p>באייפון התראות מגיעות רק לאפליקציה שבמסך הבית. בספארי: כפתור השיתוף, ואז "הוסף למסך הבית". אחר כך פותחים את "משימות CTO" מהמסך הבית וחוזרים לכאן.</p>`;
  } else if (st.phase === 'unsupported') {
    body = html`<p>הדפדפן הזה לא מקבל התראות. בטלפון: אייפון עם iOS 16.4 ומעלה, מהאפליקציה שבמסך הבית, או אנדרואיד עם Chrome.</p>`;
  } else if (st.phase === 'denied') {
    body = html`<p>ההתראות חסומות במכשיר הזה. באייפון: בהגדרות של הטלפון, תחת "התראות", בוחרים "משימות CTO" ומאפשרים. באנדרואיד: לחיצה ארוכה על סמל האפליקציה, "פרטי האפליקציה" ואז "התראות". במחשב: סמל המנעול ליד הכתובת.</p>`;
  } else if (st.phase === 'not_ready') {
    body = html`<p class="muted">שליחת התראות לטלפון עוד לא הופעלה בשרת. כשהיא תופעל, מפעילים כאן בלחיצה אחת.</p>`;
  } else if (st.phase === 'off') {
    body = html`${policy}
      <div class="push-actions"><button type="button" class="btn btn-primary" disabled=${!!busy} onClick=${turnOn}><${Icon} name="bell" size=${16} />${busy === 'on' ? 'מפעיל…' : 'הפעלה במכשיר הזה'}</button></div>`;
  } else {
    body = html`<p class="push-on"><span class="badge ok">פועל במכשיר הזה</span></p>
      ${policy}
      <div class="push-actions">
        <button type="button" class="btn sm" disabled=${!!busy} onClick=${test}>${busy === 'test' ? 'שולח…' : 'התראת בדיקה'}</button>
        ${commander ? null : html`<button type="button" class="btn sm" disabled=${!!busy} onClick=${digest}>${busy === 'digest' ? 'שולח…' : 'התקציר שלי עכשיו'}</button>`}
        <button type="button" class="btn sm ghost" disabled=${!!busy} onClick=${turnOff}>כיבוי במכשיר הזה</button>
      </div>`;
  }
  return html`<section class="set-sec push-sec">
    <h3><${Icon} name="bell" size=${16} />התראות לטלפון</h3>
    ${body}
    ${['off', 'on'].includes(st.phase) ? html`<p class="muted small">בשעות השקט (${quietLine(q)}) לא מגיע כלום, חוץ מחסם שמסכן התחייבות החוצה.</p>` : null}
    ${others.length ? html`<ul class="push-devices">${others.map((d) => html`<li key=${d.endpoint}>
      <span class="grow">גם ב-${d.device || 'מכשיר נוסף'}${d.last_ok_at ? html` <span class="muted">· התראה אחרונה ${timeAgo(d.last_ok_at)}</span>` : null}</span>
      <button type="button" class="link" disabled=${!!busy} onClick=${run('remove', async () => { await pushRemove(d.endpoint); return `${d.device || 'המכשיר'} הוסר.`; })}>הסרה</button></li>`)}</ul>` : null}
    ${msg ? html`<p class=${'push-msg ' + (msg.ok ? 'ok' : 'bad')} role="status">${msg.text}</p>` : null}
  </section>`;
}

// ---------- the team's quiet hours and digest time ----------
export function QuietHours({ s, canEdit }) {
  if (!s.settings || !('quiet_from' in s.settings)) return null;
  const q = quiet(s);
  const save = (patch) => saveSettings(patch, { guard: false });
  const toggle = (d) => save({ quiet_days: q.days.includes(d) ? q.days.filter((x) => x !== d) : [...q.days, d].sort() });
  return html`<section class="set-sec">
    <h3><${Icon} name="clock" size=${16} />שעות שקט ותקציר</h3>
    <p>שעות שקט: ${quietLine(q)}. התקציר היומי יוצא ב-${q.digest} בימי עבודה.</p>
    <p class="muted">חלק מהסכם העבודה שנקבע בהתנעה. בשעות השקט לא נשלחות התראות לטלפון, ומה שמחכה מגיע בתקציר.${canEdit ? '' : ' הפיקוד מעדכן אותן.'}</p>
    ${canEdit ? html`<div class="quiet-edit">
      <label class="quiet-field"><span>שקט מ-</span><input class="input" type="time" value=${q.from} aria-label="תחילת שעות השקט"
        onChange=${(e) => e.currentTarget.value && save({ quiet_from: e.currentTarget.value })} /></label>
      <label class="quiet-field"><span>עד</span><input class="input" type="time" value=${q.to} aria-label="סוף שעות השקט"
        onChange=${(e) => e.currentTarget.value && save({ quiet_to: e.currentTarget.value })} /></label>
      <label class="quiet-field"><span>תקציר ב-</span><input class="input" type="time" value=${q.digest} aria-label="שעת התקציר היומי"
        onChange=${(e) => e.currentTarget.value && save({ digest_at: e.currentTarget.value })} /></label>
      <div class="quiet-days" role="group" aria-label="ימים שקטים כל היום">
        ${DAY_LETTERS.map((l, d) => html`<button type="button" key=${d} class=${'day-tog' + (q.days.includes(d) ? ' on' : '')} aria-pressed=${q.days.includes(d) ? 'true' : 'false'}
          title=${`יום ${DAY_NAMES[d]}`} aria-label=${`יום ${DAY_NAMES[d]} שקט כל היום`} onClick=${() => toggle(d)}>${l}</button>`)}
      </div>
    </div>` : null}
  </section>`;
}

// ---------- the fixed rules ----------
const RULE_STATUS = { proposed: { label: 'מוצע', cls: 'warn' }, active: { label: 'פועל', cls: 'ok' }, paused: { label: 'מושהה', cls: '' } };
function runDetails(rule, details) {
  if (!Array.isArray(details) || !details.length) return '';
  if (rule === 'digest') return details.map((d) => `${d.name}: ${d.sent ? (d.count ? `${d.count} פריטים` : 'מה שקרה מאז') : 'לא נשלח'}`).join(' · ');
  return details.map((d) => `${d.title} (${d.owner}, ${d.step === '1' ? 'יום לפני' : 'חמישה ימים לפני'})`).join(' · ');
}

export function FixedRules({ s }) {
  if (!s.rules.length) return null;
  const m = me();
  const canApprove = !!m && m.is_team && !m.is_agent;
  return html`<section class="set-sec">
    <h3><${Icon} name="checklist" size=${16} />כללים קבועים</h3>
    <p class="muted">כללים פשוטים, בלי AI. הטקסט שמאשרים הוא מה שרץ, וכל ריצה נרשמת כאן. כלל מתחיל כמוצע ולא רץ עד שמישהו מהצוות מאשר אותו.</p>
    <div class="rule-list">
      ${s.rules.map((r) => {
        const runs = s.ruleRuns.filter((x) => x.rule === r.key);
        const st = RULE_STATUS[r.status] || RULE_STATUS.proposed;
        return html`<article class="rule-card" key=${r.key}>
          <header class="rule-head"><strong>${r.title}</strong><span class=${'badge ' + st.cls}>${st.label}</span></header>
          <p class="rule-body">${r.body}</p>
          <p class="muted small">${r.approved_by ? `אושר על ידי ${person(r.approved_by)?.name || 'מישהו'} ${timeAgo(r.approved_at)}` : 'עוד לא אושר'}${runs[0] ? ` · ריצה אחרונה ${stamp(runs[0].ran_at)} (${runs[0].summary})` : ''}</p>
          ${canApprove ? html`<div class="rule-actions">
            ${r.status === 'active'
              ? html`<button type="button" class="btn sm" onClick=${() => setRule(r.key, 'paused')}>השהיה</button>`
              : html`<button type="button" class="btn btn-primary sm" onClick=${() => setRule(r.key, 'active')}><${Icon} name="check" size=${14} />${r.status === 'paused' ? 'הפעלה מחדש' : 'אישור והפעלה'}</button>`}
          </div>` : null}
          ${runs.length ? html`<details class="rule-log"><summary>יומן ריצות (${runs.length})</summary>
            <ul>${runs.map((x) => html`<li key=${x.id}><span class="rule-when">${stamp(x.ran_at)}</span> · ${x.summary}${runDetails(r.key, x.details) ? html`<span class="muted"> · ${runDetails(r.key, x.details)}</span>` : null}</li>`)}</ul>
          </details>` : null}
        </article>`;
      })}
    </div>
  </section>`;
}
