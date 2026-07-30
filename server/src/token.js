import crypto from 'node:crypto';

const PREFIX = 'pg_';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

/**
 * SECRET_KEY dan boshqa maqsadlar uchun hosila kalit chiqaradi
 * (webhook yo'li, webhook sarlavhasi va h.k.).
 * Asosiy kalitning o'zi hech qayerda oshkor bo'lmasligi uchun.
 */
export function derive(purpose, secret) {
  return crypto.createHmac('sha256', secret).update(`pingo:${purpose}`).digest('hex').slice(0, 32);
}

/**
 * Tokenni yaratadi. Ichida chat_id va loyiha nomi bor, HMAC bilan imzolangan.
 * Baza kerak emas — barcha ma'lumot tokenning o'zida yuradi.
 */
export function createToken({ chatId, project, secret }) {
  const payload = { c: chatId, p: project, t: Math.floor(Date.now() / 1000) };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${PREFIX}${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Tokenni tekshiradi va ochadi. Imzo noto'g'ri bo'lsa null qaytaradi.
 */
export function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.startsWith(PREFIX)) return null;

  const [payloadB64, signature] = token.slice(PREFIX.length).split('.');
  if (!payloadB64 || !signature) return null;

  const expected = sign(payloadB64, secret);
  // timing-safe solishtirish
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const { c, p, t } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (typeof c !== 'number' || typeof p !== 'string') return null;
    return { chatId: c, project: p, issuedAt: t };
  } catch {
    return null;
  }
}
