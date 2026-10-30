// The project's ID card: the stage library and the project types, and every rule that turns what people did into the
// status the commander sees. Pure functions with no DOM or store, so the same rules run in the browser and in the tests.
//
// The card has four parts (the spec's main chapter): a core of five fields, the stage path, the weekly state (hill,
// confidence, "needs a senior") and a log of decisions and assumptions. Status is never typed in: it is worked out here.
//
// A type is the DNA a project starts from: its stages (each with an exit question, a gate, usual days and fields), its
// own facts, hints for the core fields, where its materials may live, a default pyramid domain, readiness (TRL) and,
// for the Claude type, a link out. A new project copies all of it; from then on the project is its own card. The
// team's edits to types are merged over the code by library(lib); nothing here reads a library by default.

export const DAY = 864e5;

// One question to leave each stage, and the few fields the stage fills on the card. `gate: 'commander'` means closing
// the stage waits for the commander; everything else the project manager closes alone.
export const STAGES = {
  scope: { name: 'תיחום', exit: 'אפשר להסביר במשפט אחד מה בפנים ומה בחוץ?', fields: ['גבולות'], gate: 'manager' },
  research: { name: 'מחקר', exit: 'יודעים מה קיים היום ומה המגבלות שלו?', fields: ['פתרונות קיימים', 'מקורות'], gate: 'manager' },
  need: { name: 'צורך ומיקודו', exit: 'הדורש מסכים שזה הצורך שלו?', fields: ['הצורך במשפט', 'הדורש'], gate: 'manager' },
  req: { name: 'דמ"צ', exit: 'המסמך כתוב ומוסכם עם הדורש?', fields: ['קישור למסמך'], gate: 'manager' },
  spec: { name: 'אפיון', exit: 'מי שיבנה יכול להתחיל בלי שאלות פתוחות מהותיות?', fields: ['מסמך אפיון', 'מדדי הצלחה'], gate: 'manager' },
  resources: { name: 'משאבים', exit: 'יש תקציב, אנשים וזמן מאושרים?', fields: ['תקציב', 'אנשים', 'לוח זמנים'], gate: 'commander' },
  mvp: { name: 'MVP', exit: 'הגרסה הקטנה עובדת ועונה על הצורך המרכזי?', fields: ['מה נלמד'], gate: 'manager' },
  pilot: { name: 'פיילוט', exit: 'משתמשים אמיתיים השתמשו, ומדד ההצלחה נמדד?', fields: ['איפה ועם מי', 'מדד', 'תוצאה'], gate: 'commander' },
  production: { name: 'פרודקשן', exit: 'המערכת יציבה ויש מי שמתחזק אותה?', fields: ['בעל תחזוקה'], gate: 'commander' },
  adoption: { name: 'הנבטה', exit: 'המשתמשים עובדים עם זה בלי הצוות?', fields: ['מדד אימוץ'], gate: 'manager' },
  findings: { name: 'מסקנות', exit: 'המסקנות כתובות והועברו למי שצריך אותן?', fields: ['למי הועבר'], gate: 'manager' },
  plan: { name: 'תוכנית', exit: 'יש תוכנית עבודה שמי שמבצע מכיר?', fields: ['קישור לתוכנית'], gate: 'manager' },
};

// The general types ("סוגים כלליים"). Their ids and paths stay as they were: p.template is the type id.
export const TEMPLATES = [
  { id: 'rnd', name: 'מו"פ טכנולוגי', hint: 'מתחום ועד הנבטה, עם רמת מוכנות טכנולוגית', stages: ['scope', 'research', 'need', 'req', 'spec', 'resources', 'mvp', 'pilot', 'production', 'adoption'], trl: true, trlTarget: null },
  { id: 'tool', name: 'כלי או מערכת', hint: 'בלי מחקר מעמיק. לכלי עם Claude יש סוג משלו', stages: ['scope', 'need', 'spec', 'resources', 'mvp', 'pilot', 'adoption'] },
  { id: 'study', name: 'מחקר בלבד', hint: 'תיחום, מחקר ומסקנות', stages: ['scope', 'research', 'findings'] },
  { id: 'process', name: 'תהליך ארגוני', hint: 'צורך, תוכנית, פיילוט והנבטה', stages: ['need', 'plan', 'pilot', 'adoption'] },
  { id: 'blank', name: 'בונים לבד', hint: 'בלי שלבים מראש. מוסיפים מהספרייה', stages: [] },
];

export const HILL = {
  up: { label: 'עוד מבררים איך', short: 'מבררים' },
  top: { label: 'יודעים מה לעשות', short: 'יודעים' },
  down: { label: 'מסיימים', short: 'מסיימים' },
};
export const CONFIDENCE = {
  on: { label: 'במסלול', color: 'var(--h-on)' },
  risk: { label: 'בסיכון', color: 'var(--h-risk)' },
  stuck: { label: 'תקוע', color: 'var(--h-off)' },
};
export const GATE_CHOICES = {
  next: { label: 'להמשיך לשלב הבא', icon: 'check' },
  back: { label: 'לחזור לשלב קודם', icon: 'undo' },
  hold: { label: 'להשהות', icon: 'pause' },
  stop: { label: 'לעצור את הפרויקט', icon: 'octagon' },
};
export const CLASSIFICATION = {
  open: { label: 'בלמ"ס', hint: 'כל החומרים לא מסווגים ונשמרים כאן' },
  restricted: { label: 'שמור / סודי', hint: 'כאן רק הניהול. החומרים נשארים ברשת המסווגת' },
};

const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const trlOk = (n) => Number.isInteger(n) && n >= 1 && n <= 9;
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
};

// ---------- the pyramid: where a project sits (Yahali's numbering, 1 to 4, then the two side areas) ----------
export const DOMAINS = [
  { id: 'concepts', n: 1, name: 'תפיסות', hint: 'הראייה האסטרטגית: לאן כדאי ללכת ולמה' },
  { id: 'infra', n: 2, name: 'תשתיות טכנולוגיות', hint: 'יכולות בסיס שכל השאר נשען עליהן' },
  { id: 'blocks', n: 3, name: 'אבני בניין טכנולוגיות לחלל', hint: 'טכנולוגיות שמבשילות לבניין הכוח. הבסיס האסטרטגי' },
  { id: 'demos', n: 4, name: 'בדה"ת והדגמות בחלל', hint: 'בדיקות היתכנות, הדגמות יכולת ואפליקציות בחלל' },
  { id: 'ecosystem', side: true, name: 'אקוסיסטם דו-שימושי', hint: 'אקדמיה, תעשייה וסטארט-אפים שמגדילים את מה שאפשר' },
  { id: 'g2g', side: true, name: 'מימון G2G', hint: 'מימון בהסכמים בין ממשלות' },
];
export const PYRAMID_ORDER = ['concepts', 'infra', 'blocks', 'demos', 'ecosystem', 'g2g']; // then "בלי רובד"
export const NO_DOMAIN = 'בלי רובד';
export const domainName = (id) => DOMAINS.find((d) => d.id === id)?.name || NO_DOMAIN;
export const domainTitle = (id) => { const d = DOMAINS.find((x) => x.id === id); return !d ? NO_DOMAIN : d.n ? `${d.n} · ${d.name}` : d.name; };
const domainOk = (d) => d === null || DOMAINS.some((x) => x.id === d);

// ---------- where the materials live, and the level that follows ----------
// /m/ itself is always בלמ"ס: the place describes the project, not what may enter here.
export const PLACES = {
  here: { label: 'הכול כאן', hint: 'בלמ"ס. כל החומרים לא מסווגים ונשמרים כאן', level: 'open' },
  both: { label: 'חלק כאן, חלק ברשת המסווגת', hint: 'שמור / סודי. כאן הניהול והחומר הבלמ"ס, השאר שם', level: 'restricted' },
  there: { label: 'הכול ברשת המסווגת', hint: 'שמור / סודי. כאן רק שכבת הניהול', level: 'restricted' },
};
export const PLACE_ORDER = ['here', 'both', 'there']; // from open to closed; "no lower than" compares indexes
export const placesFor = (t) => (t && t.places) || PLACE_ORDER;
export const stricterPlace = (a, b) => (PLACE_ORDER.indexOf(a) >= PLACE_ORDER.indexOf(b) ? a : b);
// The stricter of what the place says and what the level says. An old project has no place; a tab running the old
// build can change one without the other. Every lock reads this, so the stricter answer always wins.
export function placeOf(p) {
  const r = p?.classification === 'restricted';
  const pl = PLACES[p?.place] ? p.place : null;
  if (!pl) return r ? 'both' : 'here';
  return r && pl === 'here' ? 'both' : pl;
}
export const levelOf = (p) => PLACES[placeOf(p)].level;
export const isRestricted = (p) => !!p && levelOf(p) === 'restricted';

