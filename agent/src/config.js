import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const DEFAULT_DIR = path.join(os.homedir(), '.pingo');
export const DEFAULT_PATH = path.join(DEFAULT_DIR, 'config.json');

export const DEFAULT_SERVER = 'https://pingo-7e6u.onrender.com';

export const DEFAULTS = {
  key: '',
  server: DEFAULT_SERVER,
  // "Tirikman" signali oralig'i (daqiqa). Guruhga xabar yubormaydi — faqat /status uchun.
  heartbeatMinutes: 5,
  // Kuzatiladigan manbalar. Bo'sh bo'lsa agent o'zi topishga harakat qiladi.
  watch: [
    // { type: 'file',    path: '/var/log/app/*.log', cwd: '/srv/app' }
    // { type: 'docker',  container: 'api' }
    // { type: 'systemd', unit: 'api.service' }
    // { type: 'pm2' }
  ],
};

export function loadConfig(file = DEFAULT_PATH) {
  if (!fs.existsSync(file)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    throw new Error(`config o‘qilmadi (${file}): ${err.message}`);
  }
}

export function saveConfig(config, file = DEFAULT_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return file;
}
