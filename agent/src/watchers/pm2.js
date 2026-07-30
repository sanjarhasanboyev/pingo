import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { LogParser } from '../detect.js';
import { spawnLines } from './stream.js';

const run = promisify(execFile);
const POLL_MS = 10_000;

// pm2 loglari "0|app-name  | matn" ko'rinishida keladi
const PREFIX = /^\d+\|([\w.-]+)\s*\|\s?(.*)$/;

export function hasPm2() {
  try {
    execFileSync('pm2', ['--version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function jlist() {
  const { stdout } = await run('pm2', ['jlist'], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
}

/**
 * Barcha PM2 jarayonlarini kuzatadi: loglaridagi xatolar va crash/restart hodisalari.
 * PM2 istalgan tildagi jarayonni boshqara oladi, shuning uchun bu til tanlamaydi.
 */
export function watchPm2({ emit, onLog }) {
  const parsers = new Map();
  const cwds = new Map(); // app nomi -> papkasi (git ma'lumoti uchun)
  const restarts = new Map();

  const parserFor = (app) => {
    if (!parsers.has(app)) {
      parsers.set(
        app,
        new LogParser({
          source: `pm2:${app}`,
          cwd: cwds.get(app),
          onEvent: (e) => emit({ ...e, cwd: cwds.get(app) }),
        })
      );
    }
    return parsers.get(app);
  };

  const proc = spawnLines({
    cmd: 'pm2',
    args: ['logs', '--lines', '0'],
    onLog,
    onLine(line) {
      const m = line.match(PREFIX);
      if (m) parserFor(m[1]).push(m[2]);
    },
  });

  // Crash/restart aniqlash — loglarga tushmasa ham bilib olamiz
  const poll = setInterval(async () => {
    try {
      const list = await jlist();
      for (const p of list) {
        const name = p.name;
        const cwd = p.pm2_env?.pm_cwd;
        if (cwd) cwds.set(name, cwd);

        const count = p.pm2_env?.restart_time ?? 0;
        const prev = restarts.get(name);
        restarts.set(name, count);

        if (prev !== undefined && count > prev) {
          emit({
            level: 'crash',
            source: `pm2:${name}`,
            cwd,
            timestamp: Date.now(),
            message: `Jarayon qayta ishga tushdi (restart #${count}). Holat: ${p.pm2_env?.status}`,
          });
        }
      }
    } catch (err) {
      onLog(`pm2 jlist: ${err.message}`);
    }
  }, POLL_MS);
  poll.unref?.();

  onLog('kuzatilyapti: pm2 (barcha jarayonlar)');
  return {
    stop() {
      clearInterval(poll);
      proc.stop();
      for (const p of parsers.values()) p.flush();
    },
  };
}
