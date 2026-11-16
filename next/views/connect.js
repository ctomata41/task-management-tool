// "חיבור ל-Claude": each person connects their own Claude to the platform with a personal key. The key is shown once,
// as part of the connector's address; only its fingerprint is kept. Claude then reports its work here and reads back
// what people decided, did and asked for.
import { useEffect, useState } from 'preact/hooks';
import { html, Icon, ClaudeMark, Seg, ago } from '../ui.js';
import { useStore, toast } from '../store.js';
import { keys, connectorUrl } from '../live.js';
import { Presence } from '../parts.js';
import { haptic } from '../../app/motion.js';

const LABELS = [{ id: 'claude.ai', label: 'claude.ai' }, { id: 'Claude Code', label: 'Claude Code' }, { id: 'Cowork', label: 'Cowork' }];

function copy(text) {
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => { haptic(); toast('הועתק'); }, () => toast('לא הצלחתי להעתיק. אפשר לסמן ולהעתיק ביד'));
}

export function ConnectSheetBody() {
  const s = useStore();
  const live = s.mode === 'live';
  const [list, setList] = useState(null);
  const [label, setLabel] = useState('claude.ai');
  const [fresh, setFresh] = useState(null); // the key just made, shown once
  const [busy, setBusy] = useState(false);
  const ready = live && s.connector.ready;
  const reload = () => keys.list().then(setList, () => setList([]));
  useEffect(() => { if (ready) reload(); }, [ready]);

  const make = async () => {
    setBusy(true);
    try { setFresh(await keys.create(label)); haptic('success'); reload(); } catch (e) { toast(e.message || 'לא נוצר מפתח'); }
    setBusy(false);
  };
  const revoke = async (k) => {
    try { await keys.revoke(k.id); toast('המפתח בוטל. Claude שמשתמש בו כבר לא יכול לדווח'); reload(); } catch (e) { toast(e.message); }
  };
  const url = fresh ? connectorUrl(fresh) : connectorUrl("cto_…");

  return html`<div class="connect">
    <div class="flow">
      <div class="flow-side"><${ClaudeMark} size=${30} /><strong>Claude שלך</strong><span class="muted small">claude.ai, Claude Code, Cowork</span></div>
      <div class="flow-arrows">
        <span><${Icon} name="chevronLeft" size=${14} />מדווח: התחלה, התקדמות, תוצרים, שאלות</span>
        <span class="back"><${Icon} name="chevronRight" size=${14} />קורא: החלטות, מטלות שבוצעו, הערות, עצירה</span>
      </div>
      <div class="flow-side"><span class="logo-n"><${Icon} name="layers" size=${18} /></span><strong>מרכז הבקרה</strong><span class="muted small">הצוות רואה הכל במקום אחד</span></div>
    </div>

    <p class=${'cstate ' + (s.connector.enabled ? 'on' : 'off')}>
      <span class="spill" style=${`--c:${s.connector.enabled ? 'var(--h-on)' : 'var(--s-review)'}`}>${s.connector.enabled ? 'פעיל לצוות' : 'עוד לא פעיל'}</span>
      ${!live ? 'בנתוני הדמה אין מפתח אמיתי. כך זה ייראה.'
        : !s.connector.ready ? 'המחבר עוד לא הותקן במסד של הצוות.'
        : s.connector.enabled ? 'Claude של כל מי שיצר מפתח יכול לדווח לכאן.'
        : 'אפשר ליצור מפתח כבר עכשיו. הוא יתחיל לעבוד כשהחיבור יופעל לצוות, אחרי אישור קצין הביטחון.'}
    </p>

    <ol class="csteps">
      <li><strong>ליצור מפתח אישי</strong>
        <span class="muted small">כל אחד ואחת לעצמם. Claude שמשתמש בו פועל בשמך ומדווח עליך.</span>
        ${fresh ? null : html`<div class="row-gap wrap">
          <${Seg} value=${label} onChange=${setLabel} label="איפה Claude רץ" options=${LABELS} />
          <button type="button" class="btn btn-primary sm" disabled=${!ready || busy} onClick=${make}><${Icon} name="key" size=${15} />יצירת מפתח</button>
        </div>`}
      </li>
      <li><strong>להעתיק את כתובת המחבר</strong>
        <span class="muted small">${fresh ? 'מופיעה פעם אחת בלבד. אם היא הולכת לאיבוד, יוצרים מפתח חדש.' : 'הכתובת מופיעה כאן אחרי יצירת המפתח.'}</span>
        <div class=${'curl' + (fresh ? ' on' : '')}><code dir="ltr">${url}</code>
          <button type="button" class="icon-btn sm" aria-label="העתקה" disabled=${!fresh} onClick=${() => copy(url)}><${Icon} name="copy" size=${15} /></button></div>
      </li>
      <li><strong>להוסיף אותה ל-Claude</strong>
        ${label === 'Claude Code' ? html`<span class="muted small">בטרמינל:</span>
          <div class="curl on"><code dir="ltr">claude mcp add --transport http --scope user cto-platform ${url}</code>
            <button type="button" class="icon-btn sm" aria-label="העתקה" disabled=${!fresh} onClick=${() => copy(`claude mcp add --transport http --scope user cto-platform ${url}`)}><${Icon} name="copy" size=${15} /></button></div>`
          : html`<span class="muted small">ב-claude.ai: הגדרות, Connectors, הוספת מחבר מותאם אישית. שם: פלטפורמת הצוות. כתובת: מה שהעתקת.</span>`}
      </li>
      <li><strong>לעבוד כרגיל</strong>
        <span class="muted small">אפשר לכתוב ל-Claude "תבדוק מה מחכה לי בפלטפורמה", או להפעיל אותו מכאן. הוא ירשום ריצה, ידווח, יעלה תוצרים עם קישור, וישאל כאן במקום בצ׳אט.</span>
      </li>
    </ol>

    <section class="sec"><div class="sec-head"><h2>מי מחובר</h2><span class="muted small">לפי הפעם האחרונה ש-Claude שלהם פנה לפלטפורמה</span></div><${Presence} /></section>

    <div class="cguard"><${Icon} name="shield" size=${16} /><span>Claude לא מחליט, לא סוגר משימות ולא מאשר תוצרים. רק אדם. כל טקסט עובר את בדיקת הבלמ״ס לפני שהוא נשמר.</span></div>

    ${ready && list?.length ? html`<section class="sec"><div class="sec-head"><h2>המפתחות שלי</h2></div>
      <div class="group">${list.map((k) => html`<div class="krow" key=${k.id}>
        <span class="hrow-ic"><${Icon} name="key" size=${16} /></span>
        <div class="grow"><strong>${k.label || 'מפתח'}</strong><span class="muted small">נוצר ${ago(k.created_at)}${k.last_used_at ? ` · שימוש אחרון ${ago(k.last_used_at)}` : ' · עוד לא היה בשימוש'}</span></div>
        <button type="button" class="btn sm" onClick=${() => revoke(k)}>ביטול</button>
      </div>`)}</div></section>` : null}
  </div>`;
}
