# Pingo

Serveringizdagi loyiha xatolarini Telegram guruhingizga yetkazadi. Dasturlash tili
ahamiyatsiz — agent loglarni tashqaridan o'qiydi, loyiha kodiga tegmaydi.

Foydalanuvchi bot yaratmaydi va token olmaydi: bitta umumiy bot guruhga qo'shiladi,
`/connect` bilan kalit olinadi, serverda bitta buyruq ishga tushiriladi.

## Foydalanuvchi uchun

Serverda **Node.js 20+** bo'lishi kerak, boshqa hech narsa shart emas.

1. Telegram'da botni guruhingizga qo'shing
2. Guruhda: `/connect loyiha_nomi` (faqat guruh adminlari)
3. Bot bergan buyruqni serveringizda ishga tushiring:

```bash
npx pingo-agent start --key pg_xxxxx
```

Agent serverdagi loyihalarni o'zi topadi va qaysi birini kuzatishni guruhda
so'raydi — konteyner nomini yozib o'tirish shart emas.

Doimiy ishlashi uchun:

```bash
npm install -g pingo-agent
pingo init --key pg_xxxxx
pm2 start pingo -- start && pm2 save
```

Xatolar shu guruhga tusha boshlaydi.

Agent host'da ishlaydi, konteyner ichida emas — shuning uchun Docker
konteynerlari, systemd xizmatlari va log fayllarni bir joydan ko'ra oladi.
Konteynerda ishlatish kerak bo'lsa: [agent/README.md](agent/README.md).

### Bot buyruqlari

| Buyruq | Vazifa |
|---|---|
| `/connect nomi` | guruhga loyiha ulaydi, kalit beradi (admin) |
| `/status` | ulangan loyihalar holati (🟢 / 🔴 / ⚪️) |
| `/disconnect` | ulanishni bekor qiladi, agent o'zi to'xtaydi (admin) |

`/connect` faqat guruhga hech narsa ulanmagan bo'lsagina ishlaydi — allaqachon
loyiha ulangan bo'lsa, avval `/disconnect` qilish talab qilinadi. Bu bitta
guruhga ikkita "yetim" kalit yaratilib qolishining oldini oladi.

Doimiy uzish uchun botni guruhdan chiqarish kifoya — u holda ulanish
avtomatik bekor bo'ladi.

### Docker orqali (Node o'rnatmasdan)

```bash
docker run -d --name pingo --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e PINGO_KEY=pg_xxxxx \
  -e PINGO_SERVER=https://sizning-relay.onrender.com \
  pingo-agent
```

`docker.sock` ni ulash konteynerga host ustidan keng huquq beradi — monitoring
vositalari uchun odatiy, lekin bilib turish kerak.

## Nima kuzatiladi

Agent quyidagilarni avtomatik topadi va kuzatadi:

| Manba | Buyruq | Izoh |
|---|---|---|
| PM2 | `pm2 logs` + `pm2 jlist` | barcha jarayonlar, crash/restart ham |
| Docker | `docker logs -f` | ishlab turgan konteynerlar |
| systemd | `journalctl -f -u` | configda ko'rsatiladi |
| Log fayl | `tail -F` | configda ko'rsatiladi |

Xatolar Java, Python, Go, Node, PHP, Rust, Ruby, .NET va umumiy `ERROR`/`FATAL`
darajalari bo'yicha aniqlanadi. Ko'p qatorli stack trace bitta xabar sifatida yig'iladi.

`pingo doctor` — serverda nima kuzatilishi mumkinligini ko'rsatadi.

## Tuzilishi

```
server/   relay — Telegram bot + /report API (Render'da, bazasiz)
agent/    npm paketi — foydalanuvchi serverida ishlaydi (bog'liqliksiz)
```

Baza yo'q: `chat_id` va loyiha nomi kalitning ichida HMAC bilan imzolangan holda
yuradi. Server faqat `SECRET_KEY` ni biladi — qayta deploy bo'lsa ham hech narsa
yo'qolmaydi.

## Serverni ishga tushirish (loyiha egasi uchun)

```bash
cd server
cp .env.example .env    # BOT_TOKEN, SECRET_KEY, PUBLIC_URL
npm install
npm start
```

- `SECRET_KEY`: `openssl rand -hex 32` — **bir marta yaratiladi va hech qachon
  o'zgartirilmaydi**, aks holda tarqatilgan barcha kalitlar yaroqsiz bo'ladi
- `PUBLIC_URL` berilsa webhook, berilmasa long polling (lokal ishlab chiqish uchun)
- Render free tier 15 daqiqa harakatsizlikdan keyin uxlaydi — UptimeRobot bilan
  `/health` ga har 13 daqiqada ping qo'ying

## Himoya choralari

- **Deduplikatsiya**: bir xil xato 60 soniya ichida bitta xabar bo'ladi, oxirida
  "yana N marta takrorlandi" deb yig'ib beriladi
- **Rate limit**: bitta guruhga daqiqasiga 15 xabar (Telegram limiti ~20)
- **Navbat**: server javob bermasa agent xabarlarni saqlaydi va qayta urinadi
  (eksponensial kutish bilan), navbat 200 tadan oshmaydi
- **Izolyatsiya**: agent kuzatayotgan ilovaga ta'sir qilmaydi, o'z loglarini
  filtrlaydi (cheksiz sikl bo'lmaydi)
