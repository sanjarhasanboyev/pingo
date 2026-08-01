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
/**
 * Configdagi `also` — har doim qo'shiladigan qo'shimcha manbalar.
 *
 * `watch` dan farqi: `watch` avtomatik topishning O'RNINI bosadi, `also` esa
 * ustiga QO'SHADI. Shu sababli log fayllarini (nginx kabi — ular avtomatik
 * topilmaydi) qo'shsangiz ham konteynerlar avtomatik topilaveradi va
 * guruhdagi tanlov tugmalari ishlashda davom etadi.
 */
export function extras(config) {
  const list = Array.isArray(config?.also) ? config.also : [];
  return list.filter((s) => s && typeof s.type === 'string');
}

/**
 * Tanlov uchun ko'rsatiladigan manbalar: infratuzilma (baza, kesh) chiqarib
 * tashlanadi. Hammasi infratuzilma bo'lsa — ro'yxat to'liq qoladi, aks holda
 * tanlash uchun hech narsa qolmasdi.
 */
export function candidates(sources) {
  const apps = sources.filter((s) => !s.infra);
  return apps.length ? apps : sources;
}

/**
 * @param askWillFollow - keyin guruhda tanlov so'raladimi. So'ralsa, "nom mos
 *   kelmadi" ogohlantirishi chiqarilmaydi: nom bermaslik normal holat va
 *   qaysi manba kuzatilishini foydalanuvchi tugma orqali hal qiladi.
 */
export function selectSources({ config, detected, project, log, askWillFollow = false }) {
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
    if (!askWillFollow) {
      log(
        `"${project}" nomli konteyner topilmadi — serverdagi hamma manba kuzatiladi. ` +
          'Aniq ko\'rsatish uchun: PINGO_WATCH=konteyner_nomi'
      );
    }
  }

  return detected;
}
