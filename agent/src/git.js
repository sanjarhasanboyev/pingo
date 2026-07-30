import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TTL_MS = 30_000; // branch tez-tez o'zgarmaydi, keshlaymiz
const cache = new Map();

async function git(cwd, args) {
  const { stdout } = await run('git', args, { cwd, timeout: 3000 });
  return stdout.trim();
}

/**
 * Loyiha papkasidan repo/branch/commit ma'lumotini oladi.
 * Git bo'lmasa bo'sh qaytaradi — bu xato emas.
 */
export async function gitInfo(cwd) {
  if (!cwd) return {};

  const hit = cache.get(cwd);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let value = {};
  try {
    const [branch, commit, remote] = await Promise.all([
      git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ''),
      git(cwd, ['rev-parse', 'HEAD']).catch(() => ''),
      git(cwd, ['config', '--get', 'remote.origin.url']).catch(() => ''),
    ]);
    const repo = remote ? remote.replace(/\.git$/, '').split(/[/:]/).slice(-2).join('/') : '';
    value = { branch, commit, repo };
  } catch {
    value = {};
  }

  cache.set(cwd, { at: Date.now(), value });
  return value;
}
