const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function getSigningKey(secret, usage) {
  if (!secret || secret.length < 32) throw new Error('MOSSVALE_GATE_SECRET must contain at least 32 characters');
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, usage);
}

export async function createGateTicket(secret, now = Date.now()) {
  const payload = {app: 'mossvale', iat: now, exp: now + 10 * 60 * 1000};
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await getSigningKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyGateTicket(secret, ticket, now = Date.now()) {
  if (!ticket || typeof ticket !== 'string') return false;
  const [body, signature, extra] = ticket.split('.');
  if (!body || !signature || extra) return false;

  try {
    const key = await getSigningKey(secret, ['verify']);
    const validSignature = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(body));
    if (!validSignature) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    return payload.app === 'mossvale' && Number.isFinite(payload.exp) && payload.exp > now && payload.iat <= now + 30_000;
  } catch {
    return false;
  }
}
