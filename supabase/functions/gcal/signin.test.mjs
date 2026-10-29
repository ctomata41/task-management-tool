import assert from 'node:assert/strict';
// Signing in with Google through the gcal function, against a fake Google and a fake database. Run: node supabase/functions/gcal/signin.test.mjs
const { handle } = await import('./server.js');
const calls = [];
let acc = { account_id: 'acc1', status: 'pending', person_id: null };
let who = 'P1';
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const body = opts.body ? (typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : opts.body) : null;
  const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
  if (url.includes('/rest/v1/rpc/')) {
    const fn = url.split('/rpc/')[1]; calls.push([fn, body]);
    if (fn === 'auth_state_create') return ok('a'.repeat(48));
    if (fn === 'gcal_state_take') return ok([{ person_id: null, return_to: '/m/', kind: 'signin' }]);
    if (fn === 'auth_google_signin') return ok([acc]);
    if (fn === 'auth_who') return ok(body.p_session === 'cts_ok' ? who : null);
    if (fn === 'gcal_link_get') return ok([{ email: 'x@g.com', refresh_token: 'r', device_ok: false }]);
    if (fn === 'gcal_links_team') return ok([]);
    return ok(null);
  }
  if (url.includes('/rest/v1/people')) return ok([{ id: who, name: 'יהלי', team_id: 't', is_team: true, archived: false }]);
  if (url.includes('oauth2.googleapis.com/token')) return ok({ access_token: 'at', refresh_token: 'rt', scope: 'openid email profile https://www.googleapis.com/auth/calendar.events' });
  if (url.includes('userinfo')) return ok({ sub: 'g123', email: 'y@gmail.com', email_verified: true, name: 'Yahali', picture: 'https://p' });
  if (url.includes('calendar/v3')) return ok({ items: [] });
  throw new Error('unexpected ' + url);
};
const env = { base: 'https://db', serviceKey: 'k', clientId: 'cid', clientSecret: 'cs', site: 'https://site', redirectUri: 'https://site/gcal/callback' };
let r = await handle(new Request('https://f/gcal/signin?return=/m/'), env);
assert.equal(r.status, 302);
const loc = new URL(r.headers.get('Location'));
assert.equal(loc.host, 'accounts.google.com');
assert.match(loc.searchParams.get('scope'), /profile .*calendar\.events/);
assert.equal(loc.searchParams.get('prompt'), 'select_account consent');
assert.deepEqual(calls.at(-1), ['auth_state_create', { p_return: '/m/' }]);

r = await handle(new Request('https://f/gcal/callback?state=' + 'a'.repeat(48) + '&code=c'), env);
let to = r.headers.get('Location');
assert.match(to, /^https:\/\/site\/account\/\?return=%2Fm%2F#session=cts_[0-9a-f]{64}$/);
assert.ok(calls.some(([f, b]) => f === 'auth_pending_refresh' && b.p_refresh === 'rt'), 'pending keeps the calendar token');
assert.ok(!calls.some(([f]) => f === 'gcal_link_save'));
const tok = to.split('#session=')[1];
assert.ok(calls.some(([f, b]) => f === 'auth_session_create' && b.p_token === tok));

calls.length = 0; acc = { account_id: 'acc1', status: 'active', person_id: 'P1' };
r = await handle(new Request('https://f/gcal/callback?state=' + 'a'.repeat(48) + '&code=c'), env);
assert.ok(calls.some(([f, b]) => f === 'gcal_link_save' && b.p_person === 'P1'), 'active links the calendar');

r = await handle(new Request('https://f/gcal/callback?state=' + 'a'.repeat(48) + '&error=access_denied'), env);
assert.match(r.headers.get('Location'), /#error=denied$/);

// POST with a session: no team code needed, and its own titles show without a device token.
who = '11111111-1111-1111-1111-111111111111';
r = await handle(new Request('https://f/gcal/events', { method: 'POST', headers: { 'x-session': 'cts_ok' }, body: '{}' }), env);
let j = await r.json();
assert.equal(r.status, 200, JSON.stringify(j));
assert.equal(j.connected, true);
r = await handle(new Request('https://f/gcal/events', { method: 'POST', headers: { 'x-session': 'bad' }, body: '{}' }), env);
assert.equal(r.status, 401);
r = await handle(new Request('https://f/gcal/signin?return=/m/'), { ...env, clientId: '' });
assert.match(r.headers.get('Location'), /account\/\?return=%2Fm%2F#error=setup/);
console.log('gcal sign-in: all checks pass');
