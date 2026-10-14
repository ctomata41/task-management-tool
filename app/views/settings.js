// Settings: who uses this device, phone notifications, the בלמ״ס rules, quiet hours and the fixed rules, the team context
// file for Claude, the sensitive-word list (command), a full export, the team code, and signing out.
import { useState } from 'preact/hooks';
import { me, isCommand, switchUser, logout, changeCode, saveSettings } from '../store.js';
import { html, Icon, Avatar, Modal, AutoText, ConfirmButton, copyText } from '../ui.js';
import { fingerprint, sensitiveHits } from '../guard.js';
import { exportAll } from '../export.js';
import { APP_VERSION } from '../config.js';
import { timeAgo, shortDate } from '../util.js';
import { PhoneNotifications, QuietHours, FixedRules } from './notify.js';

function SensitiveWords({ s }) {
  const [text, setText] = useState('');
  const [probe, setProbe] = useState('');
  const [probeHit, setProbeHit] = useState(null);
  const [busy, setBusy] = useState(false);
  const hashes = s.settings?.word_hashes || [];
  const add = async (e) => {
    e.preventDefault();
    const words = text.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean);
    if (!words.length) return;
    setBusy(true);
    const prints = (await Promise.all(words.map(fingerprint))).filter(Boolean);
    const saved = await saveSettings({ word_hashes: [...new Set([...hashes, ...prints])] }, { guard: false });
    setBusy(false);
    if (saved) setText('');
  };
  const test = async (e) => {
    e.preventDefault();
    setProbeHit((await sensitiveHits(probe, hashes)) > 0);
  };
  return html`<section class="set-sec">
    <h3><${Icon} name="shield" size=${16} />מילים רגישות</h3>
    <p class="muted">לפני כל שמירה הטקסט נבדק בדפדפן מול הרשימה, בלי לשלוח אותו לשום מקום. המילים עצמן לא נשמרות: נשמרת רק טביעת אצבע שלהן, ואי אפשר לקרוא אותן בחזרה.</p>
    <p><b>${hashes.length}</b> מילים וביטויים ברשימה</p>
    <form class="form" onSubmit=${add}>
      <textarea class="input area" rows="3" value=${text} onInput=${(e) => setText(e.currentTarget.value)} aria-label="מילים להוספה"
        placeholder="מילה או ביטוי בכל שורה (או מופרדים בפסיק)" autocomplete="off"></textarea>
      <div class="form-actions"><button type="submit" class="btn" disabled=${busy || !text.trim()}>הוספה לרשימה</button>
        ${hashes.length ? html`<${ConfirmButton} label="ניקוי הרשימה" confirm="למחוק את כל הרשימה?" cls="btn danger" onConfirm=${() => saveSettings({ word_hashes: [] }, { guard: false })} />` : null}</div>
    </form>
    ${hashes.length ? html`<form class="probe" onSubmit=${test}>
      <input class="input" value=${probe} onInput=${(e) => { setProbe(e.currentTarget.value); setProbeHit(null); }} placeholder="בדיקה: האם מילה ברשימה?" aria-label="בדיקת מילה" autocomplete="off" />
      <button type="submit" class="btn sm" disabled=${!probe.trim()}>בדיקה</button>
      ${probeHit === null ? null : html`<span class=${probeHit ? 'badge bad' : 'badge ok'}>${probeHit ? 'ברשימה' : 'לא ברשימה'}</span>`}
    </form>` : null}
  </section>`;
}

function TeamContext({ s, canEdit }) {
  const ctx = s.settings?.context || '';
  return html`<section class="set-sec">
    <h3><${Icon} name="sparkle" size=${16} />קובץ הקשר לצוות</h3>
    <p class="muted">מה כל Claude צריך לדעת על הצוות: מי אנחנו, איך עובדים ומה חשוב. נכנס בראש כל "העתקה ל-Claude", ובהמשך גם למחבר.${canEdit ? '' : ' הפיקוד מתחזק אותו.'}</p>
    ${canEdit ? html`<${AutoText} cls="field-text" rows=${4} value=${ctx} label="קובץ הקשר לצוות" placeholder="למשל: צוות ה-CTO, ארבעה אנשים. עובדים בעברית. בלמ״ס בלבד…"
        onSave=${(v) => saveSettings({ context: v.trim() || null })} />`
      : ctx ? html`<p class="ctx-read">${ctx}</p>` : html`<p class="muted">עוד לא נכתב.</p>`}
    ${ctx ? html`<div><button type="button" class="btn sm" onClick=${() => copyText(ctx, 'קובץ ההקשר הועתק')}><${Icon} name="copy" size=${14} />העתקה</button>
      ${s.settings?.updated_at ? html`<span class="muted small"> · עודכן ${timeAgo(s.settings.updated_at)}</span>` : null}</div>` : null}
  </section>`;
}