// ---------- who sees what ----------
// Decision 1 (design §14): what team members outside a שמור / סודי project see on its one line. true: the current
// stage's name, as today; false: "שלב 3 מתוך 8". The stage name is the only thing on the line a manager types.
export const LOCKED_LINE_SHOWS_STAGE = true;
// `st` is status(p). The second argument is for the tests, which check both answers without touching the switch.
export const lockedWhere = (st, shows = LOCKED_LINE_SHOWS_STAGE) => (shows || !st.n ? st.where : `שלב ${Math.min(st.idx, st.n)} מתוך ${st.n}`);
// 'all' = everything; 'line' = the one line and the locked page; 'none' = nothing (not even in lists). `x` is a person.
export function sees(p, x) {
  if (!p || !x || !x.id) return 'none';
  if (p.personal) return p.personal === x.id ? 'all' : 'none';
  const member = p.manager === x.id || (p.partners || []).includes(x.id);
  if (x.role === 'external') return member && placeOf(p) !== 'there' ? 'all' : 'none';
  if (!isRestricted(p) || member || x.role === 'commander' || x.command) return 'all';
  return 'line';
}
// The "מי רואה" lines, for the opening sheet and the confirm sheet.
export function whoSees(place, shows = LOCKED_LINE_SHOWS_STAGE) {
  if (place === 'here') return ['כל הצוות רואה את הפרויקט.', 'שותפים מבחוץ רק אם הם בפרויקט.'];
  if (!PLACES[place]) return [];
  const both = ['הפיקוד וחברי הפרויקט רואים הכול.',
    shows ? 'לשאר הצוות מוצגת שורה אחת: שם הפרויקט, מי מנהל, השלב והמצב.' : 'לשאר הצוות מוצגת שורה אחת: שם הפרויקט, מי מנהל, מספר השלב והמצב.'];
  return place === 'there' ? [...both, 'שותפים מבחוץ לא רואים את הפרויקט כאן.'] : both;
}
// What moving project p to place `to` does to people, as id lists, each worked out with sees() before and after:
// lose: team members who drop to the one line; outsiders: outside partners who lose all access; regain: outside
// partners who get it back; handed: whoever loses the detail with open tasks there, which go to the manager.
export function levelEffects(p, to, { people = [], tasks = [] } = {}) {
  const out = { lose: [], handed: [], outsiders: [], regain: [] };
  if (!p || !PLACES[to]) return out;
  const next = { ...p, place: to, classification: PLACES[to].level };
  const before = new Map(people.map((x) => [x.id, sees(p, x)]));
  const after = new Map(people.map((x) => [x.id, sees(next, x)]));
  for (const x of people) {
    const b = before.get(x.id);
    const a = after.get(x.id);
    if (x.role === 'external') {
      if (b === 'all' && a === 'none') out.outsiders.push(x.id);
      if (b === 'none' && a === 'all') out.regain.push(x.id);
    } else if (b === 'all' && a === 'line') out.lose.push(x.id);
  }
  const owners = new Set(tasks.filter((t) => t.project === p.id && t.status !== 'done' && !t.ask && t.owner
    && before.get(t.owner) === 'all' && after.get(t.owner) !== 'all').map((t) => t.owner));
  out.handed = people.filter((x) => owners.has(x.id)).map((x) => x.id);
  return out;
}
const isClaudeType = (t) => !!t && (t.id === 'claude' || t.link === 'next');
const onlyThere = (t) => placesFor(t).length === 1 && placesFor(t)[0] === 'there';
// Why place `pl` is not open to type t (or below a linked בדה"ת's minimum), or null when it is.
export function placeRefusal(t, pl, { minPlace = null } = {}) {
  if (!PLACES[pl] || !placesFor(t).includes(pl)) {
    if (isClaudeType(t)) return 'כלי עם Claude נשאר בלמ"ס. לחלק מסווג פותחים פרויקט נפרד';
    if (onlyThere(t)) return 'בסוג הזה הכול ברשת המסווגת';
    return 'הסוג הזה לא מאפשר את זה';
  }
  if (PLACES[minPlace] && PLACE_ORDER.indexOf(pl) < PLACE_ORDER.indexOf(minPlace)) return `לא נמוך יותר מאבן הבניין: ${PLACES[minPlace].label}`;
  return null;
}
// Moving a project to another place. Raising (and a move between both and there) is the manager's; lowering to בלמ"ס
// is the commander's, with a reason. `why` may hold {commander}, which the store fills in.
export function placeRule(p, to, { type = null, byCommander = false, manages = false } = {}) {
  if (!p) return { ok: false, why: '' };
  if (p.personal) return { ok: false, why: 'פרויקט אישי תמיד בלמ"ס' };
  if (!manages && !byCommander) return { ok: false, why: 'רק בניהול הפרויקט אפשר לשנות את זה' };
  const no = placeRefusal(type, to);
  if (no) return { ok: false, why: no };
  if (isRestricted(p) && PLACES[to].level === 'open' && !byCommander) return { ok: false, why: 'להורדה לבלמ"ס צריך את {commander}' };
  if ((p.phase === 'stopped' || p.phase === 'done') && !byCommander) return { ok: false, why: 'הפרויקט סגור' };
  return { ok: true, why: '' };
}

// ---------- the types ----------
// The four core fields, with their default hints. A type's `hints` replace them one by one.
export const CORE = [
  { key: 'what', label: 'מה ולמה', hint: 'מה מנסים לעשות, ומה ישתנה אם נצליח. משפט אחד, בלי ז׳רגון' },
  { key: 'forWhom', label: 'למי', hint: 'הדורש או הלקוח, ומי ישתמש בתוצר' },
  { key: 'success', label: 'איך נדע שהצלחנו', hint: 'המבחן בסוף. אפשר למלא עד סוף התיחום' },
  { key: 'stopRule', label: 'תנאי עצירה', hint: 'אם עד תאריך X לא קרה Y, עוצרים או משנים כיוון' },
];
export const coreHint = (t, key) => str(t?.hints?.[key]) || CORE.find((f) => f.key === key)?.hint || '';
export const TRL_HINT = 'TRL נכון לשימוש ולסביבה מסוימים. שימוש חדש יכול להוריד אותו.';
export const VALLEY_TRL = 5; // from here a building block needs a body that will take it

