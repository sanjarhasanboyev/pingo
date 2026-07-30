import { spawn } from 'node:child_process';

const RESTART_MS = 5000;

/**
 * Buyruqni ishga tushirib, chiqishini qator-qator uzatadi.
 * Jarayon to'xtab qolsa o'zi qayta ishga tushiradi (log rotatsiya, docker restart va h.k.).
 */
export function spawnLines({ cmd, args, onLine, onLog = () => {} }) {
  let child = null;
  let stopped = false;
  let timer = null;

  const start = () => {
    if (stopped) return;

    child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let buf = '';
    const handle = (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) onLine(line);
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', handle);
    child.stderr.on('data', handle); // xatolar odatda stderr'da

    child.on('error', (err) => {
      onLog(`${cmd} ishga tushmadi: ${err.message}`);
    });

    child.on('close', () => {
      if (stopped) return;
      timer = setTimeout(start, RESTART_MS);
      timer.unref?.();
    });
  };

  start();

  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      child?.kill();
    },
  };
}
