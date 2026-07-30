const MAX = 10_000;

/**
 * Bekor qilingan ulanishlar.
 *
 * Har guruh uchun faqat "qachon bekor qilingan" vaqti saqlanadi.
 * Shu vaqtdan OLDIN berilgan tokenlar yaroqsiz, keyin berilganlari ishlayveradi —
 * shuning uchun /disconnect dan keyin /connect qilsa hammasi qaytadan tiklanadi.
 *
 * Cheklov: ma'lumot xotirada turadi, server qayta ishga tushsa yo'qoladi.
 * Ishonchli (doimiy) uzish uchun botni guruhdan chiqarish kerak — u holda
 * Telegram 403 qaytaradi va ulanish o'z-o'zidan qayta bekor qilinadi.
 */
export class Revocations {
  #at = new Map(); // chatId -> bekor qilingan vaqt (ms)

  revoke(chatId) {
    if (this.#at.size >= MAX) this.#at.delete(this.#at.keys().next().value);
    this.#at.set(chatId, Date.now());
  }

  /** Token bekor qilinganlar ro'yxatiga tushadimi */
  isRevoked({ chatId, issuedAt }) {
    const at = this.#at.get(chatId);
    if (!at) return false;
    return issuedAt * 1000 < at;
  }

  clear(chatId) {
    this.#at.delete(chatId);
  }
}
