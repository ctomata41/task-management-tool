// The Edge Function entry: the connector itself lives in server.js, so tests can run it under Node.
import { handle } from './server.js';

const env = { base: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! };

Deno.serve((req) => handle(req, env).catch((e) => {
  console.error(e);
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'תקלה בפלטפורמה' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}));
