// The Edge Function entry: the voice agent and meeting transcription live in server.js, so tests can run it under Node.
// Secrets (Supabase, Edge Functions, Secrets): ELEVENLABS_API_KEY from the team's ElevenLabs account, and the two agent
// ids, ELEVENLABS_AGENT_ID (Jarvis) and ELEVENLABS_SUMMARY_AGENT_ID (writes meeting summaries). ANTHROPIC_API_KEY, if
// it is ever set, writes the summaries instead.
import { handle } from './server.js';

const env = {
  base: Deno.env.get('SUPABASE_URL')!,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  xiKey: Deno.env.get('ELEVENLABS_API_KEY') || '',
  agentId: Deno.env.get('ELEVENLABS_AGENT_ID') || '',
  summaryAgentId: Deno.env.get('ELEVENLABS_SUMMARY_AGENT_ID') || '',
  anthropicKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
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
  return new Response(JSON.stringify({ error: 'תקלה בחיבור הקולי.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
})));
