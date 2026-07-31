const MAX = 10_000;

/**
 * Bekor qilingan ulanishlar.
 *
 * Har guruh uchun faqat "qachon bekor qilingan" vaqti saqlanadi.
 * Shu vaqtdan OLDIN berilgan tokenlar yaroqsiz, keyin berilganlari ishlayveradi —
 * shuning uchun /disconnect dan keyin /connect qilsa hammasi qaytadan tiklanadi.
 *
 * Ro'yxat holat fayliga yoziladi (state.js) — jarayon qayta ishga tushsa
 * bekor qilingan kalit yana tirilib qolmasin. Fayl tizimi vaqtinchalik
 * bo'lgan muhitlarda (Render bepul rejasi) bu kafolat to'liq emas —
 * o'sha yerda ishonchli uzish uchun botni guruhdan chiqarish kerak, u holda
 * Telegram 403 qaytaradi va ulanish o'z-o'zidan qayta bekor qilinadi.
 */
export class Revocations {
  #at = new Map(); // chatId -> bekor qilingan vaqt (ms)
  #onChange;

  constructor({ onChange } = {}) {
    this.#onChange = onChange || (() => {});
  }

  revoke(chatId) {
    if (this.#at.size >= MAX) this.#at.delete(this.#at.keys().next().value);
    this.#at.set(chatId, Date.now());
    this.#onChange();
  }

  /** Token bekor qilinganlar ro'yxatiga tushadimi */
  isRevoked({ chatId, issuedAt }) {
    const at = this.#at.get(chatId);
    if (!at) return false;
    return issuedAt * 1000 < at;
  }

  clear(chatId) {
    if (this.#at.delete(chatId)) this.#onChange();
  }

  dump() {
    return [...this.#at];
  }

  load(rows) {
    if (!Array.isArray(rows)) return;
    for (const [chatId, at] of rows) {
      if (typeof chatId === 'number' && typeof at === 'number') this.#at.set(chatId, at);
    }
  }
}
