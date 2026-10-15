// Sample data for the prototype. Nothing here touches the real database: the prototype runs in memory only.
// Times are relative to now, so the demo always looks current.
const H = 3600e3;
const D = 24 * H;
const now = Date.now();
export const ago = (ms) => new Date(now - ms).toISOString();
export const ahead = (ms) => new Date(now + ms).toISOString();
const day0 = new Date(); day0.setHours(0, 0, 0, 0);
// A time on a day relative to today: at(1, 10) = tomorrow at 10:00.
export const at = (d, h, m = 0) => new Date(day0.getTime() + d * D + h * H + m * 60e3).toISOString();

export const people = [
  { id: 'yoash', name: 'יואש', role: 'מפקד', color: '#3B5BDB' },
  { id: 'yonatan', name: 'יונתן', role: 'סגן', color: '#0C8599' },
  { id: 'yahali', name: 'יהלי', role: 'צוות CTO', color: '#D9480F' },
  { id: 'yarden', name: 'ירדן', role: 'יועץ סטודנט', color: '#2B8A3E' },
];

export const projects = [
  {
    id: 'platform', name: 'פלטפורמת הצוות', emoji: '◆', color: '#5856d6', lead: 'yahali', partners: ['yonatan'],
    goal: 'שכבה אחת מעל Claude שמראה לצוות מה מוכן, מה תקוע ומה מחכה למי',
    stage: 'בנייה', start: at(-6, 0), end: at(15, 0),
    milestones: [
      { id: 'm1', title: 'אפיון', start: at(-6, 0), end: at(-1, 0), done: true },
      { id: 'm2', title: 'אב-טיפוס', start: at(-1, 0), end: at(1, 0) },
      { id: 'm3', title: 'מחבר ל-Claude', start: at(1, 0), end: at(8, 0) },
      { id: 'm4', title: 'פיילוט צוות', start: at(1, 0), end: at(15, 0) },
    ],
  },
  {
    id: 'voice', name: 'סוכן קולי לצוות', emoji: '◉', color: '#ff2d55', lead: 'yonatan', partners: ['yahali'],
    goal: 'הודעה קולית מהטלפון שהופכת להחלטות, פגישות ומשימות',
    stage: 'ניסוי', start: at(-3, 0), end: at(20, 0),
    milestones: [
      { id: 'v1', title: 'בדיקת ספקים', start: at(-3, 0), end: at(0, 0), done: true },
      { id: 'v2', title: 'תמלול עברית', start: at(0, 0), end: at(5, 0) },
      { id: 'v3', title: 'כרטיסי טיוטה', start: at(4, 0), end: at(12, 0) },
      { id: 'v4', title: 'סוכן חי', start: at(12, 0), end: at(20, 0) },
    ],
  },
  {
    id: 'summit', name: 'כנס חדשנות 2027', emoji: '✦', color: '#ff9500', lead: 'yarden', partners: ['yahali', 'yonatan'],
    goal: 'כנס של חצי יום ל-200 משתתפים, עם 6 הדגמות של פרויקטים שנבנו עם Claude',
    stage: 'תכנון', start: at(-10, 0), end: at(45, 0),
    milestones: [
      { id: 's1', title: 'קונספט ותקציב', start: at(-10, 0), end: at(-2, 0), done: true },
      { id: 's2', title: 'דוברים', start: at(-2, 0), end: at(10, 0) },
      { id: 's3', title: 'אולם והפקה', start: at(3, 0), end: at(25, 0) },
      { id: 's4', title: 'יום הכנס', start: at(44, 0), end: at(45, 0) },
    ],
  },
  {
    id: 'search', name: 'חיפוש חכם במסמכים', emoji: '▲', color: '#30b0c7', lead: 'yonatan', partners: ['yarden'],
    goal: 'אבן בניין: חיפוש סמנטי בעברית על מאגר מסמכים פתוח',
    stage: 'בנייה', start: at(-14, 0), end: at(7, 0),
    milestones: [
      { id: 'q1', title: 'מאגר ובדיקות', start: at(-14, 0), end: at(-7, 0), done: true },
      { id: 'q2', title: 'מנוע ראשון', start: at(-7, 0), end: at(1, 0) },
      { id: 'q3', title: 'ממשק', start: at(1, 0), end: at(7, 0) },
    ],
  },
  {
    id: 'method', name: 'מתודה לפרויקטים במקביל', emoji: '●', color: '#34c759', lead: 'yahali', partners: [],
    goal: 'דרך עבודה שבה אדם אחד ו-Claude מריצים כמה פרויקטים בבת אחת',
    stage: 'הנבטה', start: at(-4, 0), end: at(14, 0),
    milestones: [
      { id: 'x1', title: 'מחקר', start: at(-4, 0), end: at(-1, 0), done: true },
      { id: 'x2', title: 'פיילוט על 2 יוזמות', start: at(0, 0), end: at(14, 0) },
    ],
  },
];

