// What Jarvis is connected to, and what he may do there. Until Jarvis reports his own connections, this list is kept by
// hand: CHECKED is the day someone last looked, and the screen says so. Two rows are live instead: this system (the
// screen reads it directly) and the personal Google Calendar (m/gcal.js).
//
// state: on (connected), setup (being set up), blocked (set up, but something stops it), off (not connected),
// never (decided against). `reads` is what he sees there, `acts` what he does and under which rule, `missing` the one
// thing that stands between this row and "connected".
export const CHECKED = '2026-11-15';

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
    note: 'המסך הזה קורא ישר מהמערכת. המוח של ג׳ארביס במחשב הבית עוד לא מחובר אליה.' },
  { id: 'gcal', name: 'יומן Google', short: 'יומן', icon: 'calendar', state: 'off', live: true,
    reads: 'האירועים ביומן האישי שלך, כדי לתזמן סביב פגישות.',
    acts: 'לבד: רק ביומן שלו. זימון לאנשים אחרים רק אחרי אישור.',
    missing: 'לחבר את היומן שלך פעם אחת בעמוד היומן.' },
  { id: 'claude', name: 'Claude · המוח', short: 'Claude', icon: 'sparkle', state: 'setup',
    reads: 'כל מה ששאר החיבורים נותנים לו, ואת הזיכרון שלו.',
    acts: 'חושב, מסכם ומציע. הוא לא מחליט, לא סוגר ולא מאשר במקום אדם.',
    missing: 'התיקייה מוכנה במחשב הבית. נשאר להשאיר אותו רץ ברצף.' },
  { id: 'voice', name: 'קול · ElevenLabs', short: 'קול', icon: 'mic', state: 'setup',
    reads: 'מה שאומרים לו בשיחה.',
    acts: 'מדבר ועונה בקול. לפני כל שינוי הוא אומר מה יעשה ומחכה ל״כן״.',
    missing: 'הסוכן הקולי קיים ועונה בעברית ובאנגלית. נשאר לחבר אותו למסך הזה ולמוח.' },
  { id: 'telegram', name: 'Telegram', short: 'טלגרם', icon: 'send', state: 'setup',
    reads: 'הודעות שכותבים לו בבוט.',
    acts: 'כותב רק לך: תזכורות ועדכונים. אף פעם לא לאנשים אחרים.',
    missing: 'ליצור את הבוט ולהזין את המפתח שלו במחשב הבית.' },
  { id: 'phone', name: 'שיחות טלפון', short: 'טלפון', icon: 'phone', state: 'off',
    reads: 'מה שאומרים לו בשיחה.',
    acts: 'מתקשר אליך עד שלוש פעמים ביום, סביב הפגישות. שקט בין 23:00 ל-07:00.',
    missing: 'מספר טלפון ושירות שיחות. מחכה לקול.' },
  { id: 'gmail', name: 'Gmail', short: 'מייל', icon: 'mail', state: 'off',
    reads: 'המיילים שלך, כדי לדעת מה מחכה לתשובה.',
    acts: 'מכין טיוטה. שליחה רק אחרי אישור שלך.',
    missing: 'לחבר את חשבון הגוגל למוח במחשב הבית.' },
  { id: 'drive', name: 'Google Drive', short: 'דרייב', icon: 'folder', state: 'off',
    reads: 'מסמכים וטבלאות, וביניהם טבלת האנשים.',
    acts: 'קורא. כתיבה רק במקומות שהוגדרו לו.',
    missing: 'לחבר את חשבון הגוגל למוח במחשב הבית.' },
  { id: 'memory', name: 'זיכרון', short: 'זיכרון', icon: 'bulb', state: 'setup',
    reads: 'מה שלמד עליך ועל העבודה, בכספת פתקים משלו.',
    acts: 'כותב לבד, רק לזיכרון שלו.',
    missing: 'הכספת מוכנה. היא מתמלאת כשהמוח מתחיל לרוץ.' },
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
