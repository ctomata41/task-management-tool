// "יומן": the week from each person's Google Calendar, what the platform set up marked, the team's busy times, and the
// Gantt of every project. On real data the calendar comes through the `gcal` function (live.js gcal); each person
// connects their own Google account once, and events made here go straight into their calendar.
import { useState } from 'preact/hooks';
import { html, Icon, Seg, Faces, Avatar, hm } from '../ui.js';
import { MeetingAsk } from '../parts.js';
import { Gantt } from './gantt.js';
import { useStore, myProjects, myMeetingAsks, project, person, openSheet, closeSheet, addEvent, toast } from '../store.js';
import { gcal } from '../live.js';
import { haptic } from '../../app/motion.js';

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const H0 = 8;
const H1 = 19;

function Status({ s }) {
  const g = s.gcalInfo;
  if (!g?.live) return html`<span class="gsync"><span class="gdot"></span>מסונכרן עם Google Calendar</span> פגישות שנקבעו כאן נכנסות ליומן לבד, ואחריהן מגיע סיכום`;
  if (g.loading) return 'בודק את החיבור ליומן גוגל…';
  if (g.unavailable) return 'החיבור ליומן גוגל לא זמין כרגע. הגאנט כבר מחושב מאבני הדרך של הפרויקטים.';
  if (!g.configured) return 'חיבור יומן גוגל עוד לא הוגדר לצוות. הגאנט כבר מחושב מאבני הדרך של הפרויקטים.';
  if (g.connected) return html`<span class="gsync"><span class="gdot"></span>מחובר ל-Google Calendar</span> ${g.email}. אירועים שנקבעים כאן נכנסים ליומן שלך, וההזמנות יוצאות לצוות`;
  if (g.error) return g.error;
  if (g.elsewhere) return 'היומן שלך מחובר ממכשיר אחר. כדי לראות אותו כאן, מחברים שוב במכשיר הזה.';
  return 'מחברים את יומן גוגל פעם אחת, ואז רואים כאן את השבוע, את הזמנים התפוסים של הצוות, וקובעים פגישות ישר מכאן.';
}