export function SettingsPanel({ s }) {
  const m = me();
  const cmd = isCommand(s);
  const [oldC, setOld] = useState('');
  const [newC, setNew] = useState('');
  const [msg, setMsg] = useState('');
  const doChange = async (e) => {
    e.preventDefault();
    try { await changeCode(oldC, newC); setMsg('קוד הצוות עודכן. שלחו את הקוד החדש לצוות בנפרד.'); setOld(''); setNew(''); } catch (ex) { setMsg(ex.message); }
  };
  return html`<${Modal} title="הגדרות">
    <section class="set-sec">
      <h3>פרופיל במכשיר הזה</h3>
      <div class="set-me"><${Avatar} p=${m} size=${36} /><div><strong>${m?.name}</strong><span class="muted">${m?.role || ''}${cmd ? ' · פיקוד' : ''}</span></div>
        <button type="button" class="btn sm" onClick=${switchUser}>החלפת משתמש</button></div>
    </section>
    <${PhoneNotifications} s=${s} />
    <section class="set-sec">
      <h3>התקנה בטלפון</h3>
      <p class="muted">אייפון: בספארי, כפתור השיתוף ואז "הוסף למסך הבית". אנדרואיד: בכרום, תפריט ⋮ ואז "התקנת אפליקציה".</p>
    </section>
    <section class="set-sec">
      <h3><${Icon} name="shieldCheck" size=${16} />בלמ״ס בלבד</h3>
      <ul class="rules">
        <li>מידע מסווג לא נכנס לכלי, וגם לא לשיחות עם Claude שמחובר אליו.</li>
        <li>פרויקט מסווג מופיע רק בשם בלמ״ס, עם מוביל ומצב. הפרטים ברשת המסווגת.</li>
        <li>פריט שנראה חשוד מסמנים כחשוד, והוא מוסתר עד שהפיקוד בודק.</li>
        <li>בהגדרות הפרטיות של Claude מכבים את השימוש בשיחות לאימון.</li>
      </ul>
      ${m?.declared_at ? html`<p class="muted small">ההצהרה אושרה ב-${shortDate(m.declared_at.slice(0, 10))}.</p>` : null}
    </section>
    <${QuietHours} s=${s} canEdit=${cmd} />
    <${FixedRules} s=${s} />
    <${TeamContext} s=${s} canEdit=${cmd} />
    ${cmd ? html`<${SensitiveWords} s=${s} />` : null}
    <section class="set-sec">
      <h3>ייצוא מלא</h3>
      <p class="muted">כל הנתונים בקובץ אחד, כדי שהעבודה לא תלויה בכלי ולא ב-AI. בלי פריטים שסומנו כחשודים ובלי פריטים פרטיים של אחרים.</p>
      <div><button type="button" class="btn" onClick=${() => exportAll().catch((e) => setMsg(e.message))}><${Icon} name="download" size=${16} />הורדת קובץ JSON</button></div>
    </section>
    <section class="set-sec">
      <h3>החלפת קוד צוות</h3>
      <form class="form" onSubmit=${doChange}>
        <input class="input" id="old-code" type="password" placeholder="הקוד הנוכחי" aria-label="הקוד הנוכחי" value=${oldC} onInput=${(e) => setOld(e.currentTarget.value)} autocomplete="current-password" />
        <input class="input" id="new-code" type="password" placeholder="קוד חדש (6 תווים לפחות)" aria-label="קוד חדש" value=${newC} onInput=${(e) => setNew(e.currentTarget.value)} autocomplete="new-password" />
        <div class="form-actions"><button type="submit" class="btn" disabled=${!oldC || newC.length < 6}>עדכון הקוד</button></div>
        ${msg ? html`<p class="muted">${msg}</p>` : null}
      </form>
    </section>
    <section class="set-sec">
      <div><button type="button" class="btn danger" onClick=${logout}><${Icon} name="logout" size=${16} />יציאה מהמכשיר</button></div>
      <p class="muted small">גרסה ${APP_VERSION}${s.lastSync ? ` · סונכרן ${timeAgo(s.lastSync)}` : ''}</p>
    </section>
  <//>`;
}
