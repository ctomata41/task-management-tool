// The shape of what is saved under 'm.state.v2', brought up step by step. Each step runs once, in order, and a state
// already past a step goes through it unchanged. Pure: it reads only the sample (data.js), for who has what, so node
// runs it in the tests (m/migrate.test.mjs).
import * as seed from './data.js';
import * as card from './card.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

// v2 → v3, moved as it was from store.js; only the guard and the result's v are pinned to 3.
// A state saved before the order and the asks (v2) gets them on load: command for whoever has it in the sample, places
// for the live team projects (the sample's order first, the rest after it as they were saved), and the commander's
// tasks to a project's own manager become accepted asks. Every place counts as seen, so nothing nags anyone. Nobody set
// this first order, so it carries no name or time (rankBy, rankAt) until the commander moves a project.
// v2 also let anyone in the team add a task to any project or move one there. A task in a team project belongs to
// someone in it now (canEditTask), so an open task whose owner isn't in its project: someone in the team who may read
// the project keeps it, star and all, and joins the project; anyone else's (an outside partner's, the commander's, or
// one behind a lock) goes to the project's manager, out of focus. What the commander made there then becomes his
// accepted ask, so it stays on his order line and his to change. (Only the saved people and projects here: the state
// isn't set yet.) It describes v2 data as it was, so its lock check reads the v2 level itself.
export function toV3(saved) {
  if ((saved.v || 2) >= 3) return saved;
  const at = new Date().toISOString();
  const people = (saved.people || []).map((x) => (seed.people.find((y) => y.id === x.id)?.command ? { ...x, command: true } : x));
  const seedRank = (id) => seed.projects.find((x) => x.id === id)?.rank ?? Infinity;
  const live = (saved.projects || []).filter(card.inOrder).sort((a, b) => seedRank(a.id) - seedRank(b.id) || 0); // a stable sort
  const projects = (saved.projects || []).map((p) => {
    const rank = live.includes(p) ? live.indexOf(p) + 1 : null;
    return { ...p, rank, rankSeen: rank };
  });
  const projectOf = (pid) => projects.find((x) => x.id === pid);
  const managerOf = (pid) => projectOf(pid)?.manager;
  const cmdr = people.find((x) => x.role === 'commander')?.id;
  const keeps = (p, id) => { const x = people.find((y) => y.id === id); return !!x && x.role !== 'external' && x.id !== cmdr && (p.classification !== 'restricted' || !!x.command); };
  const joins = new Map(); // project id → the people who join it with their own work
  const tasks = (saved.tasks || [])
    .map((t) => {
      const p = projectOf(t.project);
      if (!p || p.personal || t.ask || t.status === 'done' || !t.owner || p.manager === t.owner || p.partners.includes(t.owner)) return t;
      if (keeps(p, t.owner)) { joins.set(p.id, new Set([...(joins.get(p.id) || []), t.owner])); return t; }
      return { ...t, owner: p.manager, focus: false, focusBy: null, fromCommander: p.manager !== cmdr && (!!t.fromCommander || t.by === cmdr) };
    })
    .map((t) => (t.fromCommander && !t.ask && t.project && managerOf(t.project) === t.owner ? { ...t, ask: true, ack: { state: 'ok', at } } : t));
  return { ...saved, v: 3, people, projects: projects.map((p) => (joins.has(p.id) ? { ...p, partners: [...p.partners, ...joins.get(p.id)] } : p)), tasks };
}

// v3 → v4: every stage field gets an id that is the same on every load (nothing is written back until the next change,
// and a field edited after a reload must still be found), and people get the permissions the sample gives them where
// they have none yet (the stand-in for Yoash's grant until sign-in). Running it again changes nothing. Places, domains,
// facts and the rest are only read: a project without them reads as before (card.placeOf and the rest).
export function upgradeV4(s, seedPeople = []) {
  if ((s.v || 2) >= 4) return s;
  const projects = (s.projects || []).map((p) => ({ ...p, stages: (p.stages || []).map((st) => ({ ...st,
    fields: (st.fields || []).map((f, i) => (f.id ? f : { ...f, id: `${st.id}f${i}` })) })) }));
  const people = (s.people || []).map((x) => { const y = seedPeople.find((z) => z.id === x.id);
    return 'perms' in x || !y?.perms ? x : { ...x, perms: [...y.perms] }; });
  return { ...s, v: 4, people, projects };
}

export const migrate = (saved) => upgradeV4(toV3(saved), seed.people);

// The sample as a fresh state, through the same last step as a saved one.
export const freshState = () => upgradeV4({ v: 3, people: clone(seed.people), projects: clone(seed.projects), tasks: clone(seed.tasks),
  outputs: clone(seed.outputs), meetings: clone(seed.meetings) }, seed.people);
