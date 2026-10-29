// The site's sign-in page (/account/). Signing in with Google here also connects the person's Google Calendar. Someone
// new waits here until the commander approves them; then the page goes on by itself to where they came from
// (?return=/m/). Signed in, it shows the account; the commander also manages who may come in and what each one may do,
// and closes the team code once everyone is in. Until then the team code still signs in beside Google.
// ?demo=out|pending|blocked|member|commander shows the screens on sample data, without the server.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html, Icon, Sheet, Toasts, Seg } from '../next/ui.js';
import { useStore, toast, openSheet, closeSheet } from '../next/store.js';
import { ThemeButton } from '../next/parts.js';
import { haptic } from '../app/motion.js';
import { api, setCreds } from '../app/api.js';
import { readAuth, writeAuth, safeReturn, googleSignIn } from '../app/session.js';
import { checkCode, teamPeople, pickPerson } from '../next/live.js';
import { demoBackend } from './demo.js';

const params = new URLSearchParams(location.search);
const RET = params.has('return') ? safeReturn(params.get('return')) : null;
const ERR = {
  setup: 'הכניסה עם Google עוד לא הוגדרה לצוות.',
  denied: 'הכניסה עם Google בוטלה. אפשר לנסות שוב.',
  email: 'לחשבון ה-Google הזה אין כתובת מייל מאומתת, אז אי אפשר להיכנס איתו.',
  taken: 'הכתובת הזו כבר שייכת לחשבון Google אחר בצוות. כדאי לדבר עם המפקד.',
  expired: 'הכניסה לקחה יותר מדי זמן. אפשר לנסות שוב.',
  failed: 'לא הצלחתי להשלים את הכניסה. אפשר לנסות שוב.',
};
export const ACCESS = [
  { id: 'commander', label: 'מפקד', c: 'var(--s-waiting)' },
  { id: 'member', label: 'חבר צוות', c: 'var(--accent)' },
  { id: 'external', label: 'חיצוני', c: 'var(--s-todo)' },
];
const accessOf = (id) => ACCESS.find((a) => a.id === id) || ACCESS[1];

// ---------- the server ----------
const live = {
  async me() {
    const a = readAuth();
    if (a?.session) {
      setCreds({ session: a.session, code: null, actor: null });
      const me = (await api.rpc('auth_me'))?.[0];
      if (!me) { writeAuth(null); setCreds({ session: null }); return { kind: 'out' }; }
      // Only an approved person is signed in for the apps (cto.auth.me); a pending one keeps just the session.
      writeAuth(me.status === 'active' ? { session: a.session, me: me.person_id } : { session: a.session });
      return { kind: me.status, me };
    }
    if (a?.code) {
      if (!(await api.rpc('check_team_code', { code: a.code }))) { writeAuth(null); return { kind: 'out' }; }
      return { kind: a.me ? 'code' : 'pick', code: a.code };
    }
    return { kind: 'out' };
  },
  codeOpen: () => api.rpc('auth_code_open'),
  async signOut() {
    if (readAuth()?.session) await api.rpc('auth_signout').catch(() => {});
    writeAuth(null);
    setCreds({ session: null, code: null, actor: null });
  },
  google: (ret) => googleSignIn(ret),
  checkCode, teamPeople, pickPerson,
  accounts: () => api.rpc('auth_accounts'),
  people: () => api.list('people', { archived: 'is.false', is_agent: 'is.false', order: 'sort.asc' }),
  approve: (account, person, name, access, command) => api.rpc('auth_approve', { p_account: account, p_person: person, p_name: name, p_access: access, p_command: command }),
  block: (account) => api.rpc('auth_block', { p_account: account }),
  setAccess: (person, access, command) => api.rpc('auth_set_access', { p_person: person, p_access: access, p_command: command }),
  invite: (email, person, access, command) => api.rpc('auth_invite', { p_email: email, p_person: person, p_access: access, p_command: command }),
  setCode: (open) => api.rpc('auth_set_code', { p_open: open }),
};
const be = params.has('demo') ? demoBackend(params.get('demo')) : live;

// Back from Google: #session=<token> or #error=<why>. The token never stays in the address.
function takeFragment() {
  const m = /^#(session|error)=([\w-]+)/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (m[1] === 'session') { writeAuth({ session: m[2] }); return null; }
  return ERR[m[2]] || ERR.failed;
}

