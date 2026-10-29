// One sign-in for the whole site (/m/, /next/ and the app). Signing in with Google happens on /account/: the `gcal`
// function sends the browser to Google and back with a session token, kept here under cto.auth as { session, me }.
// Until the commander closes it, the team code still works beside it as { code, me }. Every request says who it is with
// authHeaders(): the session (x-session), or the team code and the person (x-team-code, x-actor).
const AUTH_KEY = 'cto.auth';

export function readAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || null; } catch (e) { return null; }
}
export function writeAuth(a) {
  try {
    if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    else localStorage.removeItem(AUTH_KEY);
  } catch (e) { /* storage blocked */ }
}
export const signedIn = (a = readAuth()) => !!(a?.me && (a.session || a.code));

export function authHeaders(a = readAuth()) {
  if (a?.session) return { 'x-session': a.session };
  const h = {};
  if (a?.code) h['x-team-code'] = a.code;
  if (a?.me) h['x-actor'] = a.me;
  return h;
}

// Where to come back to after signing in: a path on this site only.
export const safeReturn = (path) => (/^\/[A-Za-z0-9/_.?=&-]*$/.test(path || '') ? path : '/');
export const here = () => safeReturn(location.pathname + location.search);

// The sign-in page, which comes back here once the person is in (or approved).
export function toSignIn(returnTo = here()) {
  location.replace('/account/?return=' + encodeURIComponent(safeReturn(returnTo)));
}
export function googleSignIn(returnTo = '/') {
  location.href = '/gcal/signin?return=' + encodeURIComponent(safeReturn(returnTo));
}
