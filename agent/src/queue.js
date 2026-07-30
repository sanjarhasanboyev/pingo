const MAX_QUEUE = 200; // xotira o'smasligi uchun cheklangan
const BATCH = 20;
const FLUSH_MS = 2000;
const BASE_BACKOFF_MS = 4000;
const MAX_BACKOFF_MS = 60_000;

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

  constructor({ serverUrl, key, onLog = () => {}, onRevoked = () => {} }) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.key = key;
    this.onLog = onLog;
    this.onRevoked = onRevoked; // kalit bekor qilinganda chaqiriladi
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
        // Kalit yaroqsiz yoki bekor qilingan — qayta urinishdan foyda yo'q
        this.#items = [];
        this.stop();
        this.onLog(
          res.status === 403
            ? 'ulanish bekor qilindi — guruhda /connect orqali yangi kalit oling'
            : 'kalit yaroqsiz — guruhda /connect orqali yangi kalit oling'
        );
        this.onRevoked();
        return;
      }

      if (!res.ok) throw new Error(`server ${res.status}`);

      this.#failures = 0;
      this.#retryAt = 0;
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
