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

  get(chatId) {
    return this.#byChat.get(chatId);
  }

  set(chatId, project) {
    if (this.#byChat.size >= MAX) this.#byChat.delete(this.#byChat.keys().next().value);
    this.#byChat.set(chatId, { project, connectedAt: Date.now() });
  }

  clear(chatId) {
    this.#byChat.delete(chatId);
  }
}
