// Kalit ichidagi loyiha nomini o'qish.
//
// Kalit — imzolangan token, lekin uning ichidagi ma'lumot ochiq (base64).
// Imzoni tekshirish serverning ishi; bu yerda faqat "qaysi loyihaga
// ulanganmiz?" degan savolga javob kerak, shuning uchun oddiy o'qish yetarli.

export function projectFromKey(key) {
  try {
    const payload = String(key).replace(/^pg_/, '').split('.')[0];
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());

    // Yangi format: [chatId, project, ...] | Eski format: { c, p, ... }
    const project = Array.isArray(data) ? data[1] : data?.p;
    return typeof project === 'string' ? project : '';
  } catch {
    return '';
  }
}

/**
 * Kuzatiladigan manbalarni tanlaydi.
 *
 * Tartib:
 *   1. Config'dagi aniq ro'yxat (`watch`) — hamma narsadan ustun
 *   2. `only` (PINGO_WATCH) — foydalanuvchi aniq ko'rsatgan konteynerlar
 *   3. Kalitdagi loyiha nomiga mos konteyner — asosiy holat
 *   4. Hech biri mos kelmasa — hammasi (ogohlantirish bilan)
 */
export function selectSources({ config, detected, project, log }) {
  if (config.watch?.length) return config.watch;

  const only = (config.only || []).map((s) => String(s).trim()).filter(Boolean);
  if (only.length) {
    const tanlangan = detected.filter((s) => only.includes(s.container) || only.includes(s.type));
    const topilmagan = only.filter(
      (n) => !detected.some((s) => s.container === n || s.type === n)
    );
    if (topilmagan.length) log(`topilmadi: ${topilmagan.join(', ')}`);
    return tanlangan;
  }

  // Kalitdagi loyiha nomi konteyner nomiga mos kelsa — faqat o'shani kuzatamiz.
  // Bu eng keng tarqalgan holat: /connect xgo-backend → xgo-backend konteyneri.
  if (project) {
    const mos = detected.filter((s) => s.container === project);
    if (mos.length) {
      log(`loyiha "${project}" konteyneriga bog'landi`);
      return mos;
    }
    log(
      `"${project}" nomli konteyner topilmadi — serverdagi hamma manba kuzatiladi. ` +
        'Aniq ko\'rsatish uchun: PINGO_WATCH=konteyner_nomi'
    );
  }

  return detected;
}
