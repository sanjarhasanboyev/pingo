import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { LogParser } from '../detect.js';
import { spawnLines } from './stream.js';

/**
 * Ishlab turgan konteynerlar ro'yxati.
 *
 * Agentning O'Z konteyneri ro'yxatdan chiqariladi: uni kuzatishning ma'nosi yo'q
 * va o'z loglarini qayta o'qish keraksiz aylanma yuk beradi.
 * Konteyner ichida hostname — qisqa konteyner ID'siga teng bo'ladi.
 */
export function listContainers() {
  try {
    const self = os.hostname();
    return execFileSync('docker', ['ps', '--format', '{{.ID}}\t{{.Names}}'], {
      encoding: 'utf8',
      timeout: 5000,
    })
      .split('\n')
      .map((line) => line.split('\t'))
      .filter(([id, name]) => name?.trim() && !self.startsWith(id.trim()))
      .map(([, name]) => name.trim());
  } catch {
    return [];
  }
}

/**
 * Konteyner haqidagi ma'lumotni image yorliqlaridan oladi.
 * Loyiha kodi serverda bo'lmasa ham (masalan Docker Hub'dan tortilgan image)
 * repo va commit shu yerdan aniqlanadi — agar image OCI yorliqlari bilan yig'ilgan bo'lsa.
 */
export function inspectMeta(container) {
  try {
    const out = execFileSync(
      'docker',
      ['inspect', '--format', '{{json .Config.Labels}}|{{.Config.Image}}', container],
      { encoding: 'utf8', timeout: 5000 }
    ).trim();

    const sep = out.lastIndexOf('|');
    const labels = JSON.parse(out.slice(0, sep) || '{}') || {};
    const image = out.slice(sep + 1);

    const source = labels['org.opencontainers.image.source'] || '';
    const repo = source
      ? source.replace(/\.git$/, '').split('/').slice(-2).join('/')
      : image.split(':')[0]; // yorliq yo'q bo'lsa image nomining o'zi

    return {
      repo,
      commit: labels['org.opencontainers.image.revision'] || '',
      branch: labels['org.opencontainers.image.version'] || '',
    };
  } catch {
    return {};
  }
}

/**
 * Docker konteyner loglarini kuzatadi — konteyner ichida qaysi til
 * ishlayotgani ahamiyatsiz, loyiha kodi serverda bo'lishi ham shart emas.
 */
export function watchDocker({ container, cwd, emit, onLog }) {
  const meta = cwd ? {} : inspectMeta(container); // cwd berilgan bo'lsa git ma'lumoti ustun

  const parser = new LogParser({
    source: `docker:${container}`,
    cwd,
    onEvent: (e) => emit({ ...e, cwd, ...meta }),
  });

  const proc = spawnLines({
    cmd: 'docker',
    args: ['logs', '-f', '--tail', '0', container],
    onLog,
    onLine: (line) => parser.push(line),
  });

  onLog(`kuzatilyapti: docker/${container}`);
  return {
    stop() {
      proc.stop();
      parser.flush();
    },
  };
}
