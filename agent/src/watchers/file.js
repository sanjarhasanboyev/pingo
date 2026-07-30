import { globSync } from 'node:fs';
import { basename } from 'node:path';
import { LogParser } from '../detect.js';
import { spawnLines } from './stream.js';

/**
 * Oddiy log fayllarni kuzatadi (tail -F).
 * Har qanday tildagi ilova log yozsa — shu yerda ushlanadi.
 */
export function watchFile({ path: pattern, cwd, emit, onLog }) {
  const files = pattern.includes('*') ? globSync(pattern) : [pattern];
  if (!files.length) {
    onLog(`fayl topilmadi: ${pattern}`);
    return { stop() {} };
  }

  // Har fayl uchun alohida parser — stack trace'lar aralashib ketmasligi uchun
  const parsers = new Map();
  const parserFor = (file) => {
    if (!parsers.has(file)) {
      parsers.set(
        file,
        // Xabarda faqat fayl nomi ko'rsatiladi — to'liq yo'l uzun va keraksiz
        new LogParser({ source: basename(file), cwd, onEvent: (e) => emit({ ...e, cwd }) })
      );
    }
    return parsers.get(file);
  };

  let current = files[0];

  const proc = spawnLines({
    cmd: 'tail',
    args: ['-F', '-n', '0', ...files],
    onLog,
    onLine(line) {
      // tail bir nechta fayl bilan "==> fayl <==" sarlavhasini chiqaradi
      const header = line.match(/^==> (.+) <==$/);
      if (header) {
        current = header[1];
        return;
      }
      parserFor(current).push(line);
    },
  });

  onLog(`kuzatilyapti: ${files.join(', ')}`);
  return {
    stop() {
      proc.stop();
      for (const p of parsers.values()) p.flush();
    },
  };
}