// What each Claude is doing right now, as it reports it through the connector.
// state: run (working), wait (stopped on a person), review (done, waiting for a look), done.
export const agents = [
  { id: 'a1', project: 'platform', owner: 'yahali', title: 'בניית אב-טיפוס של מרכז הבקרה', state: 'run', progress: 0.62, step: 'מחבר את מסך היומן לגאנט', started: ago(2 * H), kind: 'code', yields: { kind: 'app', title: 'אב-טיפוס לחיץ של מרכז הבקרה', summary: 'שבעה מסכים על נתוני דמה, בעיצוב Apple' } },
  { id: 'a2', project: 'platform', owner: 'yahali', title: 'סרטון הסבר, גרסה 2', state: 'run', progress: 0.9, step: 'מרנדר את הסצנה האחרונה', started: ago(50 * 60e3), kind: 'video', yields: { kind: 'video', title: 'סרטון הסבר על הפלטפורמה, גרסה 2', summary: '2:58 דקות, עם הקריינות החדשה ובלי הסצנה על התקציב' } },
  { id: 'a3', project: 'voice', owner: 'yonatan', title: 'בדיקת תמלול עברית על 20 הקלטות', state: 'wait', progress: 0.35, step: 'מחכה למפתח API של ElevenLabs', started: ago(30 * H), kind: 'research' },
  { id: 'a4', project: 'summit', owner: 'yarden', title: 'רשימת דוברים מוצעת עם נימוקים', state: 'review', progress: 1, step: 'מוכן לבדיקה', started: ago(20 * H), kind: 'research' },
  { id: 'a5', project: 'search', owner: 'yonatan', title: 'מנוע חיפוש ראשון ומדידת דיוק', state: 'run', progress: 0.48, step: 'מריץ 300 שאילתות בדיקה', started: ago(5 * H), kind: 'code', yields: { kind: 'report', title: 'דוח דיוק: מנוע חיפוש ראשון', summary: 'דיוק 81% ב-10 התוצאות הראשונות, ו-3 כיווני שיפור' } },
  { id: 'a6', project: 'summit', owner: 'yahali', title: 'סקר אולמות ומחירים', state: 'wait', progress: 0.55, step: 'מחכה לתאריך מועדף לכנס', started: ago(26 * H), kind: 'research' },
  { id: 'a7', project: 'method', owner: 'yahali', title: 'תבנית כרטיס פתיחה ליוזמה חדשה', state: 'done', progress: 1, step: 'הסתיים', started: ago(28 * H), kind: 'doc' },
];

