import express from 'express';
import { createBot, registerCommands } from './bot.js';
import { verifyToken, derive } from './token.js';
import { formatEvent } from './format.js';
import { Throttle } from './throttle.js';
import { StatusStore } from './status.js';
import { Revocations } from './revocations.js';

const {
  BOT_TOKEN,
  SECRET_KEY,
  PORT = 3000,
  AGENT_PACKAGE = 'pingo-agent',
} = process.env;

// Render o'z manzilini RENDER_EXTERNAL_URL orqali beradi — qo'lda kiritish shart emas.
// Manzil bo'lsa webhook, bo'lmasa long polling (lokal ishlab chiqish uchun).
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN kiritilmagan');
if (!SECRET_KEY || SECRET_KEY.length < 32) {
  throw new Error('SECRET_KEY kamida 32 belgi bo‘lishi kerak (tokenlar shunga bog‘liq — hech qachon o‘zgartirmang)');
}

const derive_ = (purpose) => derive(purpose, SECRET_KEY);
const status = new StatusStore();
const revocations = new Revocations();
const bot = createBot({ botToken: BOT_TOKEN, secret: SECRET_KEY, status, revocations, agentPackage: AGENT_PACKAGE });

const throttle = new Throttle(async (chatId, event) => {
  try {
    await bot.telegram.sendMessage(chatId, formatEvent(event, { project: event.project }), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      // Forum guruhida aynan ulangan bo'limga yuboriladi
      ...(event.threadId ? { message_thread_id: event.threadId } : {}),
    });
  } catch (err) {
    // Bot guruhdan chiqarilgan yoki bloklangan — ulanishni bekor qilamiz,
    // shunda agent keyingi so'rovda 403 olib o'zi to'xtaydi.
    if (err?.response?.error_code === 403) {
      revocations.revoke(chatId);
      status.forget(chatId);
    }
    throw err;
  }
});

// Bitta kalitdan keladigan so'rovlar chastotasini cheklaymiz
const RATE = { WINDOW_MS: 60_000, MAX: 60 };
const hits = new Map();
function allowRequest(key) {
  const now = Date.now();
  const r = hits.get(key);
  if (!r || now >= r.resetAt) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + RATE.WINDOW_MS });
    return true;
  }
  r.count += 1;
  return r.count <= RATE.MAX;
}

const app = express();
app.use(express.json({ limit: '256kb' }));

// UptimeRobot shu manzilga ping qiladi (Render free tier uxlab qolmasligi uchun)
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.post('/report', async (req, res) => {
  const { key, events } = req.body || {};
  const claims = verifyToken(key, SECRET_KEY);
  if (!claims) return res.status(401).json({ error: 'kalit yaroqsiz' });
  if (revocations.isRevoked(claims)) return res.status(403).json({ error: 'ulanish bekor qilingan' });
  if (!allowRequest(key)) return res.status(429).json({ error: 'so‘rovlar juda tez-tez' });

  const list = Array.isArray(events) ? events.slice(0, 20) : [];
  if (!list.length) return res.status(400).json({ error: 'events bo‘sh' });

  // Agent kutib qolmasin — darhol javob qaytaramiz, yuborish fonda ketadi.
  res.json({ ok: true, accepted: list.length });

  for (const raw of list) {
    status.seen(claims.chatId, claims.project, raw.host);

    // Heartbeat faqat "tirikman" signali — guruhga yuborilmaydi
    if (raw.level === 'heartbeat') continue;

    const event = {
      level: raw.level,
      summary: raw.summary,
      stack: raw.stack,
      message: raw.message, // eski agentlar uchun
      operation: raw.operation,
      source: raw.source,
      repo: raw.repo,
      branch: raw.branch,
      commit: raw.commit,
      host: raw.host,
      frame: raw.frame,
      request: raw.request,
      timestamp: raw.timestamp,
      project: claims.project,
      threadId: claims.threadId,
    };

    status.error(claims.chatId, claims.project, event);

    try {
      await throttle.push(claims.chatId, event);
    } catch (err) {
      console.error('[report] yuborilmadi:', err?.message || err);
    }
  }
});

async function main() {
  if (PUBLIC_URL) {
    // Webhook rejimi (Render uchun).
    // Yo'l SECRET_KEY dan HMAC orqali hosil qilinadi — server qayta ishga
    // tushganda o'zgarmaydi, lekin kalitning o'zi haqida hech narsa oshkor qilmaydi.
    const path = `/tg/${derive_('webhook-path')}`;
    app.use(
      await bot.createWebhook({
        domain: PUBLIC_URL,
        path,
        secret_token: derive_('webhook-token'), // Telegram so'rovni shu sarlavha bilan imzolaydi
      })
    );
    console.log('[pingo] webhook rejimi');
  } else {
    // Lokal ishlab chiqish uchun
    bot.launch().catch((err) => console.error('[bot] launch:', err));
    console.log('[pingo] long polling rejimi');
  }

  // Buyruqlar menyusi — "/" bosilganda ko'rinadi
  await registerCommands(bot).catch((err) => console.error('[bot] buyruqlar:', err?.message || err));

  app.listen(PORT, () => console.log(`[pingo] server ${PORT}-portda`));
}

// Bitta so'rovdagi kutilmagan xato butun relay'ni yiqitmasin —
// aks holda barcha foydalanuvchilar uzilib qoladi.
process.on('uncaughtException', (err) => {
  console.error('[pingo] kutilmagan xato:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
  console.error('[pingo] kutilmagan rad javob:', err?.message || err);
});

// Noto'g'ri JSON va boshqa so'rov xatolari uchun
app.use((err, _req, res, _next) => {
  console.error('[pingo] so‘rov xatosi:', err?.message || err);
  res.status(400).json({ error: 'so‘rov noto‘g‘ri' });
});

main().catch((err) => {
  console.error('[pingo] ishga tushmadi:', err);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
