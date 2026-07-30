# pingo-agent

Serveringizdagi loyiha xatolarini Telegram guruhingizga yetkazadi. Dasturlash
tilidan qat'i nazar ishlaydi — loglarni tashqaridan o'qiydi, loyiha kodiga tegmaydi.

Hech qanday bot yaratish yoki bot token olish shart emas.

## Ishlatish

1. Telegram botni guruhingizga qo'shing
2. Guruhda `/connect loyiha_nomi` deb yozing — kalit olasiz
3. Serveringizda:

```bash
npx pingo-agent start --key pg_xxxxx
```

Doimiy ishlashi uchun:

```bash
npm install -g pingo-agent
pingo init --key pg_xxxxx
pm2 start pingo -- start
```

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

### Qaysi konteyner kuzatiladi

Agent ishga tushganda serverdagi manbalarni topadi va **guruhda tanlov
tugmalarini** ko'rsatadi:

```
🖥 vmi3351203 serverida 3 ta manba topildi.
Qaysi birini kuzatay?
  [lc_postgres]  [lc-test-system]  [xgo-backend]  [📋 Hammasi]
```

Tugmani bosasiz — agent faqat o'shani kuzata boshlaydi. Nom yozib
o'tirish shart emas.

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
