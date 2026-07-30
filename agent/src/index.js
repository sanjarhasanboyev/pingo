import os from 'node:os';
import { ReportQueue } from './queue.js';
import { gitInfo } from './git.js';
import { watchFile } from './watchers/file.js';
import { watchDocker, listContainers } from './watchers/docker.js';
import { watchSystemd } from './watchers/systemd.js';
import { watchPm2, hasPm2 } from './watchers/pm2.js';

const log = (msg) => console.log(`[pingo] ${msg}`);

/**
 * Config bo'sh bo'lsa — serverda nima ishlayotganini o'zi topadi.
 */
export function autoDetect() {
  const found = [];
  if (hasPm2()) found.push({ type: 'pm2' });
  for (const container of listContainers()) found.push({ type: 'docker', container });
  return found;
}

export async function runAgent(config) {
  if (!config.key) throw new Error('kalit yo‘q — avval `pingo init` yoki `--key` bering');

  const host = os.hostname();
  // Ulanish bekor qilinsa (guruhda /disconnect yoki bot guruhdan chiqarilsa)
  // agent o'zi to'xtaydi — behuda ishlab turmasligi uchun.
  const watchers = [];
  const queue = new ReportQueue({
    serverUrl: config.server,
    key: config.key,
    onLog: log,
    onRevoked: () => {
      for (const w of watchers) w.stop();
      log('kuzatish to‘xtatildi');
      process.exit(0);
    },
  });
  queue.start();

  // Hodisani yuborishdan oldin git ma'lumoti bilan boyitamiz
  const emit = (event) => {
    const { cwd, ...rest } = event;

    // Ma'lumot allaqachon bor (masalan Docker image yorliqlaridan) — git kerak emas
    if (rest.repo || rest.commit) {
      queue.add({ ...rest, host });
      return;
    }

    gitInfo(cwd)
      .then(({ branch, commit, repo }) => {
        queue.add({ ...rest, host, branch, commit, repo });
      })
      .catch(() => queue.add({ ...rest, host }));
  };

  let sources = config.watch;
  if (!sources?.length) {
    sources = autoDetect();
    if (!sources.length) {
      throw new Error(
        'kuzatish uchun manba topilmadi — configga qo‘shing (pm2 / docker / systemd / log fayl)'
      );
    }
    log(`avtomatik topildi: ${sources.map((s) => s.type + (s.container ? `/${s.container}` : '')).join(', ')}`);
  }

  for (const src of sources) {
    try {
      if (src.type === 'pm2') watchers.push(watchPm2({ emit, onLog: log }));
      else if (src.type === 'docker') watchers.push(watchDocker({ ...src, emit, onLog: log }));
      else if (src.type === 'systemd') watchers.push(watchSystemd({ ...src, emit, onLog: log }));
      else if (src.type === 'file') watchers.push(watchFile({ ...src, emit, onLog: log }));
      else log(`noma'lum manba turi: ${src.type}`);
    } catch (err) {
      // Bitta manba ishlamasa qolganlari davom etaveradi
      log(`${src.type} ulanmadi: ${err.message}`);
    }
  }

  if (!watchers.length) throw new Error('birorta ham kuzatuvchi ishga tushmadi');

  // "Tirikman" signali — guruhga chiqmaydi, faqat /status uchun.
  // Xato bo'lmasa boshqa hech narsa yuborilmaydi.
  const beat = () => queue.add({ level: 'heartbeat', host, timestamp: Date.now() });
  beat();
  const heartbeat = setInterval(beat, (config.heartbeatMinutes ?? 5) * 60_000);
  heartbeat.unref?.();

  const shutdown = () => {
    log('to‘xtatilyapti…');
    clearInterval(heartbeat);
    for (const w of watchers) w.stop();
    queue.stop();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  log(`ishga tushdi — ${host}`);
  return { emit, queue };
}
