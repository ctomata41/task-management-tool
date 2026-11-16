// What Jarvis is connected to, and what he may do there. Until Jarvis reports his own connections, this list is kept by
// hand: CHECKED is the day someone last looked, and the screen says so. Two rows are live instead: this system (the
// screen reads it directly) and the personal Google Calendar (m/gcal.js). The brain itself runs on the home computer
// and has no way to report here yet.
//
// state: on (connected), setup (being set up), blocked (set up, but something stops it), off (not connected),
// never (decided against). `reads` is what he sees there, `acts` what he does and under which rule, `missing` the one
// thing that stands between this row and "connected".
export const CHECKED = '2026-11-15';

// The personal voice agent on ElevenLabs. It is a public agent that only talks (no tools), so its id is no secret;
// whoever opens this screen can talk to it. When sign-in arrives, the conversation should start from a signed link.
export const VOICE_AGENT = 'agent_3101m7fw7e6pfkkb4aa3q7b4awsd';
export const VOICE_CLIENT = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm';

export const LINK_STATE = {
  on: { label: 'מחובר', color: 'var(--h-on)' },
  setup: { label: 'בהקמה', color: 'var(--h-risk)' },
  blocked: { label: 'חסום', color: 'var(--h-off)' },
  off: { label: 'לא מחובר', color: 'var(--s-todo)' },
  never: { label: 'לא יחובר', color: 'var(--s-todo)' },
};

export const LINKS = [
  { id: 'platform', name: 'המערכת הזאת', short: 'המערכת', icon: 'layers', state: 'on', live: true,
    reads: 'פרויקטים, משימות, בקשות ותוצרים שמותר לך לראות. פרויקט מוגבל נשאר נעול.',
    acts: 'מציע בלבד. שום דבר לא משתנה בלי ״כן״ שלך.',
    note: 'המסך הזה קורא ישר מהמערכת, שבגרסה הזאת עוד מציגה נתוני דוגמה. המוח במחשב הבית קורא את פלטפורמת הצוות דרך חיבור משלו.' },
  { id: 'gcal', name: 'יומן Google', short: 'יומן', icon: 'calendar', state: 'off', live: true,
    reads: 'האירועים ביומן האישי שלך, כדי לתזמן סביב פגישות.',
    acts: 'לבד: רק ביומן שלו. זימון לאנשים אחרים רק אחרי אישור.',
    note: 'המוח במחשב הבית כבר קורא את היומן דרך חיבור משלו. החיבור כאן הוא כדי שהיומן יוצג גם במסך הזה.',
    missing: 'לחבר את היומן שלך פעם אחת בעמוד היומן.' },
  { id: 'claude', name: 'Claude · המוח', short: 'Claude', icon: 'sparkle', state: 'on',
    reads: 'כל מה ששאר החיבורים נותנים לו, ואת הזיכרון שלו.',
    acts: 'חושב, מסכם ומציע. הוא לא מחליט, לא סוגר ולא מאשר במקום אדם.',
    note: 'רץ ברצף במחשב הבית מאז 15/11 ובודק בעצמו כל עשר דקות עד שעה. הוא עוצר כשהמחשב כבוי או כשהחלון שלו נסגר, ופעם בשבוע מפעילים אותו מחדש.' },
  { id: 'voice', name: 'קול · ElevenLabs', short: 'קול', icon: 'mic', state: 'on',
    reads: 'מה שאומרים לו בשיחה.',
    acts: 'מדבר ועונה בקול, בעברית ובאנגלית. הוא לא מבצע כלום בעצמו: בקשה לפעולה עוברת אל המוח אחרי השיחה, והאישור מתבקש בטלגרם.',
    note: 'מדברים איתו מהכפתור ״לדבר עם ג׳ארביס״ במסך הזה. המוח קורא את השיחה בבדיקה הבאה שלו, או מיד כשכותבים לו בטלגרם ״בדוק קול״.' },
  { id: 'telegram', name: 'Telegram', short: 'טלגרם', icon: 'send', state: 'on',
    reads: 'הודעות שכותבים לו בבוט, רק ממי שאושר.',
    acts: 'כותב רק לך: שלושה תדריכים ביום, תזכורות ובקשות לאישור. אף פעם לא לאנשים אחרים. שקט בין 23:00 ל-07:00.' },
  { id: 'phone', name: 'שיחות טלפון', short: 'טלפון', icon: 'phone', state: 'off',
    reads: 'מה שאומרים לו בשיחה.',
    acts: 'מתקשר אליך עד שלוש פעמים ביום, סביב הפגישות. שקט בין 23:00 ל-07:00.',
    missing: 'מספר טלפון ושירות שיחות. זה עולה כסף ומחכה לאישור שלך על המחיר.' },
  { id: 'gmail', name: 'Gmail', short: 'מייל', icon: 'mail', state: 'setup',
    reads: 'המיילים שלך, כדי לדעת מה מחכה לתשובה.',
    acts: 'מכין טיוטה. שליחה רק אחרי אישור שלך.',
    missing: 'החיבור קיים אצל המוח, אבל הוא עוד לא קרא דרכו מייל בפועל.' },
  { id: 'drive', name: 'Google Drive', short: 'דרייב', icon: 'folder', state: 'setup',
    reads: 'מסמכים וטבלאות, וביניהם טבלת האנשים.',
    acts: 'קורא. כתיבה רק במקומות שהוגדרו לו.',
    missing: 'החיבור קיים אצל המוח, אבל הוא עוד לא קרא דרכו קובץ בפועל.' },
  { id: 'memory', name: 'זיכרון', short: 'זיכרון', icon: 'bulb', state: 'on',
    reads: 'מה שלמד עליך ועל העבודה, בכספת פתקים משלו.',
    acts: 'כותב לבד, רק לזיכרון שלו.',
    note: 'הכספת במחשב הבית, והמוח כותב אליה בכל בדיקה. שיחות קוליות קודמות עוד לא נכנסות אליה.' },
  { id: 'whatsapp', name: 'WhatsApp', short: 'וואטסאפ', icon: 'chat', state: 'never',
    reads: 'כלום.',
    acts: 'כלום.',
    note: 'הוחלט לא לחבר את הוואטסאפ האישי. ההודעות עוברות בטלגרם.' },
];

// The calendar's row follows the real connection on this device.
const GCAL = {
  on: { state: 'on' },
  loading: { state: 'off', missing: 'בודק את החיבור…' },
  signin: { state: 'off', missing: 'נכנסים פעם אחת לצוות בדפדפן הזה, ואז מחברים את היומן בעמוד היומן.' },
  connect: { state: 'off' },
  elsewhere: { state: 'setup', missing: 'היומן מחובר ממכשיר אחר. כדי לראות אותו גם כאן, מחברים שוב בעמוד היומן.' },
  setup: { state: 'off', missing: 'חיבור יומן גוגל עוד לא הוגדר לצוות.' },
  error: { state: 'blocked', missing: 'החיבור ליומן נכשל. אפשר לנסות שוב בעמוד היומן.' },
};

export function links(gcalState) {
  return LINKS.map((l) => (l.id === 'gcal' ? { ...l, ...(GCAL[gcalState] || {}) } : l));
}
export const connected = (list) => list.filter((l) => l.state === 'on').length;
export const linkable = (list) => list.filter((l) => l.state !== 'never').length;
