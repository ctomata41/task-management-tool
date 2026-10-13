// Shared constants and helpers: statuses, dates (Hebrew), sorting, quick-add parsing.

export const STATUSES = [
  { id: 'todo', label: 'לא התחיל', color: 'var(--s-todo)' },
  { id: 'in_progress', label: 'בתהליך', color: 'var(--s-progress)' },
  { id: 'waiting', label: 'ממתין לאחר', color: 'var(--s-waiting)' },
  { id: 'blocked', label: 'תקוע', color: 'var(--s-blocked)' },
  { id: 'done', label: 'הושלם', color: 'var(--s-done)' },
];
export const STATUS = Object.fromEntries(STATUSES.map((s) => [s.id, s]));
const STATUS_RANK = { blocked: 0, in_progress: 1, waiting: 2, todo: 3, done: 4 };

export const PRIORITIES = [
  { id: 'high', label: 'גבוהה', color: 'var(--p-high)' },
  { id: 'medium', label: 'בינונית', color: 'var(--p-medium)' },
  { id: 'low', label: 'נמוכה', color: 'var(--p-low)' },
];
export const PRIORITY = Object.fromEntries(PRIORITIES.map((p) => [p.id, p]));
const PR_RANK = { high: 0, medium: 1, low: 2 };

export const HEALTH = [
  { id: 'on_track', label: 'בתלם', color: 'var(--h-on)' },
  { id: 'at_risk', label: 'בסיכון', color: 'var(--h-risk)' },
  { id: 'off_track', label: 'בחריגה', color: 'var(--h-off)' },
];
export const HEALTH_BY = Object.fromEntries(HEALTH.map((h) => [h.id, h]));

export const isOpen = (t) => t.status !== 'done';
export const isStuck = (t) => t.status === 'blocked' || t.status === 'waiting';

// ---------- dates ----------
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const today = () => ymd(new Date());
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
export function diffDays(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export const weekStart = (s = today()) => addDays(s, -parse(s).getDay()); // Sunday
export const weekEnd = (s = today()) => addDays(s, 6 - parse(s).getDay()); // Saturday

export function dueLabel(due) {
  if (!due) return '';
  const n = diffDays(today(), due);
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === -1) return 'אתמול';
  if (n < 0) return `לפני ${-n} ימים`;
  if (n < 7) return 'יום ' + DAYS[parse(due).getDay()];
  const d = parse(due);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
export function shortDate(s) { if (!s) return ''; const d = parse(s); return `${d.getDate()}/${d.getMonth() + 1}`; }
export function longDate(d = new Date()) { return `יום ${DAYS[d.getDay()]}, ${d.getDate()} ב${MONTHS[d.getMonth()]}`; }
export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'עכשיו';
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`;
  if (s < 86400) return `לפני ${Math.floor(s / 3600)} שע׳`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`;
}
export function daysSince(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)); }
export const isOverdue = (t) => !!t.due && t.status !== 'done' && t.due < today();
export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
}

// ---------- sorting ----------
function cmpDue(a, b) {
  if (a.due === b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return a.due < b.due ? -1 : 1;
}
export function byUrgency(a, b) {
  return cmpDue(a, b) || PR_RANK[a.priority] - PR_RANK[b.priority] || STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.created_at || '').localeCompare(b.created_at || '');
}
export function byStatus(a, b) { return STATUS_RANK[a.status] - STATUS_RANK[b.status] || byUrgency(a, b); }
export function bySort(a, b) { return (a.sort ?? Infinity) - (b.sort ?? Infinity) || (a.created_at || '').localeCompare(b.created_at || ''); }

// ---------- quick add: "להכין מצגת @ירדן #פיילוט מחר !" ----------
function nextWeekday(idx) {
  let add = (idx - new Date().getDay() + 7) % 7;
  if (add === 0) add = 7;
  return addDays(today(), add);
}
export function parseQuick(text, { people = [], projects = [] } = {}) {
  const out = {};
  const keep = [];
  const tokens = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.length > 1 && tk[0] === '@') {
      const q = tk.slice(1);
      const p = people.find((x) => x.name.startsWith(q)) || people.find((x) => x.name.includes(q));
      if (p) { out.owner_id = p.id; continue; }
    }
    if (tk.length > 1 && tk[0] === '#') {
      const q = tk.slice(1).replace(/_/g, ' ');
      const pr = projects.find((x) => x.name.startsWith(q)) || projects.find((x) => x.name.includes(q));
      if (pr) { out.project_id = pr.id; continue; }
    }
    if (tk === '!' || tk === '!!') { out.priority = 'high'; continue; }
    if (tk === '*' || tk === '⭐') { out.focus = true; continue; }
    if (tk === 'היום') { out.due = today(); continue; }
    if (tk === 'מחר') { out.due = addDays(today(), 1); continue; }
    if (tk === 'מחרתיים') { out.due = addDays(today(), 2); continue; }
    if ((tk === 'יום' || tk === 'ביום') && tokens[i + 1] && DAYS.includes(tokens[i + 1])) {
      out.due = nextWeekday(DAYS.indexOf(tokens[i + 1])); i++; continue;
    }
    if (tk.length > 2 && tk[0] === 'ב' && DAYS.includes(tk.slice(1))) { out.due = nextWeekday(DAYS.indexOf(tk.slice(1))); continue; }
    const m = tk.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/);
    if (m) {
      const d = +m[1], mo = +m[2];
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        let y = m[3] ? +m[3] : new Date().getFullYear();
        if (y < 100) y += 2000;
        let s = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!m[3] && s < today()) s = `${y + 1}${s.slice(4)}`;
        out.due = s;
        continue;
      }
    }
    keep.push(tk);
  }
  out.title = keep.join(' ').trim();
  return out;
}

// ---------- people ----------
const AVATAR_COLORS = ['#3B5BDB', '#0C8599', '#D9480F', '#2B8A3E', '#AE3EC9', '#C2255C', '#5F3DC4', '#1971C2'];
export function personColor(p) {
  if (!p) return 'var(--fg-3)';
  if (p.name === 'Claude') return '#C15F3C';
  // Team members get distinct colours by their order; everyone else is hashed.
  if (p.is_team && Number.isFinite(p.sort) && p.sort > 0) return AVATAR_COLORS[(p.sort - 1) % AVATAR_COLORS.length];
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
// Two-letter labels that stay unique within the team. All four pilot names start with "י",
// so one letter would make every avatar look the same (יואש -> יו, יונתן -> ינ, יהלי -> יה, ירדן -> יר).
const abbrCache = new WeakMap();
function buildAbbr(people) {
  const map = new Map();
  const used = new Set();
  [...people].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999)).forEach((p) => {
    const name = (p.name || '').trim();
    const words = name.split(/\s+/).filter(Boolean);
    let label;
    if (/^[A-Za-z]/.test(name)) label = name[0].toUpperCase();
    else if (words.length > 1) label = words[0][0] + words[1][0];
    else {
      const letters = [...name];
      label = letters.slice(0, 2).join('');
      for (let i = 2; i < letters.length && used.has(label); i++) label = letters[0] + letters[i];
    }
    used.add(label);
    map.set(p.id, label);
  });
  return map;
}
export function initials(p, people) {
  if (!p) return '?';
  if (people && people.length) {
    let map = abbrCache.get(people);
    if (!map) { map = buildAbbr(people); abbrCache.set(people, map); }
    if (map.has(p.id)) return map.get(p.id);
  }
  return /^[A-Za-z]/.test(p.name) ? p.name[0].toUpperCase() : [...p.name.trim()].slice(0, 2).join('');
}
