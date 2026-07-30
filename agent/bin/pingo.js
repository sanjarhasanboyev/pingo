#!/usr/bin/env node
import os from 'node:os';
import { loadConfig, saveConfig, DEFAULT_PATH, DEFAULTS } from '../src/config.js';
import { runAgent, autoDetect } from '../src/index.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v ?? (argv[i + 1]?.startsWith('--') ? true : argv[++i] ?? true);
    } else {
      args._.push(a);
    }
  }
  return args;
}

const HELP = `
pingo — serverdagi xatolarni Telegram guruhingizga yetkazadi

  pingo start --key <kalit>   kuzatishni boshlaydi
  pingo init  --key <kalit>   sozlamani saqlaydi (${DEFAULT_PATH})
  pingo test  --key <kalit>   sinov xabarini yuboradi
  pingo doctor                serverda nima kuzatilishi mumkinligini ko'rsatadi

Kalitni olish: botni Telegram guruhingizga qo'shing va /connect deb yozing.

Qo'shimcha:
  --server <url>    boshqa relay manzili
  --config <fayl>   boshqa config fayli
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'help';
  const file = args.config || DEFAULT_PATH;

  if (cmd === 'help' || args.help) {
    console.log(HELP);
    return;
  }

  if (cmd === 'doctor') {
    const found = autoDetect();
    console.log(`host: ${os.hostname()}`);
    console.log(found.length ? 'topilgan manbalar:' : 'manba topilmadi (pm2/docker yo‘q)');
    for (const s of found) console.log(`  - ${s.type}${s.container ? `/${s.container}` : ''}`);
    if (!found.length) {
      console.log('\nLog faylni qo‘lda ko‘rsatishingiz mumkin:');
      console.log(`  ${file} ichida: "watch": [{ "type": "file", "path": "/var/log/app.log", "cwd": "/srv/app" }]`);
    }
    return;
  }

  // Ustuvorlik: buyruq argumenti > muhit o'zgaruvchisi > config fayl
  const config = { ...loadConfig(file) };
  if (process.env.PINGO_KEY) config.key = process.env.PINGO_KEY;
  if (process.env.PINGO_SERVER) config.server = process.env.PINGO_SERVER;
  if (args.key) config.key = String(args.key);
  if (args.server) config.server = String(args.server);

  if (cmd === 'init') {
    if (!config.key) {
      console.error('kalit kerak: pingo init --key <kalit>');
      process.exit(1);
    }
    if (!config.watch?.length) config.watch = autoDetect();
    saveConfig({ ...DEFAULTS, ...config }, file);
    console.log(`saqlandi: ${file}`);
    console.log(
      config.watch.length
        ? `manbalar: ${config.watch.map((s) => s.type + (s.container ? `/${s.container}` : '')).join(', ')}`
        : 'manba topilmadi — config ichida "watch" ni qo‘lda to‘ldiring'
    );
    console.log('\nEndi ishga tushiring:  pingo start');
    return;
  }

  if (cmd === 'test') {
    if (!config.key) {
      console.error('kalit kerak: pingo test --key <kalit>');
      process.exit(1);
    }
    const res = await fetch(`${config.server.replace(/\/$/, '')}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: config.key,
        events: [
          {
            level: 'info',
            source: 'pingo test',
            host: os.hostname(),
            timestamp: Date.now(),
            message: 'Sinov xabari — ulanish ishlayapti ✅',
          },
        ],
      }),
    });
    console.log(res.ok ? 'yuborildi — guruhni tekshiring' : `xato: ${res.status} ${await res.text()}`);
    return;
  }

  if (cmd === 'start') {
    await runAgent(config);
    return;
  }

  console.error(`noma'lum buyruq: ${cmd}`);
  console.log(HELP);
  process.exit(1);
}

// Kutilmagan xato jarayonni o'ldirmasin: konteyner "restart: always" bilan
// ishlayotgan bo'lsa cheksiz qayta ishga tushish sikliga tushib qolardi.
// Kuzatuvchilar mustaqil ishlaydi, shuning uchun bitta xato boshqasini to'xtatmaydi.
process.on('uncaughtException', (err) => {
  console.error(`[pingo] kutilmagan xato: ${err?.message || err}`);
});
process.on('unhandledRejection', (err) => {
  console.error(`[pingo] kutilmagan rad javob: ${err?.message || err}`);
});

main().catch((err) => {
  console.error(`[pingo] ${err.message}`);
  process.exit(1);
});
