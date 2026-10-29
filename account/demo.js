// Sample data for the sign-in page (?demo=out|pending|blocked|member|commander), so its screens can be seen and checked
// without the server. Nothing here is sent anywhere.
const P = (id, name, access, extra = {}) => ({ id, name, access, is_command: access === 'commander', role: '', ...extra });

export function demoBackend(mode) {
  const people = [P('p1', 'יואש', 'commander'), P('p2', 'יונתן', 'member', { is_command: true }), P('p3', 'יהלי', 'member'), P('p4', 'ירדן', 'member')];
  const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
  let accounts = [
    { id: 'a1', email: 'yoash@example.com', name: 'Yoash', picture: null, status: 'active', person_id: 'p1', requested_at: ago(30), signed_in: true },
    { id: 'a2', email: 'yonatan@example.com', name: 'Yonatan', picture: null, status: 'active', person_id: 'p2', requested_at: ago(20), signed_in: true },
    { id: 'a3', email: 'yahali@example.com', name: 'יהלי', picture: null, status: 'pending', person_id: null, requested_at: ago(1), signed_in: true },
    { id: 'a4', email: 'guest@example.com', name: 'Dana Levi', picture: null, status: 'pending', person_id: null, requested_at: ago(0.2), signed_in: true },
  ];
  let codeOpen = true;
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), 250));
  const meRow = (a, p) => ({ account_id: a.id, email: a.email, name: a.name, picture: a.picture, status: a.status, person_id: p?.id || null,
    person_name: p?.name || null, access: p?.access || null, is_command: !!p?.is_command, code_open: codeOpen, waiting: 0 });
  const me = {
    out: () => ({ kind: 'out' }),
    pending: () => ({ kind: 'pending', me: meRow(accounts[3]) }),
    blocked: () => ({ kind: 'blocked', me: meRow({ ...accounts[3], status: 'blocked' }) }),
    member: () => ({ kind: 'active', me: meRow(accounts[1], people[1]) }),
    commander: () => ({ kind: 'active', me: meRow(accounts[0], people[0]) }),
  }[mode] || (() => ({ kind: 'out' }));
  return {
    me: () => wait(me()),
    codeOpen: () => wait(codeOpen),
    signOut: () => wait(null),
    google: () => alert('בדמו לא נכנסים באמת ל-Google.'),
    checkCode: () => Promise.reject(new Error('בדמו אין קוד צוות.')),
    teamPeople: () => wait(people), pickPerson: () => {},
    accounts: () => wait(accounts.map((a) => ({ ...a }))),
    people: () => wait(people.map((p) => ({ ...p }))),
    async approve(id, person, name, access, command) {
      let p = people.find((x) => x.id === person);
      if (!p) { p = P('p' + (people.length + 1), name, access); people.push(p); }
      Object.assign(p, { access, is_command: access === 'commander' || (access === 'member' && command) });
      accounts = accounts.map((a) => (a.id === id ? { ...a, status: 'active', person_id: p.id } : a));
      return wait(p.id);
    },
    block: (id) => { accounts = accounts.map((a) => (a.id === id ? { ...a, status: 'blocked' } : a)); return wait(null); },
    setAccess(person, access, command) {
      if (access !== 'commander' && people.find((p) => p.id === person)?.access === 'commander' && people.filter((p) => p.access === 'commander').length < 2) {
        return Promise.reject(new Error('צריך להישאר לפחות מפקד אחד.'));
      }
      Object.assign(people.find((p) => p.id === person), { access, is_command: access === 'commander' || (access === 'member' && command) });
      return wait(null);
    },
    invite(email, person) { accounts.push({ id: 'a' + Date.now(), email, name: '', status: 'active', person_id: person, requested_at: ago(0), signed_in: false }); return wait(null); },
    setCode: (open) => { codeOpen = open; return wait(open); },
  };
}