// ---------- pieces ----------
function GoogleMark() {
  return html`<svg class="g-mark" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>`;
}
function GoogleButton({ label = 'המשך עם Google' }) {
  return html`<button type="button" class="btn block g-btn" onClick=${() => be.google(RET || '/')}><${GoogleMark} />${label}</button>`;
}
function Face({ name = '', picture, size = 44 }) {
  const [broken, setBroken] = useState(false);
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (picture && !broken) return html`<img class="avatar face" src=${picture} alt="" referrerpolicy="no-referrer" style=${style} onError=${() => setBroken(true)} />`;
  return html`<span class="avatar face" aria-hidden="true" style=${style}>${(name || '?').trim().slice(0, 2)}</span>`;
}
function AccessPill({ access, command }) {
  const a = accessOf(access);
  return html`<span class="acct-pills"><span class="pill sm" style=${`--c:${a.c}`}>${a.label}</span>
    ${command && access === 'member' ? html`<span class="pill sm" style="--c:var(--s-progress)">סגן</span>` : null}</span>`;
}
function Brand() {
  return html`<div class="brand-lg"><span class="logo-n lg"><${Icon} name="shield" size=${24} /></span>
    <div><strong>צוות CTO</strong><span>פרויקטים, משימות ויומן, במקום אחד</span></div></div>`;
}
function Shell({ children }) {
  return html`<main class="auth signin acct">
    <div class="signin-theme"><${ThemeButton} /></div>
    <div class="auth-card">${children}</div>
  </main>`;
}

// ---------- signed out: Google, or the team code while it is open ----------
function SignedOut({ error, onIn }) {
  const [codeOpen, setCodeOpen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { be.codeOpen().then((o) => setCodeOpen(!!o), () => {}); }, []);
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try { onIn({ kind: 'pick', code: await be.checkCode(typed) }); } catch (ex) { setErr(ex.message || 'לא הצלחתי לבדוק את הקוד'); }
    setBusy(false);
  };
  return html`<${Shell}>
    <${Brand} />
    <h1>כניסה</h1>
    <p class="sub">נכנסים עם חשבון Google. באותה כניסה מתחבר גם יומן Google שלך. בכניסה הראשונה המפקד מאשר ובוחר מה מותר לראות ולעשות.</p>
    ${error ? html`<p class="err" role="alert">${error}</p>` : null}
    <${GoogleButton} />
    ${codeOpen ? html`<div class="code-alt">
      ${showCode ? html`<form onSubmit=${submit}>
          <label class="lbl" for="team-code">קוד הצוות (עד שהמפקד סוגר אותו)</label>
          <input id="team-code" class="input" type="password" autocomplete="current-password" value=${typed}
            onInput=${(e) => setTyped(e.currentTarget.value)} autoFocus required />
          ${err ? html`<p class="err" role="alert">${err}</p>` : null}
          <button type="submit" class="btn block" disabled=${busy || !typed.trim()}>${busy ? 'רגע…' : 'כניסה עם הקוד'}</button>
        </form>`
        : html`<button type="button" class="link-btn" onClick=${() => setShowCode(true)}>עדיין בלי Google? כניסה עם קוד הצוות</button>`}
    </div>` : null}
    <div class="signin-alt"><a href="/m/">הגרסה הידנית עם נתוני דוגמה</a><span aria-hidden="true">·</span><a href="/next/?demo">מרכז הבקרה בדמו</a></div>
  </${Shell}>`;
}

// The team code's second step: who is using this device.
function Pick({ code, onIn }) {
  const [people, setPeople] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { be.teamPeople(code).then(setPeople, () => onIn({ kind: 'out' })); }, [code]);
  const choose = (id) => { setBusy(true); be.pickPerson(code, id); onIn({ kind: 'code', code }); };
  return html`<${Shell}>
    <${Brand} />
    <h1>מי משתמש במכשיר?</h1><p class="sub">הבחירה נשמרת במכשיר הזה. כניסה עם Google מזהה אותך בלי לבחור.</p>
    ${people ? html`<div class="pick-grid">${people.map((p) => html`<button type="button" class="pick" key=${p.id} disabled=${busy} onClick=${() => choose(p.id)}>
        <${Face} name=${p.name} /><strong>${p.name}</strong><span>${p.role || ''}</span></button>`)}</div>`
      : html`<div class="boot inline"><span class="spinner"></span></div>`}
  </${Shell}>`;
}

