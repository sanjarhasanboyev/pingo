import crypto from 'node:crypto';

const DEDUPE_WINDOW_MS = 60_000; // bir xil xato shu oraliqda bitta xabar bo'ladi
const RATE_LIMIT = 15; // bitta guruhga daqiqasiga maksimal xabar (Telegram limiti ~20)
const RATE_WINDOW_MS = 60_000;

/**
 * Log toshqinidan himoya: bir xil xatolarni birlashtiradi va guruhga
 * yuboriladigan xabar sonini cheklaydi.
 */
export class Throttle {
  #groups = new Map(); // fingerprint -> { count, timer }
  #rates = new Map(); // chatId -> { count, resetAt, notified }

  constructor(send) {
    this.send = send; // async (chatId, event) => void
  }

  #fingerprint(chatId, event) {
    // Xato matnining birinchi qatori + manba — takrorni aniqlash uchun yetarli.
    // Raqamlar va qo'shtirnoq/apostrof ichidagi qiymatlar (id, vaqt, port,
    // username, email) olib tashlanadi — aks holda masalan brute-force
    // urinishlarida har safar boshqa username tufayli yangi xato deb hisoblanadi.
    const base = event.summary || String(event.stack || event.message || '').split('\n')[0];
    const firstLine = base
      .replace(/"[^"]*"|'[^']*'/g, '#')
      .replace(/\d+/g, '#');
    return crypto
      .createHash('sha1')
      .update(`${chatId}|${event.source || ''}|${firstLine}`)
      .digest('hex');
  }

  #allowedByRate(chatId) {
    const now = Date.now();
    let r = this.#rates.get(chatId);
    if (!r || now >= r.resetAt) {
      r = { count: 0, resetAt: now + RATE_WINDOW_MS, notified: false };
      this.#rates.set(chatId, r);
    }
    r.count += 1;
    if (r.count <= RATE_LIMIT) return { allow: true };
    if (!r.notified) {
      r.notified = true;
      return { allow: false, notice: true };
    }
    return { allow: false };
  }

  async push(chatId, event) {
    const fp = this.#fingerprint(chatId, event);
    const existing = this.#groups.get(fp);

    if (existing) {
      // Oyna ichida takrorlandi — faqat hisoblaymiz, xabar yubormaymiz.
      existing.count += 1;
      return { deduped: true };
    }

    const rate = this.#allowedByRate(chatId);
    if (!rate.allow) {
      if (rate.notice) {
        await this.send(chatId, {
          level: 'warn',
          summary: `Xabarlar juda ko'p kelyapti — keyingi daqiqada ortiqchasi yuborilmaydi.`,
          project: event.project,
        });
      }
      return { rateLimited: true };
    }

    const entry = { count: 1, timer: null };
    entry.timer = setTimeout(() => {
      this.#groups.delete(fp);
      if (entry.count > 1) {
        // Oyna tugadi va takrorlar bo'lgan — yig'ma xabar yuboramiz.
        this.send(chatId, {
          ...event,
          count: entry.count,
          summary: `${event.summary || 'Xato'} — yana ${entry.count - 1} marta takrorlandi`,
          stack: '',
          message: '',
        }).catch(() => {});
      }
    }, DEDUPE_WINDOW_MS);
    entry.timer.unref?.();
    this.#groups.set(fp, entry);

    await this.send(chatId, event);
    return { sent: true };
  }
}