// What Claude produced, collected automatically from the sessions.
export const outputs = [
  { id: 'o1', project: 'method', agent: 'a7', kind: 'doc', title: 'מתודה לניהול פרויקטים במקביל: מיוזמה ועד הנבטה', summary: '5 שלבים עם שערים, 7 כללים לעבודה במקביל ומקורות מאומתים', at: ago(26 * 60e3), url: 'https://claude.ai/code/artifact/9f46c501-5955-4561-9afb-fe84b516f08b', fresh: true },
  { id: 'o2', project: 'platform', kind: 'video', title: 'סרטון הסבר על הפלטפורמה', summary: '3:34 דקות, 1080p, טקסט בעברית ומוזיקת רקע', at: ago(3 * H), url: '#', fresh: true, duration: '3:34' },
  { id: 'o3', project: 'summit', agent: 'a4', kind: 'research', title: 'רשימת דוברים מוצעת', summary: '12 דוברים ב-3 רמות, עם סיבה ועם דרך פנייה לכל אחד', at: ago(9 * H), url: '#', fresh: true, review: true },
  { id: 'o4', project: 'platform', kind: 'doc', title: 'אפיון הפלטפורמה, גרסה סופית', summary: '14 פרקים, 5 בדיקות עצמאיות ונספח החלטות', at: ago(20 * H), url: 'https://claude.ai/code/artifact/edf1594b-d399-42d4-934b-d2ffc89ab984' },
  { id: 'o5', project: 'platform', kind: 'chart', title: 'גאנט הפיילוט', summary: '38 משימות ב-4 שבועות, עם תלויות', at: ago(28 * H), url: 'https://claude.ai/artifact/QJeyDhbwQrVvsXJCuV1Czz' },
  { id: 'o6', project: 'search', kind: 'code', title: 'מאגר בדיקות: 300 שאלות ותשובות', summary: 'נבנה מ-40 מסמכים פתוחים, עם תשובה מסומנת לכל שאלה', at: ago(3 * D), url: '#' },
  { id: 'o7', project: 'voice', kind: 'research', title: 'השוואת ספקי קול בעברית', summary: '4 ספקים, מחיר לשעה, איכות עברית וזמן תגובה', at: ago(2 * D), url: '#' },
];

// Decisions that wait for a person. Claude proposes the options and recommends one.
export const decisions = [
  {
    id: 'd1', project: 'summit', owner: 'yahali', due: at(1, 12), created: ago(40 * H),
    q: 'באיזה תאריך הכנס?', unblocks: 'סקר האולמות של Claude', agent: 'a6',
    options: [
      { id: 'a', label: '18 בפברואר', why: 'אחרי סוף הסמסטר, ושלושה אולמות עוד פנויים' },
      { id: 'b', label: '4 במרץ', why: 'יותר זמן להכין הדגמות, אבל רק אולם אחד פנוי' },
      { id: 'c', label: '25 במרץ', why: 'חופף לכנס אחר בתחום' },
    ],
    rec: 'a',
  },
  {
    id: 'd2', project: 'platform', owner: 'yahali', due: at(0, 18), created: ago(5 * H),
    q: 'מה נכנס לפיילוט של יום חמישי?', unblocks: 'תוכנית ההשקה ומסמך הפתיחה לצוות',
    options: [
      { id: 'a', label: 'מה מחכה לי ותוצרים', why: 'הכי מהר לערך, בלי חיבור ל-Claude ביום הראשון' },
      { id: 'b', label: 'הכל כולל המחבר', why: 'החוויה המלאה, אבל תלוי באישור קצין הביטחון' },
    ],
    rec: 'a',
  },
  {
    id: 'd3', project: 'voice', owner: 'yonatan', due: at(2, 12), created: ago(20 * H),
    q: 'באיזה ספק תמלול להתחיל?', unblocks: 'בדיקת התמלול על 20 הקלטות',
    options: [
      { id: 'a', label: 'ElevenLabs Scribe', why: 'הכי טוב בעברית בבדיקה, 22 סנט לשעה' },
      { id: 'b', label: 'Whisper', why: 'זול יותר, אבל חלש בשמות ובמונחים' },
    ],
    rec: 'a',
  },
  {
    id: 'd4', project: 'search', owner: 'yonatan', due: at(3, 12), created: ago(8 * H),
    q: 'לאשר את מאגר הבדיקות כבסיס למדידה?', unblocks: 'מדידת הדיוק של המנוע',
    options: [
      { id: 'a', label: 'לאשר', why: '300 שאלות מכסות את כל סוגי המסמכים' },
      { id: 'b', label: 'להוסיף 50 שאלות קשות', why: 'עוד יום עבודה, מדידה מחמירה יותר' },
    ],
    rec: 'a',
  },
];

