// First-run setup of the team code, login with it, and "who are you?".
import { useState } from 'preact/hooks';
import { submitCode, pickMe, getState, set } from '../store.js';
import { html, Avatar } from '../ui.js';

function Brand() {
  return html`<div class="brand-lg"><span class="logo" aria-hidden="true"><svg viewBox="0 0 32 32" width="40" height="40"><rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)"/><path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    <div><strong>משימות CTO</strong><span>כל הפרויקטים והמשימות של הצוות, במקום אחד</span></div></div>`;
}

export function AuthScreen({ setup }) {
  const [code, setCode] = useState('');
  const [code2, setCode2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (setup && code.trim() !== code2.trim()) { setErr('שני הקודים לא זהים'); return; }
    setBusy(true);
    try { await submitCode(code, setup); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  return html`<main class="auth">
    <form class="auth-card" onSubmit=${submit}>
      <${Brand} />
      ${setup ? html`<h1>הגדרת קוד צוות</h1>
        <p class="sub">זו הפעם הראשונה שהכלי נפתח. בחרו קוד שכל הצוות ישתמש בו כדי להיכנס (לפחות 6 תווים), ושלחו אותו לצוות בנפרד.</p>`
        : html`<h1>כניסה</h1><p class="sub">הזינו את קוד הצוות.</p>`}
      <label class="lbl" for="team-code">קוד צוות</label>
      <input id="team-code" class="input" type="password" autocomplete=${setup ? 'new-password' : 'current-password'} value=${code}
        onInput=${(e) => setCode(e.currentTarget.value)} autoFocus required minLength=${setup ? 6 : 1} />
      ${setup ? html`<label class="lbl" for="team-code-2">שוב, לאימות</label>
        <input id="team-code-2" class="input" type="password" autocomplete="new-password" value=${code2} onInput=${(e) => setCode2(e.currentTarget.value)} required />` : null}
      ${err ? html`<p class="err" role="alert">${err}</p>` : null}
      <button type="submit" class="btn btn-primary block" disabled=${busy || !code}>${busy ? 'רגע…' : setup ? 'שמירה והמשך' : 'כניסה'}</button>
    </form>
  </main>`;
}

export function PickScreen() {
  const s = getState();
  const people = s.people.filter((p) => p.is_team);
  const [busy, setBusy] = useState(null);
  const choose = async (id) => {
    setBusy(id);
    try { await pickMe(id); } catch (ex) { setBusy(null); set({ phase: 'error', error: ex.message }); }
  };
  return html`<main class="auth">
    <div class="auth-card">
      <${Brand} />
      <h1>מי משתמש במכשיר?</h1>
      <p class="sub">הבחירה נשמרת במכשיר הזה. אפשר להחליף בכל רגע מההגדרות.</p>
      <div class="pick-grid">
        ${people.map((p) => html`<button type="button" class="pick" key=${p.id} onClick=${() => choose(p.id)} disabled=${!!busy}>
          <${Avatar} p=${p} size=${44} /><strong>${p.name}</strong><span>${p.role || ''}</span>
          ${busy === p.id ? html`<span class="muted">טוען…</span>` : null}
        </button>`)}
      </div>
    </div>
  </main>`;
}
