# pingo-agent

Serveringizdagi loyiha xatolarini Telegram guruhingizga yetkazadi. Dasturlash
tilidan qat'i nazar ishlaydi — loglarni tashqaridan o'qiydi, loyiha kodiga tegmaydi.

Hech qanday bot yaratish yoki bot token olish shart emas.

## Ishlatish

Kerak bo'ladi: **Node.js 20+**. Agent host'da ishlaydi — konteyner ichida emas,
shuning uchun Docker konteynerlarini ham, systemd xizmatlarini ham, oddiy log
fayllarni ham bir joydan ko'ra oladi.

1. Telegram botni guruhingizga qo'shing
2. Guruhda `/connect loyiha_nomi` deb yozing — kalit olasiz
3. Serveringizda:

```bash
npx pingo-agent start --key pg_xxxxx
```

Agent serverdagi loyihalarni o'zi topadi va qaysi birini kuzatishni guruhda
so'raydi. Tekshirish uchun: `pingo doctor`.

Doimiy ishlashi uchun (server o'chib yonsa ham o'zi tursin):

```bash
npm install -g pingo-agent
pingo init --key pg_xxxxx
pm2 start pingo -- start && pm2 save
```

systemd bilan yuritmoqchi bo'lsangiz, `pingo init` dan keyin
`ExecStart=/usr/bin/pingo start` yozilgan oddiy unit fayl yetarli.

### Docker ichida ishlatish

Tayyor image chop etilmagan. Konteynerda ishlatish kerak bo'lsa, repo'dagi
`agent/Dockerfile` dan o'zingiz yig'asiz. Bunda esda tuting: konteyner faqat
o'ziga ko'rsatilgan narsani ko'radi, shuning uchun Docker konteynerlarini
kuzatish uchun `-v /var/run/docker.sock:/var/run/docker.sock`, log fayllar
uchun esa o'sha papkani alohida ulash kerak bo'ladi. Host'da to'g'ridan-to'g'ri
ishlatish soddaroq.

## Buyruqlar

```
pingo start --key <kalit>   kuzatishni boshlaydi
pingo init  --key <kalit>   sozlamani ~/.pingo/config.json ga saqlaydi
pingo test  --key <kalit>   sinov xabarini yuboradi
pingo doctor                nima kuzatilishi mumkinligini ko'rsatadi
```

## Sozlash

Config bo'sh bo'lsa agent PM2 va Docker'ni o'zi topadi. Qo'lda ko'rsatish:

```json
{
  "key": "pg_xxxxx",
  "server": "https://pingo-7e6u.onrender.com",
  "watch": [
    { "type": "pm2" },
    { "type": "docker", "container": "api" },
    { "type": "systemd", "unit": "api.service", "cwd": "/srv/api" },
    { "type": "file", "path": "/var/log/app/*.log", "cwd": "/srv/app" }
  ]
}
```

`cwd` — loyiha papkasi. Ko'rsatilsa, xabarga repo nomi, branch va commit qo'shiladi.

`watch` avtomatik topishning **o'rnini bosadi** — to'ldirilsa konteynerlar
qidirilmaydi va tanlov tugmalari ham ko'rsatilmaydi.

Faqat qo'shimcha manba kerak bo'lsa (masalan nginx log fayli — u avtomatik
topilmaydi), `watch` emas, **`also`** ishlating. U avtomatik topilganlarga
qo'shiladi, ya'ni konteynerlar avvalgidek o'zi topiladi:

```json
{
  "also": [
    { "type": "file", "path": "/var/log/nginx/error.log" }
  ]
}
```

### Qaysi konteyner kuzatiladi

Agent ishga tushganda serverdagi loyihalarni o'zi topadi. Baza, kesh, navbat
kabi yordamchi konteynerlar (postgres, redis, rabbitmq va h.k.) ro'yxatga
kirmaydi — ular odatda kuzatilmaydi va tanlovni chalkashtiradi.

Topilganidan keyin guruhda tanlov tugmalari chiqadi — bitta loyiha bo'lganda
ham, shunda nima kuzatilayotgani doim aniq bo'ladi:

```
🖥 vmi3351203 serverida 2 ta loyiha topildi.
Qaysi birini kuzatay?
  [lc-test-system]  [xgo-backend]  [📋 Hammasi]
```

Tugmani bosasiz — agent faqat o'shani kuzata boshlaydi. Nom yozib
o'tirish shart emas.

Yordamchi konteynerni ataylab kuzatmoqchi bo'lsangiz, uni `watch` yoki `also`
da aniq ko'rsating.

Tanlov faqat guruh adminlariga ko'rsatiladi. 10 daqiqa ichida hech kim
tanlamasa yoki relay bilan aloqa bo'lmasa, barcha manbalar kuzatiladi —
xabar yo'qolgandan ko'ra ortiqcha kelgani yaxshi.

Tanlovni o'tkazib yuborish uchun (masalan avtomatik deploy'da):

```bash
docker run ... -e PINGO_WATCH=xgo-backend ... pingo-agent
```

Bir nechta loyihani alohida guruhlarga ulash uchun har biriga alohida kalit
oling va alohida agent ishga tushiring (`--name pingo-xgo`, `--name pingo-lc`).

Ba'zi konteynerlarni kuzatmaslik uchun:

```bash
docker run ... -e PINGO_IGNORE=xgo-backend,boshqasi ... pingo-agent
```

yoki configda: `"ignore": ["xgo-backend"]`, yoki `pingo start --ignore xgo-backend`

### Server nomi

Docker'da ishlaganda `docker logs`/`/status` da chiqadigan host nomi
konteyner ID'siga o'xshab qoladi (masalan `c92285940cb6`). Haqiqiy nom
ko'rinishi uchun:

```bash
docker run ... -e PINGO_HOST=vmi3351203 ... pingo-agent
```

## Talablar

- Node.js 20+
- Kuzatiladigan manbaga qarab: `pm2`, `docker`, `journalctl` yoki `tail`

Paketning o'zi hech qanday tashqi kutubxonaga bog'liq emas.
