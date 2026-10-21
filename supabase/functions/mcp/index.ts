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

Deno.serve((req) => (new URL(req.url).pathname.includes('/brain/') ? handleBrain(req, env) : handle(req, env)).catch((e) => {
  console.error(e);
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'תקלה בפלטפורמה' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}));