const C = (label) => ({ label, where: 'classified' }); // a field that starts on the classified network
// The CTO types. Their new stages are written out here (Option B): no inline key is a key of STAGES, and no two types
// share one, so editing a stage in one type never changes another (tested).
export const CTO_TYPES = [
  {
    id: 'block', name: 'אבן בניין טכנולוגית', hint: 'מסימן ראשון להבשלה ועד חיבור לפרויקט במנהלת', cto: true,
    domain: 'blocks', place: 'both', places: ['here', 'both', 'there'],
    why: 'הטכנולוגיה יכולה להיות בלמ"ס, אבל הצורך המבצעי והתקציב נשארים ברשת המסווגת',
    trl: true, trlTarget: 6,
    stages: [
      { key: 'signal', name: 'אות בשלות', exit: 'יש סימן ממשי שהטכנולוגיה מבשילה, וגוף מו"פ שרואה אותו גם?', gate: 'manager', days: 21, fields: ['מה השתנה', 'שותף המו"פ'] },
      { key: 'refine', name: 'דיוק', exit: 'אפשר להסביר במשפט מה אבן הבניין, מה היא תאפשר ומה בחוץ?', gate: 'manager', days: 21, fields: ['מה זה מכפיל', 'גבולות'] },
      { key: 'crossneed', name: 'הצלבה עם הצורך', exit: 'גורם מבצעי מכיר בצורך שאבן הבניין עונה עליו?', gate: 'manager', days: 30, fields: [C('הצורך המבצעי'), 'הדורש'] },
      { key: 'matplan', name: 'תוכנית הבשלה', exit: 'יש מסלול מהמוכנות של היום עד היעד, עם מי שמבצע ומי שמממן?', gate: 'commander', days: 30, fields: ['המסלול: קרקע, בדה"ת או שניהם', C('תקציב ומימון')] },
      { key: 'ground', name: 'הבשלה בקרקע', exit: 'הפונקציה הקריטית עבדה בסביבה רלוונטית, כמו שחזינו?', gate: 'manager', days: 180, fields: ['מה נבדק', C('תוצאה מול התחזית')] },
      { key: 'flight', name: 'בדה"ת בחלל', exit: 'בדיקת ההיתכנות בחלל הסתיימה, והתוצאה וההמלצה חזרו לכאן?', gate: 'manager', days: 365, fields: ['ההמלצה שחזרה', 'מה זה משנה כאן'] },
      { key: 'transfer', name: 'חיבור ליעד', exit: 'גוף במנהלת התחייב בכתב לקלוט את אבן הבניין, כולל כסף ולוח זמנים?', gate: 'commander', days: 60, fields: ['הגוף הקולט', C('מסמך ההתחייבות')] },
      { key: 'handover', name: 'מסירה ולמידה', exit: 'הגוף הקולט ממשיך בלעדינו, ומה שלמדנו כתוב?', gate: 'manager', days: 21, fields: ['מי מחזיק עכשיו', 'מה למדנו'] },
    ],
    facts: [
      { key: 'target', label: 'היעד', kind: 'choice', options: [{ id: 'existing', label: 'פרויקט גדול קיים במנהלת' }, { id: 'new', label: 'פרויקט בניין כוח חדש' }], hint: 'לאן אבן הבניין אמורה להיכנס בסוף' },
      { key: 'commit', label: 'מחויבות היעד', kind: 'choice', options: [{ id: 'none', label: 'אין עדיין' }, { id: 'interest', label: 'עניין' }, { id: 'intent', label: 'כוונה' }, { id: 'commitment', label: 'התחייבות' }],
        hint: 'עניין: יש גוף שרוצה להמשיך לשמוע. כוונה: הגוף מתכנן לקלוט ומכין תקציב. התחייבות: יש מסמך חתום עם כסף ולוח זמנים.' },
    ],
    hints: {
      what: 'איזו יכולת אבן הבניין נותנת למנהלת, ולמה עכשיו',
      forWhom: 'הגוף המבצעי שצריך את זה, והגוף שיקלוט',
      success: 'הגענו למוכנות היעד, וגוף במנהלת התחייב לקלוט',
      stopRule: 'למשל: אם בסוף ההבשלה בקרקע אין גוף שמתכוון לקלוט, עוצרים או משנים כיוון',
    },
  },
  {
    id: 'bdt', name: 'בדה"ת בחלל', hint: 'בדיקת היתכנות במסלול, מההגדרה ועד התוצאות', cto: true,
    domain: 'demos', place: 'both', places: ['here', 'both', 'there'],
    why: 'מה מוכיחים, התקציב ומועד השיגור נשארים ברשת המסווגת',
    trl: true, trlTarget: 7,
    stages: [
      { key: 'define', name: 'הגדרת הניסוי', exit: 'הוגדר בכתב מה הניסוי צריך להוכיח, איך מודדים את זה במסלול ומה נחשב הצלחה?', gate: 'manager', days: 21, fields: [C('מה מוכיחים'), C('מדד הצלחה במסלול')] },
      { key: 'ride', name: 'הזדמנות טיסה', exit: 'יש דרך ממשית לעלות לחלל, ומי שבונה ומפעיל את הניסוי?', gate: 'manager', days: 60, fields: ['הבונה והמפעיל', C('חלון שיגור משוער')] },
      { key: 'fund', name: 'משאבים והתחייבות', exit: 'תקציב, הסכמים ולוח זמנים מאושרים אצל כל הצדדים?', gate: 'commander', days: 45, fields: [C('תקציב'), 'מקור מימון', 'ההסכמים'] },
      { key: 'design', name: 'תכן', exit: 'התכן עבר סקר תכן קריטי בלי פריטים פתוחים מהותיים?', gate: 'manager', days: 120, fields: ['סקר תכן מקדים', 'סקר תכן קריטי', 'פריטים פתוחים'] },
      { key: 'build', name: 'בנייה ובדיקות', exit: 'יחידת הטיסה עברה בדיקות סביבה ואושרה לטיסה?', gate: 'commander', days: 180, fields: [C('בדיקות סביבה'), 'רישוי תדרים', 'אישור לטיסה'] },
      { key: 'launch', name: 'שיגור והפעלה', exit: 'הניסוי במסלול, מתקשר עם הקרקע ועובד?', gate: 'manager', days: 30, fields: [C('תאריך שיגור'), 'מצב אחרי ההפעלה'] },
      { key: 'ops', name: 'ניסוי במסלול', exit: 'נאספו הנתונים שהוגדרו בשלב הראשון?', gate: 'manager', days: 120, fields: [C('מה נמדד'), C('חריגות')] },
      { key: 'results', name: 'תוצאות והמלצה', exit: 'התוצאות כתובות, המוכנות עודכנה, וההמלצה הועברה למי שמחכה לה?', gate: 'manager', days: 30, fields: ['מה יצא', 'למי הועבר'] },
    ],
    facts: [
      { key: 'flightKind', label: 'סוג הטיסה', kind: 'choice', options: [{ id: 'hosted', label: 'מטען מתארח' }, { id: 'rideshare', label: 'שיגור משותף' }, { id: 'smallsat', label: 'לוויין קטן ייעודי' }, { id: 'station', label: 'תחנת חלל' }, { id: 'suborbital', label: 'טיסה תת-מסלולית' }], hint: 'איך הניסוי עולה לחלל' },
      { key: 'rec', label: 'ההמלצה', kind: 'choice', options: [{ id: 'go', label: 'להמשיך' }, { id: 'change', label: 'לשנות' }, { id: 'stop', label: 'לעצור' }], hint: 'מה ממליצים בסוף, למי שמחכה לתוצאה' },
    ],
    hints: {
      what: 'מה הניסוי בודק בחלל, ומה נדע אחריו שלא ידענו',
      forWhom: 'אבן הבניין או הפרויקט שמחכים לתוצאה',
      success: "המדידה במסלול הראתה את מה שהוגדר מראש. גם 'לא' ברור הוא הצלחה",
      stopRule: 'למשל: אם עד הסקר הקריטי אין חלון שיגור, משהים',
    },
  },
  {
    id: 'claude', name: 'כלי עם Claude', hint: 'בלמ"ס מלא. העבודה עצמה בפלטפורמה המחוברת', cto: true,
    domain: null, place: 'here', places: ['here'],
    why: 'Claude מקבל רק בלמ"ס',
    link: 'next',
    stages: [
      'need',
      { key: 'data', name: 'מידע והרשאות', exit: 'ברור איזה מידע נכנס לכלי ול-Claude, ושאין בו מידע מסווג או אישי?', gate: 'commander', days: 7, fields: ['אילו נתונים', 'מי רואה מה', 'מי אישר'] },
      'mvp', 'pilot', 'adoption',
    ],
    facts: [],
    hints: {
      what: 'מה הכלי עושה, ומה ישתנה למי שישתמשו בו',
      forWhom: 'מי ישתמשו בכלי, ומי הדורש',
      success: 'למשל: כמה אנשים משתמשים בו כל שבוע אחרי חודש',
      stopRule: 'למשל: אם אחרי שבועיים של פיילוט אף אחד לא חוזר אליו, עוצרים',
    },
  },
  {
    id: 'secret', name: 'פרויקט ברשת המסווגת', hint: 'כאן רק שכבת הניהול. כל השאר ברשת המסווגת', cto: true,
    domain: null, place: 'there', places: ['there'],
    why: 'בסוג הזה כל התוכן נשאר ברשת המסווגת',
    stages: [
      'scope', 'resources',
      { key: 'execute', name: 'ביצוע', exit: 'התוצר המרכזי מוכן?', gate: 'manager', days: 90, fields: ['מצביע לתוצר'] },
      { key: 'deliver', name: 'מסירה', exit: 'התוצר נמסר למי שצריך אותו?', gate: 'manager', days: 21, fields: ['למי נמסר'] },
      'findings',
    ],
    facts: [],
    hints: { what: 'משפט אחד בלמ"ס: מה הפרויקט, בלי פרטים' },
  },
];

