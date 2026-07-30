import os from 'node:os';

/**
 * Server nomini aniqlaydi.
 *
 * Docker konteyner ichida `os.hostname()` VPS nomini emas, konteynerning
 * texnik ID'sini qaytaradi (masalan "c92285940cb6") — bu foydalanuvchiga
 * hech narsa anglatmaydi. Shuning uchun PINGO_HOST beriladi va ustun turadi.
 */
export function resolveHost() {
  return process.env.PINGO_HOST || os.hostname();
}
