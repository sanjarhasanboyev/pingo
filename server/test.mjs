import { Connections } from './src/connections.js';
import { Revocations } from './src/revocations.js';

let ok = 0;
let fail = 0;
const check = (name, cond) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '✓' : '✗'} ${name}`);
};

const CHAT = -1001234567890;
const PROJECT = 'Test System | LC';

// ── 1. Foydalanuvchi ko'rgan xato: relay qayta ishga tushgach /connect
//       qayta kalit berib yuborardi ───────────────────────────────────────
{
  const c1 = new Connections();
  c1.set(CHAT, PROJECT); // /connect qilindi
  check('ulangandan keyin /connect himoyasi ishlaydi', !!c1.get(CHAT));

  // Relay qayta ishga tushdi — xotira tozalandi, fayl ham yo'q deb faraz qilamiz
  const c2 = new Connections();
  check('qayta ishga tushgach ro\'yxat bo\'sh (eski xatti-harakat)', !c2.get(CHAT));

  // Agentdan birinchi xabar keladi — ulanish o'zi tiklanishi kerak
  c2.remember(CHAT, PROJECT);
  check('agent signalidan keyin ulanish tiklandi', c2.get(CHAT)?.project === PROJECT);
}

// ── 2. remember() mavjud yozuvni buzmaydi ────────────────────────────────
{
  const c = new Connections();
  c.set(CHAT, PROJECT);
  const oldAt = c.get(CHAT).connectedAt;
  c.remember(CHAT, 'boshqa-nom');
  check('remember() mavjud loyihani almashtirmaydi', c.get(CHAT).project === PROJECT);
  check('remember() ulanish vaqtini saqlaydi', c.get(CHAT).connectedAt === oldAt);
}

// ── 3. Diskka saqlash: qayta ishga tushgach ulanish tiklanadi ────────────
{
  const c1 = new Connections();
  c1.set(CHAT, PROJECT);
  const dumped = JSON.parse(JSON.stringify(c1.dump())); // faylga yozib-o'qishni taqlid

  const c2 = new Connections();
  c2.load(dumped);
  check('fayldan tiklangach ulanish joyida', c2.get(CHAT)?.project === PROJECT);
}

// ── 4. Bekor qilish qayta ishga tushishdan omon qoladi ───────────────────
{
  const eski = { chatId: CHAT, issuedAt: Math.floor((Date.now() - 60_000) / 1000) };

  const r1 = new Revocations();
  r1.revoke(CHAT);
  check('bekor qilingandan keyin eski kalit yaroqsiz', r1.isRevoked(eski));

  const dumped = JSON.parse(JSON.stringify(r1.dump()));

  const r2 = new Revocations(); // qayta ishga tushdi
  check('saqlanmasa eski kalit tirilib qolardi', !r2.isRevoked(eski));

  r2.load(dumped);
  check('fayldan tiklangach eski kalit hali ham yaroqsiz', r2.isRevoked(eski));

  // /disconnect dan keyin berilgan yangi kalit ishlashi kerak
  const yangi = { chatId: CHAT, issuedAt: Math.floor((Date.now() + 5_000) / 1000) };
  check('yangi kalit bekor qilinmagan', !r2.isRevoked(yangi));
}

// ── 5. onChange faqat haqiqiy o'zgarishda chaqiriladi ────────────────────
{
  let n = 0;
  const c = new Connections({ onChange: () => n++ });
  c.set(CHAT, PROJECT);
  const after = n;
  c.clear(999); // yo'q yozuvni o'chirish
  check('bo\'sh clear() saqlashni chaqirmaydi', n === after);
  c.clear(CHAT);
  check('haqiqiy clear() saqlashni chaqiradi', n === after + 1);
}

console.log(`\n${ok} o'tdi, ${fail} yiqildi`);
process.exit(fail ? 1 : 0);
