/**
 * Konteyner "loyiha"mi yoki infratuzilmami?
 *
 * Guruhda tanlov so'ralganda faqat loyihalar ko'rsatiladi — baza, kesh,
 * navbat kabi yordamchi servislarni odam odatda tanlamaydi va ular
 * ro'yxatni chalkashtiradi.
 *
 * Nomi bo'yicha taxmin qilinadi, shuning uchun 100% aniq emas: masalan
 * "redis-manager" nomli haqiqiy loyiha ham infratuzilma deb belgilanadi.
 * Shuning uchun bu faqat ro'yxatni qisqartirish uchun ishlatiladi —
 * hech qachon manbani butunlay chetlab o'tmaydi. Barcha infratuzilma
 * chiqib qolsa, ro'yxat baribir to'liq ko'rsatiladi, va configdagi
 * `watch` yoki `also` orqali istalganini aniq ko'rsatish mumkin.
 */
const INFRA = new Set([
  'postgres', 'postgresql', 'pgbouncer', 'timescaledb',
  'mysql', 'mariadb', 'mongo', 'mongodb',
  'redis', 'valkey', 'memcached', 'keydb',
  'rabbitmq', 'kafka', 'zookeeper', 'nats',
  'elasticsearch', 'opensearch', 'clickhouse',
  'minio', 'adminer', 'pgadmin',
  'grafana', 'prometheus', 'loki', 'jaeger',
  'traefik', 'certbot', 'watchtower', 'portainer',
]);

export function isInfra(name) {
  const tokens = String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some((t) => INFRA.has(t));
}