// ---------- waiting for the commander ----------
function Waiting({ me, onOut }) {
  return html`<${Shell}>
    <div class="acct-who"><${Face} name=${me.name} picture=${me.picture} size=${56} />
      <div><strong>${me.name || me.email}</strong><span dir="ltr">${me.email}</span></div></div>
    <h1>הבקשה אצל המפקד</h1>
    <p class="sub">המפקד מאשר את הכניסה ובוחר מה מותר לך לראות ולעשות. אפשר להשאיר את הדף פתוח: ברגע שהבקשה מאושרת, הכניסה ממשיכה מכאן לבד.</p>
    <div class="acct-wait" role="status"><span class="spinner"></span>מחכה לאישור</div>
    <button type="button" class="btn block" onClick=${onOut}>יציאה</button>
  </${Shell}>`;
}
function Blocked({ me, onOut }) {
  return html`<${Shell}>
    <div class="acct-who"><${Face} name=${me.name} picture=${me.picture} size=${56} />
      <div><strong>${me.name || me.email}</strong><span dir="ltr">${me.email}</span></div></div>
    <h1>הכניסה לא אושרה</h1>
    <p class="sub">המפקד לא אישר כניסה לחשבון הזה. אם זו טעות, כדאי לדבר איתו.</p>
    <button type="button" class="btn block" onClick=${onOut}>כניסה עם חשבון אחר</button>
  </${Shell}>`;
}

// ---------- signed in ----------
function Account({ st, onOut }) {
  const me = st.me;
  const commander = st.kind === 'active' && me.access === 'commander';
  return html`<main class="acct-page">
    <header class="acct-top"><${Brand} /><${ThemeButton} /></header>
    <section class="card acct-me">
      ${me ? html`<div class="acct-who"><${Face} name=${me.person_name || me.name} picture=${me.picture} size=${56} />
          <div class="grow"><strong>${me.person_name || me.name}</strong><span dir="ltr">${me.email}</span></div>
          <${AccessPill} access=${me.access} command=${me.is_command} /></div>`
        : html`<div class="acct-note"><${Icon} name="key" /><div><strong>נכנסת עם קוד הצוות</strong>
          <span>כניסה עם Google מזהה אותך בעצמך, כך שאף אחד לא יכול לפעול בשמך, ומחברת את היומן.</span></div></div>
          <${GoogleButton} label="מעבר לכניסה עם Google" />`}
      <div class="acct-go">
        <a class="btn btn-primary" href="/m/">לפרויקטים</a>
        <a class="btn" href="/next/">למרכז הבקרה</a>
        <button type="button" class="btn" onClick=${onOut}><${Icon} name="logout" size=${16} />יציאה</button>
      </div>
    </section>
    ${commander ? html`<${Team} me=${me} />` : null}
  </main>`;
}

