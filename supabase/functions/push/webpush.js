// Web Push (RFC 8030) with message encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292), on Web Crypto only,
// so the same file runs in the Supabase Edge Function (Deno) and in Node for the tests.
const te = new TextEncoder();

export const b64u = {
  encode(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '==='.slice((s.length + 3) % 4));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  },
};

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// A new VAPID key pair: the public key in the raw form browsers take as applicationServerKey, the private key as a JWK.
export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    publicKey: b64u.encode(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
}

// Encrypts a payload for one subscription (RFC 8291): one record, no padding. Tests pass a fixed salt and server key pair.
export async function encrypt(subscription, payload, { salt, serverKeys } = {}) {
  const uaPublic = b64u.decode(subscription.p256dh);
  const authSecret = b64u.decode(subscription.auth);
  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const as = serverKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(s, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(s, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const plain = typeof payload === 'string' ? te.encode(payload) : payload;
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plain, new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length); // salt, record size, key id length, key id
  header.set(s, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}

// The VAPID Authorization header for one push service (RFC 8292). Valid for 12 hours; Apple accepts at most 24.
export async function vapidAuth(endpoint, vapid, subject, now = Date.now()) {
  const part = (o) => b64u.encode(te.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned));
  return `vapid t=${unsigned}.${b64u.encode(sig)}, k=${vapid.publicKey}`;
}

// Sends one message to one subscription. 201 means the push service took it; 404 and 410 mean the subscription is gone.
/** @param {{ subject?: string, ttl?: number, urgency?: string, topic?: string }} [opts] */
export async function sendPush(subscription, message, vapid, opts = {}) {
  const { subject, ttl = 86400, urgency = 'normal', topic } = opts;
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    TTL: String(ttl),
    Urgency: urgency,
    Authorization: await vapidAuth(subscription.endpoint, vapid, subject),
  };
  if (topic) headers.Topic = topic;
  const res = await fetch(subscription.endpoint, { method: 'POST', headers, body: await encrypt(subscription, JSON.stringify(message)) });
  const text = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 300);
  return { status: res.status, ok: res.ok, text };
}
