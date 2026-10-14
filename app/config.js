// Public client config. The anon key is meant to be public: every table is protected by
// row-level security that also requires the team code (sent as the x-team-code header).
export const API_BASE = '/sb'; // proxied to Supabase by vercel.json, so the app talks to its own origin
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0c3hsYXhvbnZsZGNkemlvemdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDMyODcsImV4cCI6MjEwNzQ3OTI4N30.hR-m1xJqwtkU4fzX62IPpqjsG2ydxWZ_ft0fufwotPQ';
export const POLL_MS = 20000;
export const APP_VERSION = '0.2.0';
