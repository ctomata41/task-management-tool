// The Edge Function entry: Google Calendar lives in server.js, so tests can run it under Node.
// Secrets (Supabase, Edge Functions, Secrets): GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from the team's Google Cloud
// OAuth client; SITE_URL if the site is not https://cto-tasks.vercel.app, and GCAL_REDIRECT_URI when the site has no
// /gcal proxy of its own (GitHub Pages): then Google returns straight to this function, .../functions/v1/gcal/callback.
import { handle } from './server.js';

const site = Deno.env.get('SITE_URL') || 'https://cto-tasks.vercel.app';
const env = {
  base: Deno.env.get('SUPABASE_URL')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  clientId: Deno.env.get('GOOGLE_CLIENT_ID') || '',
  clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
  site,
  redirectUri: Deno.env.get('GCAL_REDIRECT_URI') || `${site}/gcal/callback`,
};

// The site may be served from another origin than this function (GitHub Pages), so the browser asks first.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-team-code, x-actor, x-gcal-device, x-client-info',
  'Access-Control-Max-Age': '86400',
};
async function cors(req: Request, run: () => Promise<Response>): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const res = await run();
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

Deno.serve((req) => cors(req, () => handle(req, env).catch((e) => {
  console.error(e);
  return new Response(JSON.stringify({ error: 'תקלה בחיבור ליומן גוגל.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
})));
