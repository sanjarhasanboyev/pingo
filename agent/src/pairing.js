const POLL_MS = 3000;
const TIMEOUT_MS = 10 * 60_000; // 10 daqiqa ichida tanlanmasa, hammasini kuzatamiz

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`server ${res.status}`);
  return res.json();
}

/**
 * Guruhda tanlov so'raydi va javobni kutadi.
 *
 * Agent o'zi kuzata oladigan manbalar ro'yxatini yuboradi, bot guruhda
 * tugmalarni ko'rsatadi, foydalanuvchi tanlaydi. Shu tarzda foydalanuvchi
 * konteyner nomini eslab yozishi shart emas — ro'yxatdan tanlaydi.
 *
 * Tanlanmasa yoki aloqa bo'lmasa — barcha manbalar kuzatiladi (xabar
 * yo'qolgandan ko'ra ortiqcha kelgani yaxshi).
 */
export async function askUserToPick({ serverUrl, key, sources, host, log }) {
  const base = serverUrl.replace(/\/$/, '');

  try {
    await post(`${base}/register`, { key, sources, host });
  } catch (err) {
    log(`tanlov so‘ralmadi (${err.message}) — barcha manbalar kuzatiladi`);
    return sources;
  }

  log(`guruhda tanlov kutilyapti — ${sources.length} ta manba ro‘yxatga yuborildi`);

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    try {
      const url = `${base}/assignment?key=${encodeURIComponent(key)}&host=${encodeURIComponent(host)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });

      if (res.status === 401 || res.status === 403) {
        log('kalit yaroqsiz yoki bekor qilingan');
        return [];
      }
      if (!res.ok) continue;

      const { choice } = await res.json();
      if (!choice) continue;

      if (choice.all) {
        log('tanlandi: hammasi');
        return sources;
      }

      const mos = sources.filter(
        (s) => s.container === choice.container && s.type === choice.type
      );
      log(`tanlandi: ${choice.container || choice.type}`);
      return mos.length ? mos : sources;
    } catch {
      // aloqa uzilgan bo'lishi mumkin — keyingi urinishda davom etamiz
    }
  }

  log('tanlov qilinmadi — barcha manbalar kuzatiladi');
  return sources;
}