// ---------- the team's edits: m.lib, merged over the code ----------
// { v: 1, types: { [id]: an override of a code type's editable keys | a whole team type (team: true) }, log: [...] }
export const EMPTY_LIB = Object.freeze({ v: 1, types: Object.freeze({}), log: Object.freeze([]) });
// What the team may change on a type. For a code type, id, places, link and cto always come from the code, so no
// edit can let the Claude type go classified or the classified-network type go בלמ"ס.
export const EDITABLE_KEYS = ['name', 'hint', 'domain', 'place', 'why', 'trl', 'trlTarget', 'stages', 'facts', 'hints', 'hidden'];
const CODE_TYPES = [...CTO_TYPES, ...TEMPLATES];
const CODE_IDS = new Set(CODE_TYPES.map((t) => t.id));
// A gate is one of two values. One that isn't (a broken edit, or a value from a later build) reads as the stricter one.
const gateOf = (d) => (d.gate === 'manager' || d.gate === 'commander' ? d.gate : STAGES[d.key]?.gate || 'commander');
const cleanField = (f) => {
  if (typeof f === 'string') return f.trim() || null;
  if (!isObj(f) || !str(f.label)) return null;
  return f.where === 'classified' ? { label: str(f.label), where: 'classified' } : str(f.label);
};
function cleanStageDef(d) {
  if (typeof d === 'string') return STAGES[d] ? d : null;
  if (!isObj(d)) return null;
  const key = str(d.key);
  const name = str(d.name) || STAGES[key]?.name || '';
  if (!key || !name) return null;
  const out = { key, name, exit: typeof d.exit === 'string' ? d.exit.trim() : STAGES[key]?.exit || '', gate: gateOf({ ...d, key }),
    fields: Array.isArray(d.fields) ? d.fields.map(cleanField).filter(Boolean) : [] };
  if (Number.isInteger(d.days) && d.days >= 1 && d.days <= 730) out.days = d.days;
  return out;
}
function cleanFactDef(f) {
  if (!isObj(f) || !str(f.label)) return null;
  const out = {};
  if (str(f.key)) out.key = str(f.key);
  Object.assign(out, { label: str(f.label), hint: typeof f.hint === 'string' ? f.hint.trim() : '', kind: 'text' });
  if (f.kind === 'choice' && Array.isArray(f.options)) {
    const seen = new Set();
    const options = [];
    for (const o of f.options) {
      const id = isObj(o) ? str(o.id) : '';
      if (!id || !str(o.label) || seen.has(id)) continue;
      seen.add(id);
      options.push({ id, label: str(o.label) });
    }
    if (options.length) Object.assign(out, { kind: 'choice', options });
  }
  if (f.where === 'classified') out.where = 'classified';
  return out;
}
const cleanHints = (h) => Object.fromEntries(CORE.map((f) => f.key).filter((k) => typeof h[k] === 'string').map((k) => [k, h[k].trim()]));
// Each editable key's check: a value, or undefined when the value is broken (then it is dropped).
const CLEAN = {
  name: (v) => str(v) || undefined,
  hint: (v) => (typeof v === 'string' ? v.trim() : undefined),
  domain: (v) => (domainOk(v) ? v : undefined),
  place: (v) => (v === null || PLACES[v] ? v : undefined),
  why: (v) => (typeof v === 'string' ? v.trim() : undefined),
  trl: (v) => (typeof v === 'boolean' ? v : undefined),
  trlTarget: (v) => (v === null || trlOk(v) ? v : undefined),
  stages: (v) => (Array.isArray(v) ? v.map(cleanStageDef).filter(Boolean) : undefined),
  facts: (v) => (Array.isArray(v) ? v.map(cleanFactDef).filter(Boolean) : undefined),
  hints: (v) => (isObj(v) ? cleanHints(v) : undefined),
  hidden: (v) => (typeof v === 'boolean' ? v : undefined),
};
const cleanPlaces = (v) => { const ok = Array.isArray(v) ? PLACE_ORDER.filter((x) => v.includes(x)) : []; return ok.length ? ok : [...PLACE_ORDER]; };
// One type, checked value by value: a code type with the team's override `t` on top (code given), or a team type
// (code null). A broken value is dropped and never throws. A team type's places are a non-empty subset of the three;
// its link is only ever the one the Claude type has ('next'), which its copy keeps.
export function cleanType(t, code = null) {
  const src = isObj(t) ? t : {};
  const out = code ? clone(code) : { id: str(src.id), cto: true, team: true, places: cleanPlaces(src.places) };
  if (!out.id) return null;
  for (const k of EDITABLE_KEYS) {
    if (!(k in src) || k === 'place') continue;
    const v = CLEAN[k](src[k]);
    if (v !== undefined) out[k] = v;
  }
  if ('place' in src) { const v = CLEAN.place(src.place); if (v === null || (v !== undefined && placesFor(out).includes(v))) out.place = v; }
  if (out.place != null && !placesFor(out).includes(out.place)) out.place = null;
  if (!code) {
    if (src.link === 'next') out.link = 'next';
    if (!out.name) return null;
  }
  return out;
}
// The library: the code types (CTO_TYPES, then TEMPLATES), each with the team's override on top, then the team's own
// types. Pure, and memoized on the lib object (every edit replaces it), so the same lib gives the very same result.
// The result is frozen: nothing reads it and writes back.
const LIBS = new WeakMap();
export function library(lib) {
  const src = isObj(lib) ? lib : EMPTY_LIB;
  const hit = LIBS.get(src);
  if (hit) return hit;
  const over = isObj(src.types) ? src.types : {};
  const safe = (f, fallback) => { try { return f() || fallback; } catch (e) { return fallback; } };
  const code = CODE_TYPES.map((t) => safe(() => cleanType(isObj(over[t.id]) ? over[t.id] : {}, t), clone(t)));
  const team = Object.keys(over).filter((id) => !CODE_IDS.has(id) && isObj(over[id]) && over[id].team)
    .map((id) => safe(() => cleanType({ ...over[id], id }, null), null)).filter(Boolean);
  const L = deepFreeze({ types: [...code, ...team] });
  LIBS.set(src, L);
  return L;
}
export const typeById = (L, id) => (L?.types || []).find((t) => t.id === id) || null;
export const typeOf = (L, p) => typeById(L, p?.template);
// The types offered when opening a project: the CTO types in code order, the team's types, then the general types.
export function openTypes(L) {
  const ts = (L?.types || []).filter((t) => !t.hidden);
  return [...ts.filter((t) => t.cto && !t.team), ...ts.filter((t) => t.team), ...ts.filter((t) => !t.cto && !t.team)];
}
const resolveStage = (k) => (STAGES[k] ? { key: k, name: STAGES[k].name, exit: STAGES[k].exit, gate: STAGES[k].gate, days: STAGE_DAYS[k] || 14, fields: [...STAGES[k].fields] } : null);
// A type's path as full stage definitions: a classic key reads STAGES, an inline definition stands as it is.
export function typeStages(t) {
  return (Array.isArray(t?.stages) ? t.stages : []).map((d) => {
    if (typeof d === 'string') return resolveStage(d);
    if (!isObj(d) || !d.key || !d.name) return null;
    return { key: d.key, name: d.name, exit: d.exit || '', gate: gateOf(d), days: d.days || STAGE_DAYS[d.key] || 14,
      fields: (Array.isArray(d.fields) ? d.fields : []).map((f) => (isObj(f) ? { ...f } : f)) };
  }).filter(Boolean);
}
// Every stage one can add: type t's own, then the classic ones, then those of the other visible types; by key, the
// first one wins. Type t's own include its code path, so a stage the team took off a code type's path stays in its
// library (the edited type is t, and the other types leave t out).
export function stageLibrary(L, t) {
  const seen = new Set();
  const out = [];
  const add = (d) => { if (d && !seen.has(d.key)) { seen.add(d.key); out.push(d); } };
  typeStages(t).forEach(add);
  typeStages(CODE_TYPES.find((x) => x.id === t?.id)).forEach(add);
  Object.keys(STAGES).forEach((k) => add(resolveStage(k)));
  openTypes(L).filter((x) => !t || x.id !== t.id).forEach((x) => typeStages(x).forEach(add));
  return out;
}
export const gateCount = (t) => typeStages(t).filter((s) => s.gate === 'commander').length;
// The labels a type keeps on the classified network: its stage fields, then its facts, marked where: 'classified'.
export const classifiedLabels = (t) => [
  ...typeStages(t).flatMap((s) => s.fields.filter((f) => isObj(f) && f.where === 'classified').map((f) => f.label)),
  ...(t?.facts || []).filter((f) => f.where === 'classified').map((f) => f.label),
];
// Whether a change to a type may go in: only editable keys; a place the type allows (for a code type, its code
// places); and lowering a commander gate, or removing a stage that has one, only by the commander.
export function checkTypePatch(code, current, patch, byCommander = false) {
  if (!isObj(patch) || Object.keys(patch).some((k) => !EDITABLE_KEYS.includes(k))) return { ok: false, why: '' };
  if (patch.place != null && !placesFor(code || current).includes(patch.place)) return { ok: false, why: 'הסוג הזה לא מאפשר את זה' };
  if ('stages' in patch && !byCommander) {
    const gates = (list) => {
      const m = new Map();
      for (const s of typeStages({ stages: Array.isArray(list) ? list : [] })) if (s.gate === 'commander') m.set(s.key, (m.get(s.key) || 0) + 1);
      return m;
    };
    const now = gates(patch.stages);
    for (const [k, n] of gates(current?.stages)) if ((now.get(k) || 0) < n) return { ok: false, why: 'רק באישור {commander} אפשר להוריד שער או להסיר שלב עם שער' };
  }
  return { ok: true, why: '' };
}
// Why type t does not fit project p's place (for the type menu on the card), or null when it fits.
export function typeFitWhy(t, p) {
  if (!t || placesFor(t).includes(placeOf(p))) return null;
  if (isClaudeType(t)) return 'הסוג הזה לא מתאים לפרויקט שמור / סודי';
  if (onlyThere(t)) return "קודם מעבירים את הפרויקט ל'הכול ברשת המסווגת'";
  return 'הסוג הזה לא מאפשר את זה';
}

