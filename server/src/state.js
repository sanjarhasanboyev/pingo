import fs from 'node:fs';
import path from 'node:path';

const FILE = process.env.PINGO_STATE_FILE || 'data/state.json';
const DEBOUNCE_MS = 2000; // yozuvlar to'planib, bir marta diskka tushsin

/**
 * Kichik holat fayli — ulanishlar va bekor qilishlar uchun.
 *
 * Baza qo'shmaslik uchun oddiy JSON fayl yetarli: ma'lumot juda kam
 * (guruh boshiga bir necha bayt) va yozuvlar kamdan-kam bo'ladi.
 *
 * DIQQAT — Render'ning bepul rejasida fayl tizimi vaqtinchalik: yangi
 * deploy yoki instansiya almashuvida bu fayl yo'qoladi. Ya'ni u yerda
 * saqlash faqat jarayon qayta ishga tushishidan himoya qiladi. Ishonchli
 * saqlash uchun doimiy disk yoki tashqi baza kerak. O'z serverida
 * (VPS/Docker) ishlatilsa — to'liq ishlaydi, faylni volume'ga chiqaring.
 */
export function readState() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
  } catch {
    return {}; // fayl yo'q yoki buzuq — bo'sh holatdan boshlaymiz
  }
}

export function createSaver(collect) {
  let timer = null;
  let warned = false;

  const write = () => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      // Avval vaqtinchalik faylga yozib, keyin almashtiramiz — yozish
      // yarmida uzilib qolsa, eski fayl buzilmasin
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(collect()), { mode: 0o600 });
      fs.renameSync(tmp, FILE);
    } catch (err) {
      // Fayl tizimi yozishga ruxsat bermasa ham server ishlashda davom etsin
      if (!warned) {
        warned = true;
        console.warn(`[pingo] holat fayli saqlanmadi (${FILE}): ${err.message}`);
      }
    }
  };

  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(write, DEBOUNCE_MS);
    timer.unref?.();
  };

  // Jarayon to'xtatilayotganda kutib turgan yozuvni darhol diskka tushiramiz —
  // aks holda oxirgi soniyalardagi /disconnect yoki /connect yo'qolib ketardi.
  save.flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    write();
  };

  return save;
}
