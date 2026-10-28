// Sample data for the manual version: the team, two partners from outside, five projects at different points of the
// stage path, and enough tasks, outputs and meetings that every screen has something real to show. Dates are relative
// to now, so the sample never goes stale.
import { stagesFromTemplate, makeStage } from './card.js';

const DAY = 864e5;
const at = (days, h = 10) => { const d = new Date(Date.now() + days * DAY); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const date = (days) => at(days).slice(0, 10);

export const people = [
  { id: 'yoash', name: 'יואש', role: 'commander', title: 'מפקד', color: '#5856d6', account: true },
  { id: 'yonatan', name: 'יונתן', role: 'member', title: 'סגן', color: '#0071e3', account: true },
  { id: 'yahali', name: 'יהלי', role: 'member', title: 'צוות', color: '#ff9500', account: true },
  { id: 'yarden', name: 'ירדן', role: 'member', title: 'יועצת', color: '#34c759', account: true },
  { id: 'avi', name: 'אבי כהן', role: 'external', title: 'ספק פיתוח', org: 'חברת הפיתוח', color: '#30b0c7', account: true },
  { id: 'ronit', name: 'ד"ר רונית לוי', role: 'external', title: 'חוקרת', org: 'מחלקת המו"פ', color: '#af52de', account: false },
];

// Walk a template forward: close the first `done` stages, give the active one a target date.
function path(template, done, { target = 14, fill = {} } = {}) {
  const st = stagesFromTemplate(template).map((s, i) => ({
    ...s,
    state: i < done ? 'done' : i === done ? 'active' : 'todo',
    closedAt: i < done ? at(-7 * (done - i)) : null,
    target: i === done ? date(target) : null,
    fields: s.fields.map((f) => ({ ...f, value: fill[f.label] || '' })),
  }));
  return st;
}

const p1Stages = path('tool', 2, { target: 9, fill: { 'גבולות': 'אישורי כניסה לאורחים וספקים, בלי כרטיסי עובדים', 'הצורך במשפט': 'אישור כניסה תוך יום במקום שבוע', 'הדורש': 'מנהלת החלל' } });
const p2Stages = path('rnd', 5, { target: -3, fill: { 'גבולות': 'ניסוי מעבדה בלבד', 'פתרונות קיימים': 'נמצא ברשת המסווגת', 'הצורך במשפט': 'קישור יציב בתנאי שטח', 'הדורש': 'אגף המבצעים' } });
p2Stages[5].state = 'pending';
p2Stages[5].askedAt = at(-2);
p2Stages[5].fields = [{ label: 'תקציב', value: '', classified: true }, { label: 'אנשים', value: 'צוות של 3 + חוקרת' }, { label: 'לוח זמנים', value: '4 חודשים' }];
p2Stages[1].fields = p2Stages[1].fields.map((f) => ({ ...f, value: '', classified: true }));
const p3Stages = path('study', 1, { target: 5, fill: { 'גבולות': 'כלים שעובדים בלי ענן ציבורי' } });
const p4Stages = path('process', 2, { target: -1, fill: { 'הצורך במשפט': 'עובד חדש עובד ביום השני ולא בשבוע השני', 'הדורש': 'משאבי אנוש', 'קישור לתוכנית': 'https://example.org/onboarding-plan' } });
const p5Stages = [makeStage(null, 'שבועות 1-3'), makeStage(null, 'פרויקט גמר')];
p5Stages[0].state = 'active';

export const projects = [
  {
    id: 'p1', name: 'מערכת אישורי כניסה למנהלת החלל', color: '#ff9500', classification: 'open', template: 'tool',
    what: 'טופס ותהליך אישור דיגיטלי לכניסת אורחים וספקים, כדי שאישור ייקח יום ולא שבוע', forWhom: 'מנהלת החלל, קב"ט האתר', success: '80% מהבקשות מאושרות תוך יום עבודה', stopRule: 'אם עד סוף נובמבר אין הסכמה של הקב"ט על התהליך, עוצרים',
    manager: 'yahali', partners: ['yarden', 'avi'], stages: p1Stages, hill: 'up', confidence: 'on', confNote: '', lastUpdate: at(-3), tolDays: 14,
    log: [
      { id: 'l1', kind: 'decision', text: 'בונים על הטפסים הקיימים של האתר ולא מערכת חדשה', who: 'yahali', at: at(-10), reversible: true },
      { id: 'l2', kind: 'assumption', text: 'הקב"ט יסכים לאישור דיגיטלי בלי חתימה ידנית', who: 'yahali', at: at(-9), check: date(6) },
    ],
  },
  {
    id: 'p2', name: 'ניסוי תקשורת בתנאי שטח', color: '#5856d6', classification: 'restricted', template: 'rnd', trl: 3,
    what: 'ניסוי מעבדה שבודק אם הקישור מחזיק בתנאי שטח', forWhom: 'אגף המבצעים', success: '', stopRule: '',
    manager: 'yonatan', partners: ['ronit'], stages: p2Stages, hill: 'top', confidence: 'on', lastUpdate: at(-6), tolDays: 14,
    log: [{ id: 'l3', kind: 'decision', text: 'מתחילים בניסוי מעבדה לפני שטח', who: 'yonatan', at: at(-20), reversible: true }],
  },
  {
    id: 'p3', name: 'סקר כלים לניהול ידע', color: '#34c759', classification: 'open', template: 'study',
    what: 'למפות אילו כלים לניהול ידע מתאימים לצוותים בלי ענן ציבורי', forWhom: 'הצוות ויחידות שכנות', success: 'המלצה אחת עם שתי חלופות', stopRule: '',
    manager: 'yarden', partners: ['yahali'], stages: p3Stages, hill: 'up', confidence: 'risk', confNote: 'אין גישה לסביבת הבדיקות של מחלקת המחשוב',
    needsSenior: { what: 'פתיחת דלת למחלקת המחשוב כדי לקבל סביבת בדיקות', by: date(4), at: at(-1) }, lastUpdate: at(-1), tolDays: 14, log: [],
  },
  {
    id: 'p4', name: 'תהליך קליטת עובדים חדשים', color: '#30b0c7', classification: 'open', template: 'process',
    what: 'שעובד חדש יעבוד כבר ביום השני', forWhom: 'משאבי אנוש וכל הצוותים', success: 'עובד חדש פותח משימה ראשונה ביום השני', stopRule: '',
    manager: 'yonatan', partners: ['yarden'], stages: p4Stages, hill: 'down', confidence: 'stuck', confNote: 'מחכים למשאבי אנוש שיאשרו את הטופס החדש', stuckSince: at(-15), lastUpdate: at(-8), tolDays: 14, log: [],
  },
  {
    id: 'p5', name: 'קורס ניהול מוצר', color: '#ff2d55', classification: 'open', template: 'blank', personal: 'yahali',
    what: 'קורס ערב, 6 שבועות', forWhom: '', success: '', stopRule: '', manager: 'yahali', partners: [], stages: p5Stages, hill: 'top', confidence: 'on', lastUpdate: at(-2), log: [],
  },
];

const T = (id, title, project, stage, owner, status, due, extra = {}) => ({ id, title, project, stage, owner, by: extra.by || owner, status, due: due === null ? null : date(due), createdAt: at(-5), ...extra });
const st = (p, i) => projects.find((x) => x.id === p).stages[i].id;

export const tasks = [
  T('t1', 'לנסח את מסלול האישור עם הקב"ט', 'p1', st('p1', 2), 'yahali', 'doing', 1, { focus: true }),
  T('t2', 'לאסוף שלוש דוגמאות של טפסי כניסה', 'p1', st('p1', 2), 'yarden', 'done', -2),
  T('t3', 'לשלוח לספק את מסמך הדרישות', 'p1', st('p1', 2), 'yahali', 'todo', 2, { external: 'אבי כהן (ספק)' }),
  T('t4', 'הערכת עלות לפיתוח', 'p1', st('p1', 2), 'avi', 'todo', 6, { by: 'yahali' }),
  T('t5', 'להכין את תוכנית הניסוי לפגישת האישור', 'p2', st('p2', 5), 'yonatan', 'done', -1),
  T('t6', 'לתאם עם רונית זמן מעבדה', 'p2', st('p2', 5), 'yonatan', 'todo', 3),
  T('t7', 'לבנות טבלת השוואה של 8 כלים', 'p3', st('p3', 1), 'yarden', 'doing', 2, { focus: true }),
  T('t8', 'לראיין שני צוותים שכנים', 'p3', st('p3', 1), 'yahali', 'todo', 4),
  T('t9', 'לשלוח למשאבי אנוש את הטופס המעודכן', 'p4', st('p4', 2), 'yonatan', 'stuck', -3),
  T('t10', 'למסור למשאבי אנוש סיכום פיילוט', 'p4', st('p4', 2), 'yarden', 'todo', 1, { external: 'משאבי אנוש' }),
  T('t11', 'להעביר מצגת עדכון ליואש', 'p1', null, 'yahali', 'todo', 0, { by: 'yoash', fromCommander: true }),
  T('t12', 'שיעורי בית: פרסונה', 'p5', p5Stages[0].id, 'yahali', 'todo', 3, { personal: true }),
  T('t13', 'לקבוע תור לרכב', null, null, 'yahali', 'todo', 1, { personal: true }),
  T('t14', 'לסגור את סיכום החודש', null, null, 'yoash', 'todo', 2),
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