// ---------- making a project from a type ----------
// A fresh stage: from a stage definition (an object), from a classic key, or a custom stage by name. In a restricted
// project, fields defined as classified start marked; in a "there" project every field does. Field ids are
// `${stage id}f${index}`, the same ids the v4 migration gives older stages.
export function makeStage(keyOrDef, name, { restricted = false, there = false } = {}) {
  const def = isObj(keyOrDef) ? keyOrDef : resolveStage(keyOrDef);
  const id = uid('s');
  const fields = (def && Array.isArray(def.fields) ? def.fields : []).map((f, i) => {
    const marked = there || (restricted && isObj(f) && f.where === 'classified');
    return { id: `${id}f${i}`, label: isObj(f) ? f.label : f, value: '', ...(marked ? { classified: true } : {}) };
  });
  return {
    id,
    key: def ? def.key : 'custom',
    name: def ? def.name : name,
    exit: def ? def.exit || '' : '',
    gate: def ? gateOf(def) : 'manager',
    days: def ? def.days || STAGE_DAYS[def.key] || 14 : 14,
    fields,
    state: 'todo', // todo | active | pending (waiting for the commander) | done | skipped
    target: null,
    evidence: [],
    closedAt: null,
  };
}
// A type's path for a new project, its first stage active. An unknown type has no path.
export function stagesFromType(L, id, { place = null } = {}) {
  const t = typeById(L, id);
  if (!t) return [];
  const list = typeStages(t).map((d) => makeStage(d, null, { restricted: PLACES[place]?.level === 'restricted', there: place === 'there' }));
  if (list[0]) list[0].state = 'active';
  return list;
}
// The code's own path for a type id; an unknown id gives no stages (there is no silent fallback to R&D).
export const stagesFromTemplate = (id) => stagesFromType(library(EMPTY_LIB), id);
function makeFact(f, { restricted = false, there = false } = {}) {
  const x = { id: uid('f'), ...(f.key ? { key: f.key } : {}), label: f.label, hint: f.hint || '', kind: f.kind === 'choice' ? 'choice' : 'text' };
  if (x.kind === 'choice') x.options = (f.options || []).map((o) => ({ id: o.id, label: o.label }));
  x.value = '';
  if (there || (restricted && f.where === 'classified')) x.classified = true;
  return x;
}
// What the opening sheet proposes, each with its reason (a "הוצע כי" line without those words): the place, the domain
// and, from a linked בדה"ת, the type. Fixed rules only. This is the one seam an AI suggester could fill later.
export function suggest(L, typeId, preset = null) {
  const t = typeById(L, typeId);
  if (!t) return { place: null, placeWhy: null, domain: null, domainWhy: null, typeWhy: null };
  const mine = !!preset && preset.type === t.id;
  const min = PLACES[preset?.minPlace] ? preset.minPlace : null;
  const allowed = (pl) => !!pl && !placeRefusal(t, pl, { minPlace: min });
  // A reason after "הוצע כי", so a sentence (placeRefusal's short text is for the rows it closes). Not only a בדה"ת:
  // the floor stays when another type is picked in the same sheet.
  const floor = min ? `אבן הבניין ב'${PLACES[min].label}', ולא פותחים ממנה פרויקט נמוך יותר` : null;
  let place = null;
  let placeWhy = null;
  if (mine && allowed(preset.place)) { place = preset.place; placeWhy = place === t.place ? t.why || null : floor; }
  else if (allowed(t.place)) { place = t.place; placeWhy = t.why || null; }
  else if (t.place && min && allowed(stricterPlace(t.place, min))) { place = stricterPlace(t.place, min); placeWhy = floor; }
  const domain = mine && 'domain' in preset ? (domainOk(preset.domain) ? preset.domain : null) : t.domain ?? null;
  const domainWhy = domain && domain === t.domain ? `זה הרובד הרגיל של '${t.name}'` : null;
  const typeWhy = mine && preset.parent ? `הפרויקט נפתח מתוך '${preset.parentName || ''}'` : null;
  return { place, placeWhy, domain, domainWhy, typeWhy };
}
// Everything a new project takes from its type, from template to parent. null (a refusal) for an unknown type, no
// place, a place the type does not allow, or one below minPlace. It never lowers a place.
export function newProjectParts(L, typeId, { place, domain, link, parent, trl, minPlace, origin } = {}) {
  const t = typeById(L, typeId);
  if (!t) return null;
  const pl = place || t.place;
  if (!pl || placeRefusal(t, pl, { minPlace })) return null;
  const marks = { restricted: PLACES[pl].level === 'restricted', there: pl === 'there' };
  const parts = {
    template: t.id,
    classification: PLACES[pl].level,
    place: pl,
    domain: domain === undefined ? t.domain ?? null : domainOk(domain) ? domain : null,
    marks: marks.there ? { forWhom: 'classified', success: 'classified', stopRule: 'classified' } : {},
    facts: (t.facts || []).map((f) => makeFact(f, marks)),
    stages: stagesFromType(L, t.id, { place: pl }),
  };
  if (t.trl) { parts.trl = trlOk(trl) ? trl : null; parts.trlTarget = trlOk(t.trlTarget) ? t.trlTarget : null; }
  if (t.link === 'next') parts.link = nextLink(link, origin);
  if (parent) parts.parent = parent;
  return parts;
}
// A project changing its type keeps its stages: it takes the new type's id, the facts it does not have yet (by key,
// else by label, marked by the project's place), a domain only if it has none, readiness rows if the type has them and
// the project does not, and the link row for the Claude type. null when the type does not allow the project's place.
export function retypeParts(L, p, typeId) {
  const t = typeById(L, typeId);
  if (!t || !p) return null;
  const pl = placeOf(p);
  if (!placesFor(t).includes(pl)) return null;
  const own = p.facts || [];
  const missing = (f) => !own.some((x) => (f.key && x.key === f.key) || x.label === f.label);
  const patch = { template: t.id, facts: [...own, ...(t.facts || []).filter(missing).map((f) => makeFact(f, { restricted: isRestricted(p), there: pl === 'there' }))] };
  if (!p.domain && !p.personal && t.domain) patch.domain = t.domain;
  if (t.trl && p.trl === undefined) { patch.trl = null; patch.trlTarget = trlOk(t.trlTarget) ? t.trlTarget : null; }
  if (t.link === 'next' && p.link === undefined) patch.link = null;
  return patch;
}
// A בדה"ת opened from a building block: never at a lower place than the block, with the block's readiness carried in.
export function linkedBdtPreset(L, block) {
  const bdt = typeById(L, 'bdt');
  const min = placeOf(block);
  return { type: 'bdt', place: stricterPlace(bdt?.place || 'both', min), minPlace: min, domain: bdt ? bdt.domain ?? null : null,
    trl: trlOk(block?.trl) ? block.trl : null, parent: block?.id ?? null, parentName: block?.name || '' };
}

