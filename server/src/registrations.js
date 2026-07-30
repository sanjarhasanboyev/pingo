import crypto from 'node:crypto';

const TTL_MS = 30 * 60_000; // tanlanmagan ro'yxat 30 daqiqada eskiradi
const MAX = 2000;

/**
 * Agentlarning "men ishga tushdim, mana kuzata oladigan manbalarim" so'rovlari.
 *
 * Oqim:
 *   agent /register  →  bot guruhda tugmalarni ko'rsatadi  →  foydalanuvchi tanlaydi
 *   →  agent /assignment orqali javobni oladi va faqat o'shani kuzatadi
 *
 * Ma'lumot xotirada turadi va u yerda uzoq saqlanishi shart emas:
 * yakuniy tanlov agentning O'ZIDA saqlanadi, shuning uchun relay qayta
 * ishga tushsa ham ishlayotgan agentlarga ta'sir qilmaydi.
 */
export class Registrations {
  #byId = new Map(); // regId -> { chatId, threadId, sources, host, choice, at }

  #cleanup() {
    const now = Date.now();
    for (const [id, r] of this.#byId) {
      if (now - r.at > TTL_MS) this.#byId.delete(id);
    }
    while (this.#byId.size >= MAX) this.#byId.delete(this.#byId.keys().next().value);
  }

  /** Agent ro'yxatdan o'tadi, tanlov kutiladi */
  open({ chatId, threadId, sources, host }) {
    this.#cleanup();
    const id = crypto.randomBytes(5).toString('hex');
    this.#byId.set(id, { chatId, threadId, sources, host, choice: null, at: Date.now() });
    return id;
  }

  get(id) {
    return this.#byId.get(id);
  }

  /** Foydalanuvchi tugmani bosdi */
  choose(id, choice) {
    const r = this.#byId.get(id);
    if (!r) return null;
    r.choice = choice;
    r.at = Date.now();
    return r;
  }

  /**
   * Shu guruh uchun tanlangan javobni qaytaradi.
   * Agent takroran so'ramasligi uchun javob berilgach yozuv o'chiriladi.
   */
  take(chatId, host) {
    for (const [id, r] of this.#byId) {
      if (r.chatId === chatId && r.host === host && r.choice) {
        this.#byId.delete(id);
        return r.choice;
      }
    }
    return null;
  }

  /** Shu guruh/host uchun javob kutayotgan yozuv bormi */
  pending(chatId, host) {
    for (const r of this.#byId.values()) {
      if (r.chatId === chatId && r.host === host && !r.choice) return true;
    }
    return false;
  }
}
