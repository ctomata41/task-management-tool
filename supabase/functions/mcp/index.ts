// The Edge Function entry: the connector itself lives in server.js, so tests can run it under Node. /mcp/brain/* is the
// platform's own Claude (brain.js), which works only once the secret ANTHROPIC_API_KEY is set.
import { handle } from './server.js';
import { handleBrain } from './brain.js';

// The SDK loads only when there is a key, and a failure to load leaves the connector itself working.
const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
let claude: unknown = null;
if (apiKey) {
  try {
    const { default: Anthropic } = await import('npm:@anthropic-ai/sdk');
    claude = new Anthropic({ apiKey });
  } catch (e) { console.error('anthropic sdk', e); }
}
const env = {
  base: Deno.env.get('SUPABASE_URL')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  claude,
  // Writing a plan takes longer than one request should: it goes on after the answer is sent.
  // deno-lint-ignore no-explicit-any
  background: (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil(p),
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

// Only the platform's own pages call /brain/ from a browser; the connector itself is called by Claude, not by a page.
Deno.serve((req) => (new URL(req.url).pathname.includes('/brain/') ? cors(req, () => handleBrain(req, env)) : handle(req, env)).catch((e) => {
  console.error(e);
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'תקלה בפלטפורמה' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}));