// Things only a person can do, and without which Claude can't go on.
export const humanTasks = [
  { id: 'h1', project: 'voice', type: 'connect', owner: 'yonatan', title: 'לחבר מפתח API של ElevenLabs', blocks: 'a3', created: ago(30 * H), cta: 'חיבור' },
  { id: 'h2', project: 'platform', type: 'auth', owner: 'yahali', title: 'אישור קצין הביטחון למחבר ל-Claude', blocks: null, created: ago(20 * H), cta: 'שליחת התקציר', note: 'תקציר של עמוד אחד כבר מוכן' },
  { id: 'h3', project: 'summit', type: 'file', owner: 'yahali', title: 'להעלות את התקציב המאושר לכנס', blocks: 'a6', created: ago(6 * H), cta: 'העלאה' },
  { id: 'h4', project: 'search', type: 'pay', owner: 'yonatan', title: 'לרכוש קרדיט API לבדיקות (כ-40 דולר)', blocks: 'a5', created: ago(2 * H), cta: 'אישור תשלום' },
];

// Meetings Claude wants set up, with times it found free in everyone's calendar.
export const meetingAsks = [
  { id: 'r1', project: 'summit', owner: 'yahali', title: 'סנכרון דוברים עם ירדן', with: ['yarden'], mins: 30, why: 'Claude צריך החלטה על 3 דוברים מובילים', slots: [at(1, 10), at(1, 14, 30), at(2, 9)] },
  { id: 'r2', project: 'voice', owner: 'yahali', title: 'הדגמת תמלול ראשונה', with: ['yonatan'], mins: 20, why: 'אחרי שבדיקת התמלול תסתיים', slots: [at(2, 11), at(2, 15)] },
];

// The calendar, as synced from Google Calendar. src: google (already there) or here (set up from the platform).
export const events = [
  { id: 'e1', title: 'דיילי צוות', start: at(0, 9), mins: 15, with: ['yoash', 'yonatan', 'yarden'], src: 'google' },
  { id: 'e2', title: 'הדגמה ליונתן', project: 'platform', start: at(0, 12), mins: 45, with: ['yonatan'], src: 'here' },
  { id: 'e3', title: 'שיחה עם אולם האירועים', project: 'summit', start: at(0, 15), mins: 30, with: ['yarden'], src: 'here', summary: true },
  { id: 'e4', title: 'השקת הפיילוט לצוות', project: 'platform', start: at(1, 9), mins: 60, with: ['yoash', 'yonatan', 'yarden'], src: 'here' },
  { id: 'e5', title: 'פגישה שבועית', start: at(1, 13), mins: 60, with: ['yoash', 'yonatan', 'yarden'], src: 'google' },
  { id: 'e6', title: 'ישיבת תקציב', start: at(-1, 11), mins: 60, with: ['yoash'], src: 'google', summary: true, summaryText: 'הוחלט על תקרה של 50 דולר בחודש לקול. יונתן בודק מי משלם. Claude פתח מטלה ליונתן.' },
  { id: 'e7', title: 'סקירת חיפוש חכם', project: 'search', start: at(2, 10), mins: 30, with: ['yonatan', 'yarden'], src: 'google' },
  { id: 'e8', title: 'סדנת Claude Code', start: at(3, 14), mins: 90, with: ['yonatan', 'yarden'], src: 'google' },
];

