import { LogParser } from '../detect.js';
import { spawnLines } from './stream.js';

/**
 * systemd xizmati loglarini kuzatadi (journalctl).
 * Java, Python, Go, .NET — farqi yo'q, hammasi journal'ga tushadi.
 */
export function watchSystemd({ unit, cwd, emit, onLog }) {
  const parser = new LogParser({
    source: `systemd:${unit}`,
    cwd,
    onEvent: (e) => emit({ ...e, cwd }),
  });

  const proc = spawnLines({
    cmd: 'journalctl',
    args: ['-f', '-n', '0', '-o', 'cat', '-u', unit],
    onLog,
    onLine: (line) => parser.push(line),
  });

  onLog(`kuzatilyapti: systemd/${unit}`);
  return {
    stop() {
      proc.stop();
      parser.flush();
    },
  };
}