// ---------- working days (Sunday to Thursday) ----------
const isWorkday = (d) => d.getDay() <= 4;
export function workdaysBetween(a, b) {
  let n = 0;
  const d = new Date(a); d.setHours(0, 0, 0, 0);
  const end = new Date(b); end.setHours(0, 0, 0, 0);
  while (d < end) { d.setDate(d.getDate() + 1); if (isWorkday(d)) n++; }
  return n;
}

// ---------- the stage path ----------
export const currentStage = (p) => p.stages.find((s) => s.state === 'active' || s.state === 'pending') || null;

// Close the current stage with one of the four gate choices. A stage whose gate belongs to the commander waits as
// 'pending' until the commander approves, unless the commander is the one closing it.
export function closeStage(p, { choice, evidence = [], note = '', by, byCommander = false, backTo = null, now = Date.now() }) {
  const stages = p.stages.map((s) => ({ ...s }));
  const i = stages.findIndex((s) => s.state === 'active' || s.state === 'pending');
  const log = [...(p.log || [])];
  const stamp = new Date(now).toISOString();
  const cur = i >= 0 ? stages[i] : null;
  const entry = (text) => log.unshift({ id: uid('l'), kind: 'decision', text, who: by, at: stamp, gate: true, reversible: choice !== 'stop' });
  if (choice === 'stop') {
    entry(`הפרויקט נעצר${cur ? ` בשלב ${cur.name}` : ''}${note ? `: ${note}` : ''}`);
    return { ...p, stages, log, phase: 'stopped' };
  }
  if (choice === 'hold') {
    entry(`הפרויקט הושהה${cur ? ` בשלב ${cur.name}` : ''}${note ? `: ${note}` : ''}`);
    return { ...p, stages, log, phase: 'hold' };
  }
  if (!cur) return { ...p, phase: 'active' };
  if (choice === 'back') {
    const j = backTo ? stages.findIndex((s) => s.id === backTo) : Math.max(0, i - 1);
    for (let k = j; k <= i; k++) stages[k] = { ...stages[k], state: k === j ? 'active' : 'todo', closedAt: k === j ? null : stages[k].closedAt };
    entry(`חזרה לשלב ${stages[j].name}${note ? `: ${note}` : ''}`);
    return { ...p, stages, log, phase: 'active' };
  }
  // next
  stages[i].evidence = [...stages[i].evidence, ...evidence];
  if (cur.gate === 'commander' && !byCommander) {
    stages[i].state = 'pending';
    stages[i].askedAt = stamp;
    entry(`ביקשנו אישור לסגור את שלב ${cur.name}${note ? `: ${note}` : ''}`);
    return { ...p, stages, log };
  }
  stages[i].state = 'done';
  stages[i].closedAt = stamp;
  const nxt = stages.findIndex((s, k) => k > i && s.state === 'todo');
  if (nxt >= 0) stages[nxt].state = 'active';
  entry(`שלב ${cur.name} נסגר${note ? `: ${note}` : ''}`);
  return { ...p, stages, log, phase: nxt >= 0 ? 'active' : 'done' };
}

// The commander turns a gate down: the stage goes back to work with a direction.
export function returnStage(p, { by, note = '', now = Date.now() }) {
  const stages = p.stages.map((s) => (s.state === 'pending' ? { ...s, state: 'active', askedAt: null } : s));
  const log = [{ id: uid('l'), kind: 'decision', text: `השלב הוחזר לעבודה${note ? `: ${note}` : ''}`, who: by, at: new Date(now).toISOString(), gate: true, reversible: true }, ...(p.log || [])];
  return { ...p, stages, log };
}

// ---------- changing the path of a running project ----------
// Whoever manages a project changes its path while it runs, inside these rules. They keep one invariant that
// closeStage relies on: no stage still to do ever sits before the current one. Moving touches only stages not started
// yet, adding always goes at the end, and a skipped stage comes back only after the current one.
const stageAt = (p, sid) => { const i = (p?.stages || []).findIndex((s) => s.id === sid); return { i, s: i >= 0 ? p.stages[i] : null }; };
const laterTodo = (p, i) => p.stages.some((x, k) => k > i && x.state === 'todo');
export function canMoveStage(p, sid, dir) {
  const { i, s } = stageAt(p, sid);
  const n = s && (dir === -1 || dir === 1) ? p.stages[i + dir] : null;
  return !!n && s.state === 'todo' && n.state === 'todo';
}
export function canSkipStage(p, sid, byCommander = false) {
  const { i, s } = stageAt(p, sid);
  if (!s || !(s.state === 'todo' || (s.state === 'active' && laterTodo(p, i)))) return false;
  return s.gate !== 'commander' || !!byCommander;
}
export function canRemoveStage(p, sid, byCommander = false) {
  const { s } = stageAt(p, sid);
  return !!s && s.state === 'todo' && (s.gate !== 'commander' || !!byCommander);
}
// A skipped stage comes back after the current one; with no current stage, it becomes the current one.
export function canUnskipStage(p, sid) {
  const { i, s } = stageAt(p, sid);
  if (!s || s.state !== 'skipped') return false;
  const cur = p.stages.findIndex((x) => x.state === 'active' || x.state === 'pending');
  return cur < 0 || i > cur;
}
export function canSetGate(s, gate, byCommander = false) {
  if (!s || (s.state !== 'todo' && s.state !== 'active') || (gate !== 'manager' && gate !== 'commander')) return false;
  return !(s.gate === 'commander' && gate === 'manager' && !byCommander);
}
const PENDING = 'השלב מחכה לאישור. אפשר לשנות אחרי ההחלטה.';
const BY_COMMANDER = 'רק באישור {commander} אפשר לדלג על השלב הזה או להסיר אותו';
// The gate of stage s, with the line a disabled option shows.
export function gateRule(s, gate, byCommander = false) {
  if (canSetGate(s, gate, byCommander)) return { ok: true, why: '' };
  if (s?.state === 'pending') return { ok: false, why: PENDING };
  if (s && (s.state === 'todo' || s.state === 'active') && s.gate === 'commander' && gate === 'manager') return { ok: false, why: 'להוריד את השער הזה אפשר רק באישור {commander}' };
  return { ok: false, why: '' };
}
// Whether `action` ('up' | 'down' | 'skip' | 'unskip' | 'remove') may run on stage sid, with the line a disabled
// control shows. `why` may hold {commander}, which the store fills in.
export function stageRule(p, sid, action, byCommander = false) {
  const { i, s } = stageAt(p, sid);
  const no = (why = '') => ({ ok: false, why });
  if (!s) return no();
  if (action === 'up' || action === 'down') {
    const dir = action === 'up' ? -1 : 1;
    if (canMoveStage(p, sid, dir)) return { ok: true, why: '' };
    return no(p.stages[i + dir] ? 'אפשר להזיז רק שלבים שעוד לא התחילו' : '');
  }
  if (action === 'skip') {
    if (canSkipStage(p, sid, byCommander)) return { ok: true, why: '' };
    if (s.state === 'pending') return no(PENDING);
    if (s.state === 'active' && !laterTodo(p, i)) return no("זה השלב האחרון. סוגרים אותו ב'סגירת שלב'");
    return no(s.state === 'todo' || s.state === 'active' ? BY_COMMANDER : '');
  }
  if (action === 'remove') {
    if (canRemoveStage(p, sid, byCommander)) return { ok: true, why: '' };
    return no(s.state !== 'todo' ? 'אפשר להסיר רק שלב שעוד לא התחיל. על שלב שהתחיל אפשר לדלג' : BY_COMMANDER);
  }
  if (action === 'unskip') return canUnskipStage(p, sid) ? { ok: true, why: '' } : no();
  return no();
}
// The path after one change, as the store writes it, or null when the rule refuses it. 'add' puts `stage` at the end:
// the current stage when there is no current stage and nothing left to do, else one more stage to do.
export function stagesAfter(p, action, { sid = null, stage = null, byCommander = false } = {}) {
  const st = p.stages.map((s) => ({ ...s }));
  const i = st.findIndex((s) => s.id === sid);
  const noCurrent = () => !st.some((s) => s.state === 'active' || s.state === 'pending');
  if (action === 'up' || action === 'down') {
    const dir = action === 'up' ? -1 : 1;
    if (!canMoveStage(p, sid, dir)) return null;
    [st[i], st[i + dir]] = [st[i + dir], st[i]];
    return st;
  }
  if (action === 'skip') {
    if (!canSkipStage(p, sid, byCommander)) return null;
    const wasActive = st[i].state === 'active';
    st[i].state = 'skipped';
    if (wasActive) { const n = st.findIndex((s, k) => k > i && s.state === 'todo'); if (n >= 0) st[n].state = 'active'; }
    return st;
  }
  if (action === 'unskip') {
    if (!canUnskipStage(p, sid)) return null;
    st[i].state = noCurrent() ? 'active' : 'todo';
    return st;
  }
  if (action === 'remove') return canRemoveStage(p, sid, byCommander) ? st.filter((s) => s.id !== sid) : null;
  if (action === 'add' && stage) return [...st, { ...stage, state: noCurrent() && !st.some((s) => s.state === 'todo') ? 'active' : 'todo' }];
  return null;
}

