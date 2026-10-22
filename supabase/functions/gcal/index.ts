// The Edge Function entry: Google Calendar lives in server.js, so tests can run it under Node.
// Secrets (Supabase, Edge Functions, Secrets): GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from the team's Google Cloud
// OAuth client; SITE_URL if the site is not https://cto-tasks.vercel.app.
import { handle } from './server.js';

const site = Deno.env.get('SITE_URL') || 'https://cto-tasks.vercel.app';
const env = {
  base: Deno.env.get('SUPABASE_URL')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  clientId: Deno.env.get('GOOGLE_CLIENT_ID') || '',
  clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
  site,
  redirectUri: `${site}/gcal/callback`,
};

Deno.serve((req) => handle(req, env).catch((e) => {
  console.error(e);
  return new Response(JSON.stringify({ error: 'תקלה בחיבור ליומן גוגל.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}));
