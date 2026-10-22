// Project templates: the six kinds of project in the spec, each with the milestones it usually goes through. Picking
// one when a project opens lays its milestones out over the time budget (2, 6 or 12 weeks); every milestone can then
// be renamed, moved, added or removed, by people here or by Claude through set_plan.
export const TEMPLATES = [
  { id: 'block', label: 'אבן בניין', icon: 'layers', color: '#5856d6', blurb: 'יכולת טכנולוגית, הרבה עבודה ידנית',
    steps: ['הגדרת הצורך והדרישות', 'סקר פתרונות קיימים', 'תכן', 'אב-טיפוס', 'ניסוי ובדיקות', 'מסירה ושילוב'] },
  { id: 'app', label: 'אפליקציה או כלי', icon: 'code', color: '#0071e3', blurb: 'מערכת שאנשים ישתמשו בה',
    steps: ['אפיון', 'עיצוב ואב-טיפוס', 'גרסה ראשונה', 'בדיקה עם משתמשים', 'השקה', 'שיפורים אחרי השקה'] },
  { id: 'research', label: 'מחקר', icon: 'search', color: '#30b0c7', blurb: 'מחקר עבור גורם אחר',
    steps: ['שאלת המחקר עם הגורם', 'איסוף מקורות', 'ניתוח', 'טיוטת ממצאים', 'הצגה לגורם', 'גרסה סופית'] },
  { id: 'partner', label: 'שיתוף פעולה', icon: 'users', color: '#34c759', blurb: 'שותפים ואקוסיסטם',
    steps: ['מיפוי שותפים', 'פגישות היכרות', 'מטרה משותפת', 'הסכם עבודה', 'פיילוט משותף', 'סיכום והמשך'] },
  { id: 'content', label: 'תוכן ושיווק', icon: 'play', color: '#ff2d55', blurb: 'סרטון, מצגת, קמפיין',
    steps: ['מטרה וקהל', 'מסר וקונספט', 'הפקה', 'אישורים', 'הפצה', 'מדידה'] },
  { id: 'event', label: 'אירוע או כנס', icon: 'calendar', color: '#ff9500', blurb: 'מהרעיון ועד הסיכום',
    steps: ['מטרה ותקציב', 'מקום ותאריך', 'תוכן ודוברים', 'הזמנות והרשמה', 'לוגיסטיקה', 'האירוע', 'סיכום'] },
  { id: 'blank', label: 'מאפס', icon: 'plus', color: '#8e8e93', blurb: 'Claude בונה את השלבים איתך', steps: [] },
];
export const BUDGETS = [{ id: '2', label: 'שבועיים' }, { id: '6', label: '6 שבועות' }, { id: '12', label: '12 שבועות' }];

const DAY = 864e5;
export const isoDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let n = 0;
export const msId = () => `m${Date.now().toString(36)}${(n++).toString(36)}`;

// The template's milestones, spread evenly over the budget from today.
export function layout(templateId, weeks) {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES.at(-1);
  const total = +weeks * 7 * DAY;
  const start = Date.now();
  return t.steps.map((title, i) => ({ id: msId(), title, due: isoDay(start + Math.round(total * (i + 1) / t.steps.length)), done: false }));
}