// What happened since the person was last here, written by the platform from what Claude reported.
export const feed = [
  { id: 'f1', project: 'method', at: ago(26 * 60e3), text: 'Claude סיים את מסמך המתודה והעלה אותו', kind: 'output' },
  { id: 'f2', project: 'platform', at: ago(70 * 60e3), text: 'סשן האב-טיפוס עבר את שלב העיצוב, 62% הושלם', kind: 'progress' },
  { id: 'f2b', project: 'platform', at: ago(3 * H), text: 'Claude סיים את סרטון ההסבר והעלה אותו', kind: 'output' },
  { id: 'f2c', project: 'platform', at: ago(5 * H), text: 'Claude פתח החלטה: מה נכנס לפיילוט של יום חמישי', kind: 'decision' },
  { id: 'f2d', project: 'platform', at: ago(20 * H), text: 'האפיון הסופי מוכן, ממתין לאישור יונתן', kind: 'review' },
  { id: 'f3', project: 'summit', at: ago(9 * H), text: 'רשימת הדוברים מוכנה ומחכה לבדיקה של ירדן', kind: 'review' },
  { id: 'f4', project: 'voice', at: ago(30 * H), text: 'בדיקת התמלול נעצרה: חסר מפתח API', kind: 'stuck' },
  { id: 'f5', project: 'summit', at: ago(40 * H), text: 'Claude פתח החלטה: באיזה תאריך הכנס', kind: 'decision' },
];

// Ongoing interview: Claude breaks each project's goal into the decisions it needs from people.
export const interviews = {
  platform: {
    goal: 'שכבה אחת מעל Claude שמראה לצוות מה מוכן, מה תקוע ומה מחכה למי',
    tree: [
      { title: 'מה הצוות רואה', decided: ['מסך הבית הוא "היום"', 'משימות Claude מוסתרות כברירת מחדל'], open: ['האם יואש מקבל גרסה משלו'] },
      { title: 'איך Claude מתחבר', decided: ['מחבר MCP אישי לכל אחד'], open: ['מה Claude מעדכן לבד ומה דורש אישור', 'מאיזה פרויקט מתחילים'] },
      { title: 'איך מודדים הצלחה', decided: [], open: ['מה המדד הראשי של הפיילוט'] },
    ],
    questions: [
      {
        id: 'q1', branch: 'איך Claude מתחבר', resolves: 'מה Claude מעדכן לבד ומה דורש אישור', q: 'כש-Claude מסיים תוצר, מה הוא עושה לבד?',
        context: 'היום כל תוצר מגיע בצ׳אט ומועבר ידנית. אם Claude יעלה לבד, התוצר יופיע ב"היום" עם קישור.',
        options: [
          { id: 'a', label: 'מעלה ומסמן "מוכן לבדיקה"', why: 'אישור בנגיעה, וכלום לא נסגר בלי אדם', rec: true },
          { id: 'b', label: 'מעלה וסוגר את המשימה', why: 'הכי מהר, אבל אין עין אנושית על התוצר' },
          { id: 'c', label: 'רק מציע, ואני מעלה', why: 'שליטה מלאה, ומשאיר את העבודה הידנית' },
        ],
      },
      {
        id: 'q2', branch: 'איך מודדים הצלחה', resolves: 'מה המדד הראשי של הפיילוט', q: 'מה המדד הראשי של הפיילוט?',
        context: 'מדד אחד שהצוות יראה כל שבוע. אפשר לשנות אותו ברטרו ב-29/10.',
        options: [
          { id: 'a', label: 'זמן המתנה של Claude לאנשים', why: 'מודד בדיוק את צוואר הבקבוק שהפלטפורמה באה לפתור', rec: true },
          { id: 'b', label: 'מספר תוצרים בשבוע', why: 'קל למדוד, אבל מעודד כמות ולא איכות' },
          { id: 'c', label: 'החלטות שהתקבלו בזמן', why: 'טוב לקצב, אבל לא מראה את עבודת Claude' },
        ],
      },
      {
        id: 'q3', branch: 'מה הצוות רואה', resolves: 'האם יואש מקבל גרסה משלו', q: 'האם יואש מקבל מסך משלו?',
        context: 'יואש עובד בעיקר ברשת המסווגת ובלי Claude. מסך של דקה בטלפון יכול להספיק לו.',
        options: [
          { id: 'a', label: 'כן, מסך של דקה בטלפון', why: 'רק החלטות שמחכות לו ושורה לכל פרויקט', rec: true },
          { id: 'b', label: 'לא, אותו מסך כמו כולם', why: 'פשוט יותר, אבל עמוס בשבילו' },
        ],
      },
    ],
  },
  summit: {
    goal: 'כנס של חצי יום ל-200 משתתפים, עם 6 הדגמות',
    tree: [
      { title: 'קהל ומטרה', decided: ['200 משתתפים', 'חצי יום'], open: [] },
      { title: 'תוכן', decided: ['6 הדגמות'], open: ['מי הדובר המרכזי'] },
      { title: 'הפקה', decided: [], open: ['תאריך', 'פיזי או היברידי'] },
    ],
    questions: [
      {
        id: 'q1', branch: 'הפקה', resolves: 'פיזי או היברידי', q: 'הכנס פיזי או היברידי?',
        context: 'שידור חי מוסיף כ-15% לתקציב, ומכפיל את הקהל.',
        options: [
          { id: 'a', label: 'היברידי', why: 'מגיע גם למי שלא יכול להגיע, ו-Claude מכין את השידור', rec: true },
          { id: 'b', label: 'פיזי בלבד', why: 'זול ופשוט יותר' },
        ],
      },
    ],
  },
};

