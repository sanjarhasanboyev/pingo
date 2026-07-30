import os from 'node:os';
import { ReportQueue } from './queue.js';
import { gitInfo } from './git.js';
import { watchFile } from './watchers/file.js';
import { watchDocker, listContainers } from './watchers/docker.js';
import { watchSystemd } from './watchers/systemd.js';
import { watchPm2, hasPm2 } from './watchers/pm2.js';
import { projectFromKey, selectSources } from './target.js';

const log = (msg) => console.log(`[pingo] ${msg}`);

/**
 * Config bo'sh bo'lsa — serverda nima ishlayotganini o'zi topadi.
 */
export function autoDetect(ignore = []) {
  const skip = new Set(ignore.map((s) => String(s).trim()).filter(Boolean));

  const found = [];
  if (hasPm2() && !skip.has('pm2')) found.push({ type: 'pm2' });
  for (const container of listContainers()) {
    if (!skip.has(container)) found.push({ type: 'docker', container });
  }
  return found;
}

export async function runAgent(config) {
  if (!config.key) throw new Error('kalit yo‘q — avval `pingo init` yoki `--key` bering');

  const host = os.hostname();
  const watchers = [];
  const queue = new ReportQueue({ serverUrl: config.server, key: config.key, onLog: log });
  queue.start();

  // Hodisani yuborishdan oldin git ma'lumoti bilan boyitamiz
  const emit = (event) => {
    const { cwd, ...rest } = event;

    if (rest.level !== 'heartbeat') {
      log(`aniqlandi [${rest.level}] ${rest.source}: ${String(rest.summary || '').slice(0, 90)}`);
    }

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

  if (config.ignore?.length) log(`e'tiborsiz qoldirilyapti: ${config.ignore.join(', ')}`);

  const project = projectFromKey(config.key);
  const sources = selectSources({
    config,
    detected: autoDetect(config.ignore),
    project,
    log,
  });

  if (!sources.length) {
    throw new Error(
      'kuzatish uchun manba topilmadi — configga qo‘shing (pm2 / docker / systemd / log fayl)'
    );
  }
  log(`kuzatiladi: ${sources.map((s) => s.type + (s.container ? `/${s.container}` : '')).join(', ')}`);

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
