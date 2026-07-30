import crypto from 'node:crypto';

const PREFIX = 'pg_';
const SIG_LEN = 22; // 16 bayt HMAC (128 bit) — bu maqsad uchun yetarli va qisqa
const OLD_SIG_LEN = 43; // eski format: to'liq 32 baytli HMAC

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function hmac(payloadB64, secret) {
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
 * Tokenni yaratadi. Ichida chat_id, loyiha nomi va (forum bo'lsa) bo'lim
 * raqami bor, HMAC bilan imzolangan. Baza kerak emas — barcha ma'lumot
 * tokenning o'zida yuradi.
 *
 * Payload massiv ko'rinishida: [chatId, project, vaqt, bo'lim?]
 * Obyekt kalitlari ("c", "p", ...) joy egallamasligi uchun.
 */
export function createToken({ chatId, project, threadId, secret }) {
  const payload = [chatId, project, Math.floor(Date.now() / 1000)];
  if (threadId) payload.push(threadId);

  const payloadB64 = b64url(JSON.stringify(payload));
  return `${PREFIX}${payloadB64}.${hmac(payloadB64, secret).slice(0, SIG_LEN)}`;
}

function parsePayload(payloadB64) {
  const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

  // Yangi format: [chatId, project, vaqt, bo'lim?]
  if (Array.isArray(data)) {
    const [c, p, t, h] = data;
    if (typeof c !== 'number' || typeof p !== 'string') return null;
    return { chatId: c, project: p, issuedAt: t, threadId: typeof h === 'number' ? h : undefined };
  }

  // Eski format: { c, p, t, h } — tarqatilgan kalitlar ishlashda davom etsin
  const { c, p, t, h } = data;
  if (typeof c !== 'number' || typeof p !== 'string') return null;
  return { chatId: c, project: p, issuedAt: t, threadId: typeof h === 'number' ? h : undefined };
}

/**
 * Tokenni tekshiradi va ochadi. Imzo noto'g'ri bo'lsa null qaytaradi.
 */
export function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.startsWith(PREFIX)) return null;

  const [payloadB64, signature] = token.slice(PREFIX.length).split('.');
  if (!payloadB64 || !signature) return null;

  // Imzo uzunligi faqat ma'lum formatlardan biri bo'lishi mumkin —
  // aks holda qisqa imzo bilan tekshiruvni chetlab o'tish mumkin bo'lardi
  if (signature.length !== SIG_LEN && signature.length !== OLD_SIG_LEN) return null;

  const expected = hmac(payloadB64, secret).slice(0, signature.length);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return parsePayload(payloadB64);
  } catch {
    return null;
  }
}
