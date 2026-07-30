const MAX_QUEUE = 200; // xotira o'smasligi uchun cheklangan
const BATCH = 20;
const FLUSH_MS = 2000;
const BASE_BACKOFF_MS = 4000;
const MAX_BACKOFF_MS = 60_000;
const REVOKED_RETRY_MS = 300_000; // kalit bekor bo'lsa 5 daqiqada bir qayta tekshiramiz

/**
 * Hodisalarni to'plab, serverga guruh-guruh yuboradi.
 * Server javob bermasa navbatda saqlaydi va tobora uzoqroq kutib qayta urinadi —
 * shu sababli qisqa uzilishlarda xabar yo'qolmaydi, uzun uzilishda esa
 * server behuda urinishlar bilan yuklanmaydi.
 */
export class ReportQueue {
  #items = [];
  #failures = 0;
  #retryAt = 0;
  #timer = null;
  #sending = false;
  #stopped = false;
  #warnedRevoked = false;

  constructor({ serverUrl, key, onLog = () => {} }) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.key = key;
    this.onLog = onLog;
  }

  start() {
    this.#timer = setInterval(() => this.#flush(), FLUSH_MS);
    this.#timer.unref?.();
  }

  stop() {
    this.#stopped = true;
    clearInterval(this.#timer);
  }

  add(event) {
    if (this.#stopped) return;
    if (this.#items.length >= MAX_QUEUE) this.#items.shift(); // eng eskisini tashlaymiz
    this.#items.push(event);
  }

  #backoff() {
    this.#failures += 1;
    const wait = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (this.#failures - 1));
    this.#retryAt = Date.now() + wait;
    return wait;
  }

  async #flush() {
    if (this.#stopped || this.#sending || !this.#items.length) return;
    if (Date.now() < this.#retryAt) return;

    this.#sending = true;
    // Navbatdan darhol olib qo'yamiz — yuborish davomida navbat o'zgarsa ham
    // noto'g'ri elementlar o'chib ketmasligi uchun.
    const batch = this.#items.splice(0, BATCH);

    try {
      const res = await fetch(`${this.serverUrl}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: this.key, events: batch }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 401 || res.status === 403) {
        // Kalit yaroqsiz yoki ulanish bekor qilingan.
        // Jarayonni tugatmaymiz: konteyner "restart: always" bilan ishlayotgan
        // bo'lsa cheksiz qayta ishga tushish sikliga tushib qolardi.
        // Buning o'rniga navbatni bo'shatib, uzoq oraliqda qayta tekshiramiz —
        // server qayta ishga tushsa yoki qaytadan ulansangiz o'zi tiklanadi.
        this.#items = [];
        this.#retryAt = Date.now() + REVOKED_RETRY_MS;

        if (!this.#warnedRevoked) {
          this.#warnedRevoked = true;
          this.onLog(
            `${res.status === 403 ? 'ulanish bekor qilingan' : 'kalit yaroqsiz'} — ` +
              'guruhda /connect orqali yangi kalit oling. ' +
              `Har ${REVOKED_RETRY_MS / 60000} daqiqada qayta tekshiraman.`
          );
        }
        return;
      }

      if (!res.ok) throw new Error(`server ${res.status}`);

      this.#failures = 0;
      this.#retryAt = 0;
      this.#warnedRevoked = false;
    } catch (err) {
      // Yuborilmagan hodisalarni navbat boshiga qaytaramiz
      this.#items.unshift(...batch);
      if (this.#items.length > MAX_QUEUE) this.#items = this.#items.slice(-MAX_QUEUE);

      const wait = this.#backoff();
      this.onLog(`yuborilmadi (${err.message}) — ${Math.round(wait / 1000)}s dan keyin qayta urinaman`);
    } finally {
      this.#sending = false;
    }
  }
}
