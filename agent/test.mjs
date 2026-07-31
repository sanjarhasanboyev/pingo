import { isInfra } from './src/kinds.js';
import { candidates, extras, selectSources } from './src/target.js';

let ok = 0;
let fail = 0;
const check = (name, cond) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '✓' : '✗'} ${name}`);
};

const docker = (container) => ({ type: 'docker', container, infra: isInfra(container) });

// ── Infratuzilmani tanish ────────────────────────────────────────────────
check('lc_postgres — infratuzilma', isInfra('lc_postgres'));
check('redis-cache — infratuzilma', isInfra('redis-cache'));
check('my-mongodb-1 — infratuzilma', isInfra('my-mongodb-1'));
check('lc-test-system — loyiha', !isInfra('lc-test-system'));
check('xgo-backend — loyiha', !isInfra('xgo-backend'));
check('postgrest-api — loyiha (postgres emas)', !isInfra('postgrest-api'));

// ── Tanlov ro'yxati ──────────────────────────────────────────────────────
{
  const sources = [docker('lc-test-system'), docker('lc_postgres')];
  const c = candidates(sources);
  check('bazani tanlovdan chiqaradi', c.length === 1 && c[0].container === 'lc-test-system');
}
{
  // Faqat infratuzilma bo'lsa — hech narsa yashirilmaydi, aks holda
  // tanlash uchun ro'yxat bo'sh qolardi
  const sources = [docker('lc_postgres'), docker('redis')];
  check('hammasi infratuzilma bo\'lsa ro\'yxat to\'liq qoladi', candidates(sources).length === 2);
}
{
  const sources = [docker('api'), docker('admin'), docker('lc_postgres')];
  check('ikkita loyiha qolsa ikkalasi ham ko\'rsatiladi', candidates(sources).length === 2);
}

// ── `also` — avtomatik topishga qo'shiladi ───────────────────────────────
{
  const nginx = { type: 'file', path: '/var/log/nginx/error.log' };
  check('also o\'qiladi', extras({ also: [nginx] }).length === 1);
  check('also yo\'q bo\'lsa bo\'sh', extras({}).length === 0);
  check('buzuq yozuv tashlanadi', extras({ also: [nginx, null, { path: 'x' }] }).length === 1);
}

// ── watch hamon hamma narsadan ustun (orqaga moslik) ─────────────────────
{
  const config = { watch: [{ type: 'docker', container: 'faqat-shu' }] };
  const detected = [docker('api'), docker('lc_postgres')];
  const s = selectSources({ config, detected, project: '', log: () => {} });
  check('watch avtomatik topishning o\'rnini bosadi', s.length === 1 && s[0].container === 'faqat-shu');
}

// ── Foydalanuvchining serveri: bitta loyiha + baza + nginx ───────────────
{
  const detected = [docker('lc-test-system'), docker('lc_postgres')];
  const c = candidates(detected);
  const yakuniy = [...c, ...extras({ also: [{ type: 'file', path: '/var/log/nginx/error.log' }] })];

  check('tanlovda faqat bitta loyiha ko\'rsatiladi', c.length === 1);
  check('yakuniy ro\'yxat: loyiha + nginx', yakuniy.length === 2);
  check('nginx ro\'yxatda', yakuniy.some((s) => s.path?.includes('nginx')));
  check('baza kuzatilmaydi', !yakuniy.some((s) => s.container === 'lc_postgres'));
}

console.log(`\n${ok} o'tdi, ${fail} yiqildi`);
process.exit(fail ? 1 : 0);
