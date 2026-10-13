// Keep-alive and health check, called twice a day by the cron jobs in vercel.json.
// Supabase pauses a Free-plan project after a week with too little database activity, so a quiet week
// would take the app down. These light queries go through the site's own /sb proxy, the same path the
// app uses, so this URL is also a health check. Without the team code, RLS returns no rows.

// Same public anon key as app/config.js.
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0c3hsYXhvbnZsZGNkemlvemdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDMyODcsImV4cCI6MjEwNzQ3OTI4N30.hR-m1xJqwtkU4fzX62IPpqjsG2ydxWZ_ft0fufwotPQ';

const CHECKS = [
  { name: 'rpc', method: 'POST', path: '/sb/rest/v1/rpc/team_code_is_set', body: '{}' },
  { name: 'projects', method: 'GET', path: '/sb/rest/v1/projects?select=id&limit=1' },
  { name: 'tasks', method: 'GET', path: '/sb/rest/v1/tasks?select=id&limit=1' },
];

export default {
  async fetch(request) {
    // The production domain, so the checks never go to a protected per-deployment URL.
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const origin = host ? `https://${host}` : new URL(request.url).origin;
    const checks = await Promise.all(CHECKS.map(async ({ name, method, path, body }) => {
      try {
        const res = await fetch(origin + path, {
          method,
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(10000),
        });
        await res.text();
        return { name, status: res.status };
      } catch (e) {
        return { name, status: 0, error: String(e?.message || e) };
      }
    }));
    const ok = checks.every((c) => c.status === 200);
    return Response.json({ ok, checks, at: new Date().toISOString() }, {
      status: ok ? 200 : 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  },
};
