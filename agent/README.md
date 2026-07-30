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

## Talablar

- Node.js 20+
- Kuzatiladigan manbaga qarab: `pm2`, `docker`, `journalctl` yoki `tail`

Paketning o'zi hech qanday tashqi kutubxonaga bog'liq emas.
