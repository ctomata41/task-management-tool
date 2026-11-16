// Public client config. The anon key is meant to be public: every table is protected by
// row-level security that also requires the team code (sent as the x-team-code header).
// On the Vercel address the site proxies Supabase under its own origin (vercel.json: /sb, /gcal, /voice, /mcp). Anywhere
// else (GitHub Pages, a local server) there is no proxy, so the app talks to Supabase directly.
export const SUPABASE_URL = 'https://dtsxlaxonvldcdziozgp.supabase.co';
const proxied = typeof location !== 'undefined' && /\.vercel\.app$/.test(location.hostname);
export const API_BASE = proxied ? '/sb' : SUPABASE_URL;
// A server function's address: fnUrl('gcal') + '/events'.
export const fnUrl = (name) => (proxied ? `/${name}` : `${SUPABASE_URL}/functions/v1/${name}`);
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0c3hsYXhvbnZsZGNkemlvemdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDMyODcsImV4cCI6MjEwNzQ3OTI4N30.hR-m1xJqwtkU4fzX62IPpqjsG2ydxWZ_ft0fufwotPQ';
export const POLL_MS = 20000;
export const APP_VERSION = '0.3.0';
