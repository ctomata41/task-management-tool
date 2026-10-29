// The one-line add the + sheet uses: a title, and optional chips for project, owner and date.
import { useState, useRef } from 'preact/hooks';
import { html, Icon, Avatar, openMenu, dueWord } from './ui.js';
import { useStore, person, project, addTask, team, visibleProjects, isCommander, leads, isOpen, inProject } from './store.js';

// One line to add a task: the title, and optional chips for project, owner and date. Enter adds it. A task added under an
// ask carries its parent and the ask's priority. What the commander adds in a project someone else runs goes to its
// manager as an ask (addTask), so the line says so and offers only the manager. Anyone else adds only to a project
// they're in, for its people; an outside partner only for themselves.
export function QuickAdd({ project: pid, stage, parent, priority, personal, placeholder = 'משימה חדשה…', ownerDefault }) {
  const s = useStore();
  const [title, setTitle] = useState('');
  const [proj, setProj] = useState(pid || null);
  const [owner, setOwner] = useState(ownerDefault || s.me);
  const [due, setDue] = useState('');
  const ref = useRef();
  const p = proj ? project(proj) : null;
  const asAsk = isCommander() && !!p && !p.personal && !leads(p);
  const people = p ? [p.manager, ...p.partners].filter((id, i, a) => a.indexOf(id) === i) : [s.me];
  const pool = asAsk ? [p.manager] : person(s.me).role === 'external' ? [s.me] : p ? people : (isCommander() ? team().map((x) => x.id) : [s.me]);
  // Someone the pool doesn't hold (another project's partner) gives way to me, or where I'm not in it, to its manager.
  const who = pool.includes(owner) ? owner : pool.includes(s.me) ? s.me : pool[0];
  const submit = (e) => {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    addTask({ title: v, project: proj, stage: stage || null, owner: who, due: due || null, personal: !!personal, ...(parent ? { parent } : {}), ...(priority ? { priority } : {}) });
    setTitle(''); setDue('');
    ref.current?.focus();
  };
  const pickProject = (e) => openMenu(e, [{ id: '', label: personal ? 'בלי פרויקט' : 'בלי פרויקט (רק אצלי)', icon: 'user' }, ...visibleProjects().filter((x) => (personal ? x.personal : !x.personal && (isCommander() || inProject(x))) && isOpen(x)).map((x) => ({ id: x.id, label: x.name, dot: x.color }))],
    { selected: proj || '', onPick: (id) => setProj(id || null) });
  const pickOwner = (e) => openMenu(e, pool.map((id) => ({ id, label: person(id).name + (person(id).role === 'external' ? ` · ${person(id).org || 'מבחוץ'}` : ''), person: id })), { selected: who, onPick: setOwner });
  return html`<form class="qadd" onSubmit=${submit}>
    <span class="qadd-plus"><${Icon} name="plus" size=${16} /></span>
    <input ref=${ref} class="qadd-input" value=${title} onInput=${(e) => setTitle(e.currentTarget.value)} placeholder=${asAsk ? `תגיע כבקשה ל${person(p.manager).name}` : placeholder} aria-label="כותרת המשימה" enterkeyhint="done" />
    ${pid ? null : html`<button type="button" class="qchip qproj" onClick=${pickProject}>${p ? html`<i style=${`background:${p.color}`}></i>${p.name}` : html`<${Icon} name="layers" size=${14} />פרויקט`}</button>`}
    ${pool.length > 1 || asAsk ? html`<button type="button" class="qchip" onClick=${pickOwner} aria-label=${`אחראי: ${person(who).name}`}><${Avatar} id=${who} size=${20} /></button>` : null}
    <label class="qchip date"><${Icon} name="calendar" size=${14} /><input type="date" value=${due} onInput=${(e) => setDue(e.currentTarget.value)} aria-label="תאריך יעד" />${due ? dueWord(due) : null}</label>
    <button type="submit" class="btn btn-primary sm" disabled=${!title.trim()}>הוספה</button>
  </form>`;
}