// ---------- the weekly update ----------
export function weeklyUpdate(p, { hill, confidence, note = '', senior = null, now = Date.now() }) {
  const at = new Date(now).toISOString();
  const was = p.confidence;
  return {
    ...p,
    hill,
    confidence,
    confNote: confidence === 'on' ? '' : note,
    stuckSince: confidence === 'stuck' ? (was === 'stuck' && p.stuckSince ? p.stuckSince : at) : null,
    needsSenior: senior && senior.what ? { ...senior, at } : null,
    lastUpdate: at,
    updates: [{ at, hill, confidence, note }, ...(p.updates || [])].slice(0, 26),
  };
}
export const updateDue = (p, now = Date.now()) => !p.lastUpdate || now - new Date(p.lastUpdate).getTime() >= 6 * DAY;

// ---------- the order of the team's projects ----------
// Only projects are ordered, never people. A live team project takes a place 1…N; personal, held, stopped and
// finished projects take none, and a new project stays unplaced until the commander gives it a place.
export const inOrder = (p) => !!p && !p.personal && p.phase !== 'hold' && p.phase !== 'stopped' && p.phase !== 'done';
const place = (p) => (inOrder(p) && p.rank != null ? p.rank : Infinity);
// Placed projects by place, then the unplaced, then held ones; the given order breaks ties.
export const byRank = (a, b) => place(a) - place(b) || (a.phase === 'hold') - (b.phase === 'hold');

// Put project `id` at place n (1 is the top; past the end means last) and number the rest after it, 1…N with no gaps.
// Returns { [project id]: place or null } for every project given. n == null takes the project out of the order; with
// no id the places only close up, so a project that left the order gives up its place.
export function placeProject(projects, id, n) {
  const live = projects.filter(inOrder);
  const moving = n == null ? null : live.find((p) => p.id === id);
  const list = live.filter((p) => p !== moving && p.id !== id && p.rank != null).sort((a, b) => a.rank - b.rank);
  if (moving) list.splice(Math.max(0, Math.min(list.length, Math.round(n) - 1)), 0, moving);
  const ranks = Object.fromEntries(projects.map((p) => [p.id, null]));
  list.forEach((p, i) => { ranks[p.id] = i + 1; });
  return ranks;
}

// ---------- asks: what the commander asks of a project's manager ----------
// An ask is a task with ask: true, from the commander to the manager, who answers it (ack) and breaks it into tasks
// (each with parent: the ask). Its state as the commander reads it, most pressing first: done; talk (the manager wants
// to talk about it); ready (every task under it is done, so it only waits to be closed, and is never late); late (open
// past its date, from the day after, as with external commitments); doing (broken into tasks, n of m done); sent (not
// answered yet); ok (accepted, nothing under it yet).
export const ASK_STATE = {
  sent: { label: 'נשלחה', color: 'var(--s-todo)' },
  ok: { label: 'התקבלה', color: 'var(--accent)' },
  doing: { label: 'בעבודה', color: 'var(--s-progress)' },
  talk: { label: 'צריך לדבר', color: 'var(--s-waiting)' },
  ready: { label: 'המשימות בוצעו', color: 'var(--s-done)' },
  late: { label: 'באיחור', color: 'var(--h-off)' },
  done: { label: 'בוצעה', color: 'var(--s-done)' },
};
export function askState(ask, tasks = [], now = Date.now()) {
  const under = tasks.filter((t) => t.parent === ask.id);
  const n = under.filter((t) => t.status === 'done').length;
  const m = under.length;
  let state = 'ok';
  if (ask.status === 'done') state = 'done';
  else if (ask.ack?.state === 'talk') state = 'talk';
  else if (m && n === m) state = 'ready';
  else if (ask.due && daysBetween(now, ask.due) < 0) state = 'late';
  else if (m) state = 'doing';
  else if (!ask.ack) state = 'sent';
  return { state, n, m };
}

// ---------- what reaches the commander ----------
// Only these things, each with the reason in words: a gate, a manager asking for a senior, a stage late or stuck, an
// external commitment late or at risk, and of his own asks, one the manager wants to talk about or one that is late.
// Everything else stays with the project manager, the tasks under an ask included.
// The queue reads in this order, then by the project's place.
export const KIND_ORDER = ['gate', 'senior', 'talk', 'late', 'asklate', 'commit'];
export function needsCommander(p, tasks = [], now = Date.now()) {
  if (p.personal || p.phase === 'stopped' || p.phase === 'done') return [];
  const out = [];
  if (p.needsSenior) out.push({ kind: 'senior', why: 'בקשת עזרה', text: p.needsSenior.what, by: p.needsSenior.by });
  for (const s of p.stages) if (s.state === 'pending') out.push({ kind: 'gate', why: 'שער שמחכה לאישור שלך', text: `לסגור את שלב ${s.name}`, stage: s.id });
  const cur = currentStage(p);
  const late = cur && cur.target ? daysBetween(cur.target, now) : 0;
  if (late > (p.tolDays ?? 14)) {
    out.push({ kind: 'late', why: 'חרג מהסבולת', text: `שלב ${cur.name} באיחור של ${late} ימים`, by: cur.target });
  } else if (p.confidence === 'stuck' && p.stuckSince && now - new Date(p.stuckSince).getTime() >= 13 * DAY) {
    out.push({ kind: 'late', why: 'תקוע שבועיים', text: p.confNote || 'הפרויקט מסומן תקוע כבר שבועיים' });
  }
  for (const t of tasks) {
    if (t.project !== p.id || !t.external || t.status === 'done' || !t.due) continue;
    // Late from the day after the due day, as on the task's own date.
    if (daysBetween(now, t.due) < 0) out.push({ kind: 'commit', why: 'התחייבות חיצונית באיחור', text: `${t.title} (ל${t.external})`, task: t.id, by: t.due });
    else if (t.status !== 'doing' && workdaysBetween(now, dayStart(t.due)) < 3) out.push({ kind: 'commit', why: 'התחייבות חיצונית בסכנה', text: `${t.title} (ל${t.external})`, task: t.id, by: t.due });
  }
  for (const t of tasks) {
    if (t.project !== p.id || !t.ask || t.status === 'done') continue;
    const a = askState(t, tasks, now).state;
    if (a === 'talk') out.push({ kind: 'talk', why: 'צריך לדבר על הבקשה', text: t.title, task: t.id, by: t.due });
    else if (a === 'late') out.push({ kind: 'asklate', why: 'בקשה שלך באיחור', text: t.title, task: t.id, by: t.due });
  }
  return out;
}

// The fixed status line for the overview: where the project is, how it feels, and whether anyone looked lately.
export function status(p, now = Date.now()) {
  const cur = currentStage(p);
  const n = p.stages.length;
  const idx = cur ? p.stages.indexOf(cur) + 1 : n;
  const stale = !p.personal && p.phase !== 'stopped' && p.phase !== 'done' && (!p.lastUpdate || now - new Date(p.lastUpdate).getTime() > 9 * DAY);
  let health = p.confidence || 'on';
  if (p.phase === 'hold') health = 'hold';
  if (p.phase === 'stopped') health = 'stopped';
  if (p.phase === 'done') health = 'done';
  const where = p.phase === 'done' ? 'הושלם' : p.phase === 'stopped' ? 'נעצר' : cur ? cur.name : n ? 'כל השלבים נסגרו' : 'בלי שלבים';
  return { where, idx, n, health, stale, pending: cur?.state === 'pending' };
}