export function Calendar() {
  const s = useStore();
  const g = s.gcalInfo;
  const live = !!g?.live;
  const [view, setView] = useState(null);
  const [who, setWho] = useState('me');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const shown = view || (s.gcal ? 'week' : 'gantt');
  const sun = new Date(); sun.setHours(0, 0, 0, 0); sun.setDate(sun.getDate() - sun.getDay());
  const days = [0, 1, 2, 3, 4].map((i) => new Date(sun.getTime() + i * 864e5));
  const meets = myMeetingAsks();
  const mine = myProjects();
  const from = mine.length ? new Date(Math.min(...mine.map((p) => new Date(p.start)))).toISOString() : new Date().toISOString();
  const nowH = new Date().getHours() + new Date().getMinutes() / 60;
  const ev = open && s.events.find((e) => e.id === open);
  const team = s.teamBusy || [];
  const canMake = !live || g.connected;

  const connect = async () => {
    setBusy(true);
    try { await gcal.connect(); } catch (e) { toast(e.message || 'לא הצלחתי להתחיל את החיבור'); setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try { await gcal.disconnect(); toast('היומן נותק. הפלטפורמה כבר לא ניגשת אליו'); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const place = (start, mins) => {
    const st = new Date(start); const hh = st.getHours() + st.getMinutes() / 60;
    const top = Math.max(0, (hh - H0) / (H1 - H0)) * 100;
    const end = Math.min(H1, hh + mins / 60);
    return { top, height: Math.max(5, ((end - Math.max(hh, H0)) / (H1 - H0)) * 100), visible: end > H0 && hh < H1 };
  };

  return html`<div class="page">
    <header class="page-head"><div><h1>יומן וגאנט</h1><p class="sub"><${Status} s=${s} /></p></div>
      <div class="row-gap wrap cal-actions">
        ${live && g.configured && !g.connected && !g.loading ? html`<button type="button" class="btn btn-primary" disabled=${busy} onClick=${connect}><${Icon} name="calendar" size=${16} />חיבור יומן Google</button>` : null}
        ${canMake && !g?.loading ? html`<button type="button" class="btn btn-primary" onClick=${() => openSheet('event')}><${Icon} name="plus" size=${16} />אירוע חדש</button>` : null}
        <${Seg} value=${shown} onChange=${setView} label="תצוגה" options=${[{ id: 'week', label: 'שבוע' }, { id: 'gantt', label: 'גאנט' }]} />
      </div></header>
    ${shown === 'week' ? html`<div class="cal-wrap">
      <div class="card cal">
        ${team.length ? html`<div class="cal-who"><${Seg} value=${who} onChange=${setWho} label="של מי" options=${[{ id: 'me', label: 'שלי' }, { id: 'team', label: 'עם הצוות' }]} /></div>` : null}
        <div class="cal-head"><span></span>${days.map((d) => html`<span class=${d.toDateString() === new Date().toDateString() ? 'today' : ''}>${DAYS[d.getDay()]} <b>${d.getDate()}</b></span>`)}</div>
        <div class="cal-body" style=${`--rows:${H1 - H0}`}>
          <div class="cal-hours">${Array.from({ length: H1 - H0 }, (_, i) => html`<span>${H0 + i}:00</span>`)}</div>
          ${days.map((d) => {
            const list = s.events.filter((e) => new Date(e.start).toDateString() === d.toDateString());
            const isToday = d.toDateString() === new Date().toDateString();
            const others = who === 'team' ? team.flatMap((t) => t.busy.filter((b) => new Date(b.start).toDateString() === d.toDateString()).map((b) => ({ ...b, person: t.person }))) : [];
            return html`<div class="cal-day">
              ${isToday && nowH > H0 && nowH < H1 ? html`<span class="cal-now" style=${`top:${((nowH - H0) / (H1 - H0)) * 100}%`}></span>` : null}
              ${others.map((b, i) => {
                const pl = place(b.start, b.mins);
                if (!pl.visible) return null;
                return html`<div class="cal-busy" key=${'b' + i} style=${`top:${pl.top}%;height:${pl.height}%`} title=${`${person(b.person).name}: תפוס ${hm(b.start)}`}>
                  <${Avatar} id=${b.person} size=${18} /><span>תפוס</span></div>`;
              })}
              ${list.map((e) => {
                const pl = place(e.start, e.mins);
                if (!pl.visible) return null;
                const c = e.project ? project(e.project).color : 'var(--s-todo)';
                return html`<button type="button" class=${'cal-ev' + (e.src === 'here' ? ' here' : '') + (e.fresh ? ' fresh' : '')}
                  style=${`top:${pl.top}%;height:${pl.height}%;--c:${c}`} onClick=${() => setOpen(e.id)}>
                  <strong>${e.title}</strong><span>${hm(e.start)}${e.src === 'here' ? ' · מהפלטפורמה' : ''}</span></button>`;
              })}
            </div>`;
          })}
        </div>
      </div>
      <aside class="col-side">
        ${ev ? html`<section class="card side-card evdetail" style=${`--c:${ev.project ? project(ev.project).color : 'var(--s-todo)'}`}>
          <div class="sec-head"><h2>${ev.title}</h2><button type="button" class="icon-btn sm" aria-label="סגירה" onClick=${() => setOpen(null)}><${Icon} name="x" size=${14} /></button></div>
          <p class="muted">${new Date(ev.start).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' })}, ${hm(ev.start)} · ${ev.mins} דק׳</p>
          ${ev.project ? html`<p>פרויקט: <a href=${`#/project/${ev.project}`}>${project(ev.project).name}</a></p>` : null}
          ${ev.with?.length ? html`<p class="row-gap"><${Faces} ids=${ev.with} size=${24} /></p>` : null}
          ${ev.link || ev.meet ? html`<div class="row-gap wrap">
            ${ev.link ? html`<a class="btn sm" href=${ev.link} target="_blank" rel="noopener"><${Icon} name="external" size=${14} />ביומן Google</a>` : null}
            ${ev.meet ? html`<a class="btn sm" href=${ev.meet} target="_blank" rel="noopener"><${Icon} name="play" size=${14} />Meet</a>` : null}</div>` : null}
          ${ev.summaryText ? html`<div class="sumbox"><strong><${Icon} name="sparkle" size=${14} /> סיכום אוטומטי</strong><p>${ev.summaryText}</p></div>`
            : ev.summary ? html`<p class="muted small"><${Icon} name="sparkle" size=${13} /> Claude יסכם את הפגישה ויפתח מטלות לפי מה שהוחלט</p>` : null}
        </section>` : null}
        ${meets.length ? html`<section class="card side-card"><div class="sec-head"><h2>פגישות לקבוע</h2><span class="muted small">Claude מצא זמנים פנויים</span></div>
          ${meets.map((m) => html`<${MeetingAsk} key=${m.id} m=${m} />`)}</section>` : null}
        <section class="card side-card"><div class="sec-head"><h2>מקרא</h2></div>
          <div class="legend"><span><i class="lg here"></i>נקבע מהפלטפורמה</span><span><i class="lg"></i>מ-Google Calendar</span>${team.length ? html`<span><i class="lg busy"></i>תפוס אצל חבר צוות</span>` : null}</div>
          <div class="legend">${mine.map((p) => html`<span><i class="lg" style=${`background:${p.color}`}></i>${p.name}</span>`)}</div>
        </section>
        ${live && g.connected ? html`<section class="card side-card"><div class="sec-head"><h2>היומן שלי</h2></div>
          <p class="muted small">מחובר כ-${g.email}. חברי הצוות רואים אצלך רק זמנים תפוסים, בלי כותרות.</p>
          <button type="button" class="btn sm" disabled=${busy} onClick=${disconnect}>ניתוק היומן</button></section>` : null}
      </aside>
    </div>` : html`<div class="card"><${Gantt} projects=${mine} from=${from} days=${40} /></div>`}
  </div>`;
}

// A new event, straight into the person's Google Calendar, with invitations to the teammates who connected theirs.
const pad = (n) => String(n).padStart(2, '0');
export function EventSheetBody() {
  const s = useStore();
  const mine = myProjects();
  const next = new Date(Date.now() + 36e5); next.setMinutes(0, 0, 0);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`);
  const [time, setTime] = useState(`${pad(next.getHours())}:00`);
  const [mins, setMins] = useState('30');
  const [pj, setPj] = useState(mine[0]?.id || null);
  const [invite, setInvite] = useState([]);
  const [busy, setBusy] = useState(false);
  const live = !!s.gcalInfo?.live;
  const linked = new Set((s.teamBusy || []).map((t) => t.person));
  const mates = s.people.filter((p) => p.id !== s.me && !p.agent);
  const toggle = (id) => setInvite((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const save = async (e) => {
    e.preventDefault();
    const start = new Date(`${date}T${time}`);
    if (!title.trim() || Number.isNaN(start.getTime())) return;
    setBusy(true);
    try {
      if (live) {
        const r = await gcal.create({ title: title.trim(), start: start.toISOString(), mins: +mins, project_id: pj, invite });
        toast(r.not_invited ? `נקבע ביומן שלך. ${r.not_invited === 1 ? 'מישהו מהמוזמנים עוד לא חיבר' : 'חלק מהמוזמנים עוד לא חיברו'} יומן, אז לא נשלחה אליהם הזמנה` : r.invited ? 'נקבע ביומן שלך, וההזמנות נשלחו' : 'נקבע ביומן שלך');
      } else {
        addEvent({ title: title.trim(), start: start.toISOString(), mins: +mins, project: pj, with: invite });
        toast('נקבע ביומן Google');
      }
      haptic('success');
      closeSheet();
    } catch (ex) { toast(ex.message || 'האירוע לא נוצר', { ms: 6000 }); setBusy(false); }
  };

  return html`<form class="evform" onSubmit=${save}>
    <label class="lbl" for="ev-title">מה</label>
    <input id="ev-title" class="input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder="למשל: סנכרון שבועי על הפלטפורמה" autoFocus required />
    <div class="ev-when">
      <div><label class="lbl" for="ev-date">יום</label><input id="ev-date" class="input" type="date" value=${date} onInput=${(e) => setDate(e.currentTarget.value)} required /></div>
      <div><label class="lbl" for="ev-time">שעה</label><input id="ev-time" class="input" type="time" step="900" value=${time} onInput=${(e) => setTime(e.currentTarget.value)} required /></div>
    </div>
    <label class="lbl">משך</label>
    <${Seg} value=${mins} onChange=${setMins} label="משך" options=${[{ id: '15', label: '15 דק׳' }, { id: '30', label: '30 דק׳' }, { id: '60', label: 'שעה' }, { id: '90', label: 'שעה וחצי' }]} />
    ${mine.length ? html`<label class="lbl">פרויקט</label>
      <div class="tool-pick">${mine.map((x) => html`<button type="button" class=${'tp' + (x.id === pj ? ' on' : '')} style=${`--c:${x.color}`} onClick=${() => setPj(x.id === pj ? null : x.id)}><i class="pdot" style=${`background:${x.color}`}></i>${x.name}</button>`)}</div>` : null}
    ${mates.length ? html`<label class="lbl">להזמין</label>
      <div class="tool-pick">${mates.map((p) => {
        const off = live && !linked.has(p.id);
        return html`<button type="button" class=${'tp' + (invite.includes(p.id) ? ' on' : '')} aria-pressed=${invite.includes(p.id)} onClick=${() => toggle(p.id)} title=${off ? 'עוד לא חיבר יומן, אז לא תישלח הזמנה' : ''}>
          <${Avatar} id=${p.id} size=${20} />${p.name}${off ? html`<span class="muted small"> · בלי יומן</span>` : null}</button>`;
      })}</div>` : null}
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" disabled=${busy || !title.trim()}>${busy ? 'קובע…' : 'קביעה ביומן'}</button>
      <button type="button" class="btn" onClick=${closeSheet}>ביטול</button>
    </div>
    <p class="muted small">${live ? 'האירוע נכנס ליומן גוגל שלך, וההזמנות יוצאות מגוגל. הכותרת עוברת את בדיקת הבלמ״ס.' : 'בנתוני הדמה האירוע נשמר רק כאן.'}</p>
  </form>`;
}
