// Signing in to the control center: the team code, then who is using this device. It is the app's own sign-in (the
// same cto.auth), so whoever signed in to one is signed in to the other.
import { useEffect, useState } from 'preact/hooks';
import { html, Icon } from '../ui.js';
import { savedCode, checkCode, teamPeople, pickPerson } from '../live.js';
import { ThemeButton } from '../parts.js';

const COLORS = ['#5856d6', '#ff2d55', '#ff9500', '#30b0c7', '#34c759', '#af52de', '#0071e3'];

export function SignIn() {
  const [code, setCode] = useState(savedCode());
  const [typed, setTyped] = useState('');
  const [people, setPeople] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!code) return;
    teamPeople(code).then(setPeople, () => { setCode(null); setErr('צריך להזין שוב את קוד הצוות.'); });
  }, [code]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try { setCode(await checkCode(typed)); } catch (ex) { setErr(ex.message || 'לא הצלחתי לבדוק את הקוד'); }
    setBusy(false);
  };
  const choose = (id) => { setBusy(true); pickPerson(code, id); location.reload(); };

  return html`<main class="auth signin">
    <div class="signin-theme"><${ThemeButton} /></div>
    <div class="auth-card">
      <div class="brand-lg"><span class="logo-n lg"><${Icon} name="layers" size=${24} /></span>
        <div><strong>מרכז הבקרה</strong><span>החלטות, מה ש-Claude מחכה לו ותוצרים, במקום אחד</span></div></div>
      ${!code ? html`<form onSubmit=${submit}>
          <h1>כניסה</h1><p class="sub">הזינו את קוד הצוות.</p>
          <label class="lbl" for="team-code">קוד צוות</label>
          <input id="team-code" class="input" type="password" autocomplete="current-password" value=${typed}
            onInput=${(e) => setTyped(e.currentTarget.value)} autoFocus required />
          ${err ? html`<p class="err" role="alert">${err}</p>` : null}
          <button type="submit" class="btn btn-primary block" disabled=${busy || !typed.trim()}>${busy ? 'רגע…' : 'כניסה'}</button>
        </form>`
        : html`<h1>מי משתמש במכשיר?</h1><p class="sub">הבחירה נשמרת במכשיר הזה. אפשר להחליף בכל רגע.</p>
          ${people ? html`<div class="pick-grid">${people.map((p, i) => html`<button type="button" class="pick" key=${p.id} disabled=${busy} onClick=${() => choose(p.id)}>
              <span class="avatar" style=${`width:44px;height:44px;font-size:19px;background:${p.color || COLORS[i % COLORS.length]}`}>${p.name.slice(0, 2)}</span>
              <strong>${p.name}</strong><span>${p.role || ''}</span></button>`)}</div>`
            : html`<div class="boot inline"><span class="spinner"></span></div>`}`}
      <div class="signin-alt"><a href="?demo">לראות את נתוני הדמה</a><span aria-hidden="true">·</span><a href="/#/home">האפליקציה הקודמת</a></div>
    </div>
  </main>`;
}
