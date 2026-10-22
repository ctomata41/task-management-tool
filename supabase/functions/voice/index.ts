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

Deno.serve((req) => handle(req, env).catch((e) => {
  console.error(e);
  return new Response(JSON.stringify({ error: 'תקלה בחיבור הקולי.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}));