// ---------- the commander: requests, the team's access, the team code ----------
let reloadTeam = () => {};
function Team({ me }) {
  const [data, setData] = useState(null);
  const [codeOpen, setCodeOpen] = useState(me.code_open);
  const load = () => Promise.all([be.accounts(), be.people(), be.codeOpen()])
    .then(([accounts, people, open]) => { setData({ accounts, people }); setCodeOpen(!!open); })
    .catch((e) => toast(e.message || 'לא הצלחתי לטעון את הצוות'));
  reloadTeam = load;
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    return () => clearInterval(t);
  }, []);
  if (!data) return html`<div class="boot inline"><span class="spinner"></span></div>`;
  const byPerson = new Map(data.accounts.filter((a) => a.person_id && a.status !== 'blocked').map((a) => [a.person_id, a]));
  const pending = data.accounts.filter((a) => a.status === 'pending');
  const blocked = data.accounts.filter((a) => a.status === 'blocked');
  const team = data.people;
  const inWithGoogle = team.filter((p) => byPerson.get(p.id)?.signed_in).length;
  const ctx = { data, me, byPerson };
  return html`
    <section class="acct-sec">
      <h2>מחכים לאישור ${pending.length ? html`<span class="count">${pending.length}</span>` : null}</h2>
      ${pending.length ? html`<div class="card rows">${pending.map((a) => html`<div class="acct-row" key=${a.id}>
          <${Face} name=${a.name} picture=${a.picture} size=${40} />
          <div class="grow"><strong>${a.name || a.email}</strong><span dir="ltr">${a.email}</span></div>
          <div class="acct-actions">
            <button type="button" class="btn sm" onClick=${() => openSheet('deny', { account: a })}>לא לאשר</button>
            <button type="button" class="btn btn-primary sm" onClick=${() => openSheet('approve', { account: a, ctx })}>אישור</button>
          </div></div>`)}</div>`
        : html`<p class="muted acct-empty">אין בקשות חדשות. מי שנכנס עם Google בפעם הראשונה מופיע כאן.</p>`}
    </section>
    <section class="acct-sec">
      <h2>הצוות</h2>
      <div class="card rows">${team.map((p) => {
        const a = byPerson.get(p.id);
        return html`<button type="button" class="acct-row tap" key=${p.id} onClick=${() => openSheet('person', { person: p, account: a, ctx })}>
          <${Face} name=${p.name} picture=${a?.picture} size=${40} />
          <div class="grow"><strong>${p.name}${p.id === me.person_id ? ' (את/ה)' : ''}</strong>
            <span dir=${a ? 'ltr' : 'rtl'}>${a ? (a.signed_in ? a.email : `${a.email} · אושר מראש`) : 'עוד לא נכנס עם Google'}</span></div>
          <${AccessPill} access=${p.access} command=${p.is_command} />
          <${Icon} name="more" size=${16} cls="muted" /></button>`;
      })}</div>
    </section>
    ${blocked.length ? html`<section class="acct-sec">
      <h2>לא אושרו</h2>
      <div class="card rows">${blocked.map((a) => html`<div class="acct-row" key=${a.id}>
        <${Face} name=${a.name} picture=${a.picture} size=${40} />
        <div class="grow"><strong>${a.name || a.email}</strong><span dir="ltr">${a.email}</span></div>
        <button type="button" class="btn sm" onClick=${() => openSheet('approve', { account: a, ctx })}>לאשר בכל זאת</button></div>`)}</div>
    </section>` : null}
    <section class="acct-sec">
      <h2>קוד הצוות</h2>
      <div class="card acct-code">
        <span class=${'acct-code-ic' + (codeOpen ? ' open' : '')}><${Icon} name=${codeOpen ? 'unlock' : 'lock'} /></span>
        <div class="grow">${codeOpen
          ? html`<strong>עדיין פתוח</strong><span>מי שיודע את הקוד נכנס בלי Google ובלי אישור, ויכול לפעול בשם אחרים. כדאי לסגור אותו כשכל הצוות כבר בפנים: ${inWithGoogle} מתוך ${team.length} נכנסו עם Google.</span>`
          : html`<strong>סגור</strong><span>נכנסים רק עם Google ובאישור שלך. מי שנכנס עם הקוד יוצא ונכנס מחדש עם Google.</span>`}</div>
        <button type="button" class=${'btn sm' + (codeOpen ? ' danger' : '')} onClick=${() => openSheet('code', { open: codeOpen, inWithGoogle, total: team.length })}>${codeOpen ? 'לסגור' : 'לפתוח שוב'}</button>
      </div>
    </section>`;
}

// Saves through the server, says what happened, and refreshes the lists.
async function act(run, done) {
  try {
    await run();
    haptic('success');
    closeSheet();
    toast(done, { ms: 4500 });
    reloadTeam();
  } catch (e) { toast(e.message || 'משהו השתבש', { ms: 6000 }); }
}

function RoleFields({ access, setAccess, command, setCommand }) {
  return html`<label class="lbl">תפקיד</label>
    <${Seg} label="תפקיד" value=${access} onChange=${setAccess} options=${ACCESS} />
    <p class="field-hint acct-hint">${access === 'commander' ? 'רואה הכול, מאשר אנשים ונותן הרשאות.' : access === 'external' ? 'מחוץ לצוות: רואה רק פרויקטים שצירפו אותו אליהם.' : 'חבר צוות: רואה את הפרויקטים של הצוות ואת מה ששלו.'}</p>
    ${access === 'member' ? html`<div class="acct-switch">
      <div class="grow"><strong>תצוגת פיקוד (סגן)</strong><span>רואה את תמונת המצב של המפקד, בלי לאשר אנשים.</span></div>
      <button type="button" role="switch" aria-checked=${command} aria-label="תצוגת פיקוד" class=${'toggle' + (command ? ' on' : '')} onClick=${() => setCommand(!command)}><span></span></button>
    </div>` : null}`;
}

