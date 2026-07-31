const MAX = 5000;

/**
 * Guruhga hozir ulangan loyiha (agar bo'lsa).
 *
 * Bitta guruhga bir vaqtda faqat bitta ulanish bo'lishi mumkin — /connect
 * ikkinchi marta bosilsa, avval /disconnect qilish talab qilinadi. Bu
 * tasodifan eski agentni "yetim" qoldirib, ustidan yangi kalit yaratib
 * yuborishning oldini oladi (eski kalit ishlayveradi, lekin hech kim
 * bilmay qoladi).
 */
export class Connections {
  #byChat = new Map(); // chatId -> { project, connectedAt }
  #onChange;

  constructor({ onChange } = {}) {
    this.#onChange = onChange || (() => {});
  }

  get(chatId) {
    return this.#byChat.get(chatId);
  }

  set(chatId, project) {
    if (this.#byChat.size >= MAX) this.#byChat.delete(this.#byChat.keys().next().value);
    this.#byChat.set(chatId, { project, connectedAt: Date.now() });
    this.#onChange();
  }

  /**
   * Agentdan tasdiqlangan xabar kelganda ulanishni tiklaydi.
   *
   * Bu ro'yxat relay qayta ishga tushganda bo'shab qoladi va uni /connect dan
   * boshqa hech kim to'ldirmasdi — natijada allaqachon ulangan guruhda
   * /connect qayta kalit berib yuborardi. Endi holat StatusStore kabi
   * agent signalidan o'zi tiklanadi. Mavjud yozuv ustidan yozilmaydi,
   * shunda haqiqiy ulanish vaqti saqlanadi.
   */
  remember(chatId, project) {
    if (this.#byChat.has(chatId)) return;
    this.set(chatId, project);
  }

  clear(chatId) {
    if (this.#byChat.delete(chatId)) this.#onChange();
  }

  dump() {
    return [...this.#byChat].map(([chatId, r]) => [chatId, r.project, r.connectedAt]);
  }

  load(rows) {
    if (!Array.isArray(rows)) return;
    for (const [chatId, project, connectedAt] of rows) {
      if (typeof chatId === 'number' && typeof project === 'string') {
        this.#byChat.set(chatId, { project, connectedAt: connectedAt || Date.now() });
      }
    }
  }
}