export const HEALTH = {
  on: { label: 'במסלול', color: 'var(--h-on)' },
  risk: { label: 'בסיכון', color: 'var(--h-risk)' },
  stuck: { label: 'תקוע', color: 'var(--h-off)' },
  hold: { label: 'מושהה', color: 'var(--s-todo)' },
  stopped: { label: 'נעצר', color: 'var(--s-todo)' },
  done: { label: 'הושלם', color: 'var(--s-done)' },
};

// ---------- facts, and the building block's readiness ----------
// Rules find a fact by its key, never by its label, and a choice fact stores an option id, so labels can change.
export const factByKey = (p, key) => (p?.facts || []).find((f) => f.key === key) || null;
const choiceLabel = (f) => (f && f.kind === 'choice' && !f.classified && !f.unknown ? f.options?.find((o) => o.id === f.value)?.label || null : null);
// What a block's brief line is made of: today's TRL, the target, and the commitment's label. A part with no value here
// (unknown, or kept on the classified network) is null.
export function briefParts(p) {
  if (!p) return { trl: null, target: null, commit: null };
  return { trl: trlOk(p.trl) ? p.trl : null, target: trlOk(p.trlTarget) ? p.trlTarget : null, commit: choiceLabel(factByKey(p, 'commit')) };
}
// The short line on a block's row: "TRL 3 → 6 · כוונה", "TRL 3", "יעד TRL 6", or "" when there is nothing to say.
export function briefLine(p) {
  if (!p) return '';
  const { trl: n, target: to, commit } = briefParts(p);
  const head = n && to ? `TRL ${n} → ${to}` : n ? `TRL ${n}` : to ? `יעד TRL ${to}` : '';
  return [head, commit].filter(Boolean).join(' · ');
}
// "The valley": mature enough (TRL 5 or more) and still no body that will take it. A commitment kept on the classified
// network is not known here, so it never counts as missing.
export function inValley(p) {
  if (!p || p.personal || p.phase === 'stopped' || p.phase === 'done' || !trlOk(p.trl) || p.trl < VALLEY_TRL) return false;
  const c = factByKey(p, 'commit');
  if (!c || c.classified) return false;
  return !!c.unknown || !c.value || c.value === 'none';
}
// What the block's linked בדה"תים brought back: one entry per child that ended (done or stopped), while the block is
// open and either sits on its flight stage or has a TRL to take from that child. Each part without a value is null.
export function handBack(block, kids = []) {
  if (!block || block.phase === 'stopped' || block.phase === 'done') return [];
  const atFlight = currentStage(block)?.key === 'flight';
  return kids.filter((k) => k && k.parent === block.id && (k.phase === 'done' || k.phase === 'stopped')).map((k) => {
    const trl = trlOk(k.trl) ? k.trl : null;
    return { id: k.id, name: k.name, ended: k.phase, trl, rec: choiceLabel(factByKey(k, 'rec')), take: trl !== null && (!trlOk(block.trl) || trl > block.trl) };
  }).filter((x) => atFlight || x.take);
}

// ---------- the Claude type's link out ----------
// Only to /next/ on this site, or on the app's host, over https. Anything else is no link (null).
export const APP_HOST = 'https://cto-tasks.vercel.app';
const underNext = (path) => path === '/next' || path.startsWith('/next/');
export function nextLink(v, origin) {
  const s = String(v ?? '').trim();
  if (!s || /[\s\\]/.test(s)) return null;
  if (s.startsWith('/') && !s.startsWith('//')) { // relative: normalized, and must stay on this site
    try { const u = new URL(s, 'https://x.invalid'); return u.origin === 'https://x.invalid' && underNext(u.pathname) ? u.pathname + u.search + u.hash : null; }
    catch (e) { return null; }
  }
  try {
    const u = new URL(s);
    const okHost = u.origin === APP_HOST || (!!origin && u.origin === origin);
    return u.protocol === 'https:' && okHost && !u.username && !u.password && underNext(u.pathname) ? u.href : null;
  } catch (e) { return null; }
}

// ---------- the stages in time, for the Gantt ----------
// How long a stage usually takes, to place a stage nobody has given a date yet.
export const STAGE_DAYS = { scope: 14, research: 21, need: 14, req: 14, spec: 21, resources: 14, mvp: 42, pilot: 42, production: 28, adoption: 56, findings: 14, plan: 14 };
// A stage's own usual length (copied from its type), else the classic one for its key, else two weeks.
export const stageDays = (s) => s.days || STAGE_DAYS[s.key] || 14;
// A date-only string ("2026-10-30") is that day here, not midnight in London. The year is set on its own, so a
// half-typed year stays the year it is (new Date(26, 9, 30) would be 1926).
export function localDay(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (!m) return new Date(v);
  const d = new Date(2000, 0, 1);
  d.setFullYear(+m[1], +m[2] - 1, +m[3]);
  return d;
}
export const dayStart = (v) => { const d = localDay(v); d.setHours(0, 0, 0, 0); return d.getTime(); };
// Whole calendar days from a to b. A clock change makes one day 23 or 25 hours long, so the count is rounded.
export const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);
// A date someone could mean: a whole date with a year from 2000 to 2100. While a year is typed, a date field passes
// through "0002-11-06" and "0202-11-06", and a fifth digit gives "20266-11-06"; none of them is a target.
export const plausibleDay = (v) => { const m = /^(\d{4,})-\d{2}-\d{2}/.exec(String(v ?? '')); return !!m && +m[1] >= 2000 && +m[1] <= 2100; };

// Where each stage sits in time. A closed stage ends when it closed and an open one at its target; a stage with no
// date yet is estimated from its usual length (est), and an open stage past its target is late. Each stage starts
// where the one before it ended, and nothing after an open stage starts before tomorrow. The path starts at the first
// stage with a real date (a close, or the open stage); the stages before it have no date and take no time. A target
// that isn't a plausible day counts as none. Days move with the calendar (setDate), so a clock change never shifts a date.
export const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
export function schedule(p, now = Date.now()) {
  const today = dayStart(now);
  const tomorrow = addDays(today, 1);
  const len = stageDays;
  const open = (s) => s.state === 'active' || s.state === 'pending';
  const target = (s) => (plausibleDay(s.target) ? dayStart(s.target) : null);
  if (!p.stages.length) return [];
  const k = p.stages.findIndex((s) => (s.state === 'done' && s.closedAt) || open(s));
  const first = p.stages[k];
  let cursor;
  if (p.startedAt) cursor = dayStart(p.startedAt);
  else if (!first) cursor = today;
  else if (first.state === 'done') cursor = addDays(dayStart(first.closedAt), -len(first));
  else cursor = Math.min(target(first) !== null ? addDays(target(first), -len(first)) : today, addDays(today, -7));
  return p.stages.map((s, i) => {
    const start = cursor;
    const t = target(s);
    let end;
    let est = false;
    if (i < k || s.state === 'skipped') end = start;
    else if (s.state === 'done') end = s.closedAt ? Math.max(start, dayStart(s.closedAt)) : addDays(start, len(s));
    else if (t !== null) end = Math.max(addDays(start, 1), t);
    else {
      est = true;
      end = addDays(start, len(s));
      if (open(s) && end <= today) end = tomorrow;
    }
    cursor = open(s) ? Math.max(end, tomorrow) : end;
    return { id: s.id, start, end, est, late: open(s) && t !== null && t < today };
  });
}

// When every task of the current stage is done, the card asks the stage's exit question.
export function stageReady(p, tasks) {
  const cur = currentStage(p);
  if (!cur || cur.state !== 'active') return false;
  const mine = tasks.filter((t) => t.project === p.id && t.stage === cur.id);
  return mine.length > 0 && mine.every((t) => t.status === 'done');
}

// How full the card is, so an empty field reads as "not yet" rather than "missing". Fields marked unknown or kept on
// the classified network count as answered, and so do core fields marked so. Skipped stages no longer count; the
// project's facts do.
const answered = (f) => !!(f.value && String(f.value).trim()) || !!f.unknown || !!f.classified;
export function cardFill(p) {
  const core = ['what', 'forWhom', 'success'].map((k) => !!(p[k] && p[k].trim()) || !!p.marks?.[k]);
  const reached = p.stages.filter((s) => s.state !== 'todo' && s.state !== 'skipped');
  const all = [...core, ...(p.facts || []).map(answered), ...reached.flatMap((s) => s.fields.map(answered))];
  return { done: all.filter(Boolean).length, of: all.length };
}