function ApproveBody({ account, ctx }) {
  const free = ctx.data.people.filter((p) => !ctx.byPerson.has(p.id) || ctx.byPerson.get(p.id).id === account.id);
  const guess = free.find((p) => account.name && (account.name.includes(p.name) || p.name.includes(account.name.split(' ')[0])));
  const [who, setWho] = useState(account.person_id || guess?.id || 'new');
  const [name, setName] = useState(account.name || '');
  const [access, setAccess] = useState('member');
  const [command, setCommand] = useState(false);
  const label = who === 'new' ? name : (free.find((p) => p.id === who)?.name || '');
  return html`<div class="acct-who sm"><${Face} name=${account.name} picture=${account.picture} size=${40} />
      <div><strong>${account.name || account.email}</strong><span dir="ltr">${account.email}</span></div></div>
    <label class="lbl">מי זה בצוות?</label>
    <div class="acct-choices" role="radiogroup" aria-label="מי זה בצוות">
      ${free.map((p) => html`<button type="button" role="radio" aria-checked=${who === p.id} class=${'acct-choice' + (who === p.id ? ' on' : '')} onClick=${() => setWho(p.id)}>
        <${Face} name=${p.name} size=${28} /><span class="grow">${p.name}</span>${who === p.id ? html`<${Icon} name="check" size=${16} />` : null}</button>`)}
      <button type="button" role="radio" aria-checked=${who === 'new'} class=${'acct-choice' + (who === 'new' ? ' on' : '')} onClick=${() => setWho('new')}>
        <span class="acct-plus"><${Icon} name="plus" size=${16} /></span><span class="grow">אדם חדש</span>${who === 'new' ? html`<${Icon} name="check" size=${16} />` : null}</button>
    </div>
    ${who === 'new' ? html`<label class="lbl" for="new-name">השם בצוות</label>
      <input id="new-name" class="input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} />` : null}
    <${RoleFields} access=${access} setAccess=${setAccess} command=${command} setCommand=${setCommand} />
    <div class="sheet-actions"><button type="button" class="btn btn-primary block" disabled=${who === 'new' && !name.trim()}
      onClick=${() => act(() => be.approve(account.id, who === 'new' ? null : who, who === 'new' ? name.trim() : null, access, command), `הכניסה של ${label} אושרה`)}>לאשר את הכניסה</button></div>`;
}

function DenyBody({ account }) {
  return html`<p class="sub">${account.name || account.email} לא ייכנס לפלטפורמה. אפשר לאשר בכל זאת אחר כך, מהרשימה "לא אושרו".</p>
    <div class="sheet-actions two"><button type="button" class="btn" onClick=${closeSheet}>ביטול</button>
      <button type="button" class="btn btn-primary danger-fill" onClick=${() => act(() => be.block(account.id), 'הבקשה נדחתה')}>לא לאשר</button></div>`;
}

function PersonBody({ person, account, ctx }) {
  const [access, setAccess] = useState(person.access || 'member');
  const [command, setCommand] = useState(!!person.is_command && person.access !== 'commander');
  const [email, setEmail] = useState('');
  const self = person.id === ctx.me.person_id;
  const changed = access !== (person.access || 'member') || (access === 'member' && command !== !!person.is_command);
  return html`<div class="acct-who sm"><${Face} name=${person.name} picture=${account?.picture} size=${40} />
      <div><strong>${person.name}</strong><span dir=${account ? 'ltr' : 'rtl'}>${account ? account.email : 'עוד לא נכנס עם Google'}</span></div></div>
    <${RoleFields} access=${access} setAccess=${setAccess} command=${command} setCommand=${setCommand} />
    <div class="sheet-actions"><button type="button" class="btn btn-primary block" disabled=${!changed}
      onClick=${() => act(() => be.setAccess(person.id, access, command), `ההרשאות של ${person.name} נשמרו`)}>שמירה</button></div>
    ${!account ? html`<div class="acct-invite">
      <label class="lbl" for="inv-mail">לאשר מראש כתובת Google</label>
      <p class="field-hint">כש${person.name} ייכנס עם הכתובת הזו, הכניסה כבר מאושרת, עם התפקיד שלמעלה.</p>
      <div class="acct-inline"><input id="inv-mail" class="input" type="email" dir="ltr" placeholder="name@gmail.com" value=${email} onInput=${(e) => setEmail(e.currentTarget.value)} />
        <button type="button" class="btn" disabled=${!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}
          onClick=${() => act(() => be.invite(email.trim(), person.id, access, command), `הכתובת של ${person.name} אושרה מראש`)}>אישור מראש</button></div>
    </div>` : !self ? html`<button type="button" class="btn block danger acct-block"
        onClick=${() => openSheet('deny', { account: { ...account, name: person.name } })}>לחסום את הכניסה של ${person.name}</button>` : null}`;
}

function CodeBody({ open, inWithGoogle, total }) {
  return open
    ? html`<p class="sub">אחרי הסגירה נכנסים רק עם Google ובאישור שלך. ${inWithGoogle < total ? `${total - inWithGoogle} מהצוות עוד לא נכנסו עם Google, והם ייצאו עד שייכנסו.` : 'כל הצוות כבר נכנס עם Google.'}</p>
      <div class="sheet-actions two"><button type="button" class="btn" onClick=${closeSheet}>ביטול</button>
        <button type="button" class="btn btn-primary danger-fill" onClick=${() => act(() => be.setCode(false), 'קוד הצוות נסגר')}>לסגור את הקוד</button></div>`
    : html`<p class="sub">הקוד הקודם יעבוד שוב, וכל מי שיודע אותו ייכנס בלי אישור.</p>
      <div class="sheet-actions two"><button type="button" class="btn" onClick=${closeSheet}>ביטול</button>
        <button type="button" class="btn btn-primary" onClick=${() => act(() => be.setCode(true), 'קוד הצוות נפתח')}>לפתוח</button></div>`;
}

const SHEETS = {
  approve: { title: 'אישור כניסה', body: ApproveBody },
  deny: { title: 'לא לאשר?', body: DenyBody, kind: 'alert' },
  person: { title: 'הרשאות', body: PersonBody },
  code: { title: 'קוד הצוות', body: CodeBody, kind: 'alert' },
};

// ---------- the page ----------
function App({ error }) {
  const s = useStore();
  const [st, setSt] = useState({ kind: 'loading' });
  const refresh = () => be.me().then(setSt, (e) => setSt({ kind: 'out', error: e.message }));
  useEffect(() => { refresh(); }, []);
  // Waiting for approval: look again every few seconds, and as soon as the page is seen again.
  useEffect(() => {
    if (st.kind !== 'pending') return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 6000);
    const f = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', f);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', f); };
  }, [st.kind]);
  const going = RET && (st.kind === 'active' || st.kind === 'code');
  useEffect(() => { if (going) { if (st.kind === 'active') haptic('success'); location.replace(RET); } }, [going]);
  const out = async () => { await be.signOut(); setSt({ kind: 'out' }); };
  const sheet = s.sheet && SHEETS[s.sheet.kind];
  let view;
  if (st.kind === 'loading' || going) view = html`<div class="boot"><span class="spinner"></span>${going ? 'נכנסים…' : 'טוען…'}</div>`;
  else if (st.kind === 'out') view = html`<${SignedOut} error=${st.error || error} onIn=${setSt} />`;
  else if (st.kind === 'pick') view = html`<${Pick} code=${st.code} onIn=${setSt} />`;
  else if (st.kind === 'pending') view = html`<${Waiting} me=${st.me} onOut=${out} />`;
  else if (st.kind === 'blocked') view = html`<${Blocked} me=${st.me} onOut=${async () => { await be.signOut(); be.google(RET || '/'); }} />`;
  else view = html`<${Account} st=${st} onOut=${out} />`;
  return html`${view}
    ${sheet ? html`<${Sheet} title=${sheet.title} kind=${sheet.kind || 'modal'}><${sheet.body} ...${s.sheet} /></${Sheet}>` : null}
    <${Toasts} />`;
}

const error = takeFragment();
render(html`<${App} error=${error} />`, document.getElementById('app'));
