// Sample data for the manual version: the team, two partners from outside, eight projects at different points of the
// stage path, and enough tasks, outputs and meetings that every screen has something real to show. Dates are relative
// to now, so the sample never goes stale. Yoash has set the order of the team projects (rank) and sent two asks: one
// Yahali hasn't answered yet (t11), and one Yarden accepted and has started breaking down (t21). p6 to p8 show the CTO
// types: a building block with no body committed to take it yet, a בדה"ת opened from it that waits for a place in the
// order, and a Claude tool with its link out. Every text here is generic and unclassified (the repo is public).
import { library, EMPTY_LIB, stagesFromType, newProjectParts, makeStage } from './card.js';

// Days on the calendar here, not 24-hour steps, so a clock change between then and now doesn't move a date.
const at = (days, h = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const date = (days) => at(days).slice(0, 10);

export const people = [
  { id: 'yoash', name: 'יואש', role: 'commander', title: 'מפקד', color: '#5856d6', account: true },
  { id: 'yonatan', name: 'יונתן', role: 'member', title: 'סגן', color: '#0071e3', account: true, command: true },
  // perms: what Yoash granted. Until sign-in, the sample gives Yahali the types in his place.
  { id: 'yahali', name: 'יהלי', role: 'member', title: 'צוות', color: '#ff9500', account: true, perms: ['types'] },
  { id: 'yarden', name: 'ירדן', role: 'member', title: 'יועצת', color: '#34c759', account: true },
  { id: 'avi', name: 'אבי כהן', role: 'external', title: 'ספק פיתוח', org: 'חברת הפיתוח', color: '#30b0c7', account: true },
  { id: 'ronit', name: 'ד"ר רונית לוי', role: 'external', title: 'חוקרת', org: 'מחלקת המו"פ', color: '#af52de', account: false },
];

// The code's types, with no team edits: the sample is the same in every browser.
const L = library(EMPTY_LIB);
// Walk a type's path forward: close the first `done` stages, give the active one a target date. Fields the place keeps
// on the classified network stay marked and empty.
function path(type, done, { target = 14, fill = {}, place = 'here' } = {}) {
  const st = stagesFromType(L, type, { place }).map((s, i) => ({
    ...s,
    state: i < done ? 'done' : i === done ? 'active' : 'todo',
    closedAt: i < done ? at(-7 * (done - i)) : null,
    target: i === done ? date(target) : null,
    fields: s.fields.map((f) => (f.classified ? f : { ...f, value: fill[f.label] || '' })),
  }));
  return st;
}
// What a new project of a CTO type takes from it (card.newProjectParts), its stages walked forward apart.
const fromType = (type, opts) => { const { stages, ...rest } = newProjectParts(L, type, opts); return rest; };
const withFacts = (parts, values) => ({ ...parts, facts: parts.facts.map((f) => (f.key in values ? { ...f, value: values[f.key] } : f)) });

const p1Stages = path('tool', 2, { target: 9, fill: { 'גבולות': 'אישורי כניסה לאורחים וספקים, בלי כרטיסי עובדים', 'הצורך במשפט': 'אישור כניסה תוך יום במקום שבוע', 'הדורש': 'מנהלת החלל' } });
const p2Stages = path('rnd', 5, { target: -3, place: 'both', fill: { 'גבולות': 'ניסוי מעבדה בלבד', 'פתרונות קיימים': 'נמצא ברשת המסווגת', 'הצורך במשפט': 'קישור יציב בתנאי שטח', 'הדורש': 'אגף המבצעים' } });
p2Stages[5].state = 'pending';
p2Stages[5].askedAt = at(-2);
p2Stages[5].fields = [{ label: 'תקציב', value: '', classified: true }, { label: 'אנשים', value: 'צוות של 3 + חוקרת' }, { label: 'לוח זמנים', value: '4 חודשים' }];
p2Stages[1].fields = p2Stages[1].fields.map((f) => ({ ...f, value: '', classified: true }));
const p3Stages = path('study', 1, { target: 5, fill: { 'גבולות': 'כלים שעובדים בלי ענן ציבורי' } });
const p4Stages = path('process', 2, { target: -1, fill: { 'הצורך במשפט': 'עובד חדש עובד ביום השני ולא בשבוע השני', 'הדורש': 'משאבי אנוש', 'קישור לתוכנית': 'https://example.org/onboarding-plan' } });
const p5Stages = [makeStage(null, 'שבועות 1-3'), makeStage(null, 'פרויקט גמר')];
p5Stages[0].state = 'active';
const p6Stages = path('block', 4, { place: 'both', fill: {
  'מה השתנה': 'רכיב הבסיס זול יותר וזמין אצל כמה ספקים', 'שותף המו"פ': 'מחלקת המו"פ', 'מה זה מכפיל': 'מקצר את הבנייה של מערכות שנשענות עליו',
  'גבולות': 'רק רכיב הבסיס, בלי המערכות שמשתמשות בו', 'הדורש': 'גוף מבצעי במנהלת', 'המסלול: קרקע, בדה"ת או שניהם': 'שניהם: קודם בקרקע, ואחר כך בדה"ת' } });
const p7Stages = path('bdt', 1, { place: 'there', target: 20 });
const p8Stages = path('claude', 1, { target: 4, fill: { 'הצורך במשפט': 'סיכום פגישה מוכן תוך שעה, בלי לכתוב אותו ביד', 'הדורש': 'הצוות' } });
// A place in the order Yoash set three days ago, which its manager has already seen.
const placed = (rank) => ({ rank, rankSeen: rank, rankAt: at(-3), rankBy: 'yoash' });

export const projects = [
  {
    id: 'p1', name: 'מערכת אישורי כניסה למנהלת החלל', color: '#ff9500', classification: 'open', place: 'here', domain: null, template: 'tool',
    what: 'טופס ותהליך אישור דיגיטלי לכניסת אורחים וספקים, כדי שאישור ייקח יום ולא שבוע', forWhom: 'מנהלת החלל, קב"ט האתר', success: '80% מהבקשות מאושרות תוך יום עבודה', stopRule: 'אם עד סוף נובמבר אין הסכמה של הקב"ט על התהליך, עוצרים',
    manager: 'yahali', partners: ['yarden', 'avi'], stages: p1Stages, hill: 'up', confidence: 'on', confNote: '', lastUpdate: at(-3), tolDays: 14, ...placed(1),
    log: [
      { id: 'l1', kind: 'decision', text: 'בונים על הטפסים הקיימים של האתר ולא מערכת חדשה', who: 'yahali', at: at(-10), reversible: true },
      { id: 'l2', kind: 'assumption', text: 'הקב"ט יסכים לאישור דיגיטלי בלי חתימה ידנית', who: 'yahali', at: at(-9), check: date(6) },
    ],
  },
  {
    id: 'p2', name: 'ניסוי תקשורת בתנאי שטח', color: '#5856d6', classification: 'restricted', place: 'both', domain: 'blocks', template: 'rnd', trl: 3,
    what: 'ניסוי מעבדה שבודק אם הקישור מחזיק בתנאי שטח', forWhom: 'אגף המבצעים', success: '', stopRule: '',
    manager: 'yonatan', partners: ['ronit'], stages: p2Stages, hill: 'top', confidence: 'on', lastUpdate: at(-6), tolDays: 14, ...placed(2),
    log: [{ id: 'l3', kind: 'decision', text: 'מתחילים בניסוי מעבדה לפני שטח', who: 'yonatan', at: at(-20), reversible: true }],
  },
  {
    id: 'p3', name: 'סקר כלים לניהול ידע', color: '#34c759', classification: 'open', place: 'here', domain: 'infra', template: 'study',
    what: 'למפות אילו כלים לניהול ידע מתאימים לצוותים בלי ענן ציבורי', forWhom: 'הצוות ויחידות שכנות', success: 'המלצה אחת עם שתי חלופות', stopRule: '',
    manager: 'yarden', partners: ['yahali'], stages: p3Stages, hill: 'up', confidence: 'risk', confNote: 'אין גישה לסביבת הבדיקות של מחלקת המחשוב',
    needsSenior: { what: 'פתיחת דלת למחלקת המחשוב כדי לקבל סביבת בדיקות', by: date(4), at: at(-1) }, lastUpdate: at(-1), tolDays: 14, log: [], ...placed(4),
  },
  {
    id: 'p4', name: 'תהליך קליטת עובדים חדשים', color: '#30b0c7', classification: 'open', place: 'here', domain: null, template: 'process',
    what: 'שעובד חדש יעבוד כבר ביום השני', forWhom: 'משאבי אנוש וכל הצוותים', success: 'עובד חדש פותח משימה ראשונה ביום השני', stopRule: '',
    manager: 'yonatan', partners: ['yarden'], stages: p4Stages, hill: 'down', confidence: 'stuck', confNote: 'מחכים למשאבי אנוש שיאשרו את הטופס החדש', stuckSince: at(-15), lastUpdate: at(-8), tolDays: 14, log: [], ...placed(3),
  },
  {
    id: 'p5', name: 'קורס ניהול מוצר', color: '#ff2d55', classification: 'open', place: 'here', template: 'blank', personal: 'yahali',
    what: 'קורס ערב, 6 שבועות', forWhom: '', success: '', stopRule: '', manager: 'yahali', partners: [], stages: p5Stages, hill: 'top', confidence: 'on', lastUpdate: at(-2), log: [],
  },
  {
    id: 'p6', name: 'אבן בניין לדוגמה', color: '#af52de', ...withFacts(fromType('block', { place: 'both', trl: 5 }), { target: 'existing', commit: 'none' }),
    what: 'יכולת בסיס לדוגמה שתאפשר לבנות מערכות חלל מהר יותר', forWhom: '', success: '', stopRule: '',
    manager: 'yahali', partners: ['ronit'], stages: p6Stages, hill: 'up', confidence: 'on', confNote: '', lastUpdate: at(-4), tolDays: 14, log: [], ...placed(5),
  },
  {
    id: 'p7', name: 'בדה"ת לדוגמה', color: '#0071e3', ...fromType('bdt', { place: 'there', trl: 5, parent: 'p6' }),
    what: 'ניסוי לדוגמה שבודק במסלול את אבן הבניין לדוגמה', forWhom: '', success: '', stopRule: '',
    manager: 'yonatan', partners: ['yahali'], stages: p7Stages, hill: 'up', confidence: 'on', confNote: '', lastUpdate: at(-2), tolDays: 14, log: [], rank: null, rankSeen: null,
  },
  {
    id: 'p8', name: 'כלי עם Claude לדוגמה', color: '#a2845e', ...fromType('claude', { place: 'here', link: '/next/?demo#/project/platform' }),
    what: 'כלי לדוגמה שמסכם פגישות של הצוות ומציע משימות', forWhom: '', success: '', stopRule: '',
    manager: 'yarden', partners: ['yahali'], stages: p8Stages, hill: 'up', confidence: 'on', confNote: '', lastUpdate: at(-5), tolDays: 14, log: [], ...placed(6),
  },
];

const T = (id, title, project, stage, owner, status, due, extra = {}) => ({ id, title, project, stage, owner, by: extra.by || owner, status, due: due === null ? null : date(due), createdAt: at(-5), ...extra });
const st = (p, i) => projects.find((x) => x.id === p).stages[i].id;

export const tasks = [
  T('t1', 'לנסח את מסלול האישור עם הקב"ט', 'p1', st('p1', 2), 'yahali', 'doing', 1, { focus: true, priority: 'critical' }),
  T('t2', 'לאסוף שלוש דוגמאות של טפסי כניסה', 'p1', st('p1', 2), 'yarden', 'done', -2, { priority: 'medium' }),
  T('t3', 'לשלוח לספק את מסמך הדרישות', 'p1', st('p1', 2), 'yahali', 'todo', 2, { external: 'אבי כהן (ספק)', priority: 'high' }),
  T('t4', 'הערכת עלות לפיתוח', 'p1', st('p1', 2), 'avi', 'todo', 6, { by: 'yahali', priority: 'medium' }),
  T('t5', 'להכין את תוכנית הניסוי לפגישת האישור', 'p2', st('p2', 5), 'yonatan', 'done', -1, { priority: 'high' }),
  T('t6', 'לתאם עם רונית זמן מעבדה', 'p2', st('p2', 5), 'yonatan', 'todo', 3, { priority: 'medium' }),
  T('t7', 'לבנות טבלת השוואה של 8 כלים', 'p3', st('p3', 1), 'yarden', 'doing', 2, { focus: true, priority: 'high' }),
  T('t8', 'לראיין שני צוותים שכנים', 'p3', st('p3', 1), 'yahali', 'todo', 4, { priority: 'low', parent: 't21' }),
  T('t9', 'לשלוח למשאבי אנוש את הטופס המעודכן', 'p4', st('p4', 2), 'yonatan', 'stuck', -3, { priority: 'critical' }),
  T('t10', 'למסור למשאבי אנוש סיכום פיילוט', 'p4', st('p4', 2), 'yarden', 'todo', 1, { external: 'משאבי אנוש', priority: 'high' }),
  T('t15', 'לקבוע פגישה עם הקב"ט', 'p1', st('p1', 2), 'yahali', 'done', -4, { priority: 'high' }),
  T('t16', 'טיוטת מסך הבקשה למבקר', 'p1', st('p1', 2), 'avi', 'doing', 4, { by: 'yahali', priority: 'medium', focus: true, focusBy: 'yahali' }),
  T('t17', 'לבדוק התאמה לנוהל האבטחה', 'p1', st('p1', 2), 'yarden', 'stuck', 0, { priority: 'high' }),
  T('t18', 'הערכת עלות ולוח זמנים', 'p1', st('p1', 3), 'yahali', 'todo', 12, { priority: 'medium' }),
  T('t19', 'לאתר משתמשים לפיילוט', 'p1', st('p1', 5), 'yarden', 'todo', 25, { priority: 'low' }),
  T('t20', 'סיכום ראיונות עם השומרים', 'p1', st('p1', 1), 'yahali', 'done', -9, { priority: 'medium' }),
  T('t11', 'להעביר מצגת עדכון ליואש', 'p1', null, 'yahali', 'todo', 0, { by: 'yoash', fromCommander: true, priority: 'high', ask: true, ack: null, why: 'לפני הפגישה עם הקב״ט' }),
  T('t21', 'לסגור רשימה קצרה של שלושה כלים', 'p3', st('p3', 1), 'yarden', 'todo', 7, { by: 'yoash', fromCommander: true, priority: 'high', ask: true, ack: { state: 'ok', at: at(-2) } }),
  T('t12', 'שיעורי בית: פרסונה', 'p5', p5Stages[0].id, 'yahali', 'todo', 3, { personal: true, priority: 'medium' }),
  T('t13', 'לקבוע תור לרכב', null, null, 'yahali', 'todo', 1, { personal: true, priority: 'low' }),
  T('t14', 'לסגור את סיכום החודש', null, null, 'yoash', 'todo', 2, { priority: 'medium' }),
  T('t22', 'לתאם בדיקה בסביבה רלוונטית', 'p6', st('p6', 4), 'yahali', 'todo', 5, { priority: 'high' }),
  T('t23', 'לכתוב מה נבדק בבדיקה הראשונה', 'p6', st('p6', 4), 'yahali', 'doing', 2, { priority: 'medium' }),
  T('t24', 'לבדוק שתי הזדמנויות טיסה', 'p7', st('p7', 1), 'yonatan', 'todo', 6, { priority: 'high' }),
  T('t25', 'לשאול את הבונה על לוח הזמנים', 'p7', st('p7', 1), 'yahali', 'todo', 8, { by: 'yonatan', priority: 'medium' }),
  T('t26', 'למפות אילו נתונים נכנסים לכלי', 'p8', st('p8', 1), 'yarden', 'doing', 3, { priority: 'high' }),
  T('t27', 'לבקש אישור על המידע שנכנס לכלי', 'p8', st('p8', 1), 'yahali', 'todo', 5, { by: 'yarden', priority: 'medium' }),
];

export const outputs = [
  { id: 'o1', project: 'p1', stage: st('p1', 0), title: 'מסמך תיחום', kind: 'doc', url: 'https://example.org/scope', by: 'yahali', at: at(-15), level: 'final', feedback: [] },
  { id: 'o2', project: 'p1', stage: st('p1', 1), title: 'סיכום ראיון עם מנהלת החלל', kind: 'meeting', by: 'yahali', at: at(-8), level: 'draft', feedback: [] },
  { id: 'o3', project: 'p3', stage: st('p3', 0), title: 'רשימת דרישות לכלי ניהול ידע', kind: 'sheet', url: 'https://example.org/reqs', by: 'yarden', at: at(-6), level: 'pilot', open: true,
    feedback: [{ id: 'f1', who: 'yonatan', text: 'חסרה דרישה לחיפוש בעברית', at: at(-5) }] },
  { id: 'o4', project: 'p2', stage: st('p2', 1), title: 'סקר ספרות', kind: 'pointer', where: 'ברשת המסווגת, תיקיית הצוות > ניסויים > סקר', by: 'yonatan', at: at(-25), level: 'final', feedback: [] },
  { id: 'o5', project: 'p4', stage: st('p4', 1), title: 'תוכנית קליטה, גרסה לפיילוט', kind: 'doc', url: 'https://example.org/onboarding-plan', by: 'yonatan', at: at(-12), level: 'pilot', open: true, feedback: [] },
];

export const meetings = [
  { id: 'm1', project: 'p1', title: 'פגישת היכרות עם מנהלת החלל', purpose: 'להבין את התהליך היום ואת הכאב', by: 'yahali', at: at(-8, 11), minutes: 34, state: 'done', output: 'o2',
    summary: { decisions: ['מתחילים מאורחים, ספקים בשלב שני'], tasks: [{ text: 'לנסח מסלול אישור', owner: 'יהלי' }], questions: ['האם צריך חתימה ידנית של הקב"ט?'], next: 'פגישה עם הקב"ט' } },
];

export const weekly = { day: 4 }; // Thursday