// The capabilities of Claude, as a visual launcher. Each opens a session with the project's brief already written.
export const tools = [
  { id: 'research', label: 'מחקר עמוק', icon: 'search', color: '#0071e3', blurb: 'מחקר עם מקורות מאומתים', brief: 'לחקור את {goal}, עם מקורות מ-2026 בלבד, ולסכם ב-5 ממצאים ו-3 המלצות.' },
  { id: 'video', label: 'סרטון', icon: 'play', color: '#ff2d55', blurb: 'סרטון הסבר או הדגמה', brief: 'להכין סרטון הסבר של עד 3 דקות על {name}, בעברית, עם כתוביות.' },
  { id: 'doc', label: 'מסמך', icon: 'file', color: '#5856d6', blurb: 'מסמך, אפיון או תקציר', brief: 'לכתוב מסמך של עמוד אחד על {name}: רקע, מטרה, החלטות פתוחות.' },
  { id: 'deck', label: 'מצגת', icon: 'grid', color: '#ff9500', blurb: 'מצגת להצגה בפגישה', brief: 'להכין מצגת של 8 שקפים על {name} לפגישה השבועית.' },
  { id: 'app', label: 'אפליקציה', icon: 'code', color: '#34c759', blurb: 'אב-טיפוס או כלי עובד', brief: 'לבנות אב-טיפוס לחיץ של {name}, ולהעלות תצוגה מקדימה.' },
  { id: 'data', label: 'ניתוח נתונים', icon: 'chart', color: '#30b0c7', blurb: 'גרפים ותובנות מקובץ', brief: 'לנתח את הקובץ המצורף ולהציג 3 תובנות עם גרף לכל אחת.' },
  { id: 'meeting', label: 'סיכום פגישה', icon: 'message', color: '#af52de', blurb: 'סיכום, החלטות ומשימות', brief: 'לסכם את הפגישה האחרונה של {name}: החלטות, מטלות ומי אחראי.' },
  { id: 'routine', label: 'סוכן קבוע', icon: 'clock', color: '#8e8e93', blurb: 'משימה שחוזרת כל יום או שבוע', brief: 'כל יום ב-08:00 לבדוק מה השתנה ב-{name} ולעדכן את הפלטפורמה.' },
];

// The numbers behind "תובנות", for the last six weeks and this one.
export const weekly = {
  labels: ['ש׳ 1', 'ש׳ 2', 'ש׳ 3', 'ש׳ 4', 'ש׳ 5', 'השבוע'],
  outputs: [3, 5, 4, 8, 11, 14],
  waitHours: [41, 36, 38, 24, 19, 12],
  decisionHours: [52, 40, 44, 30, 22, 17],
};
