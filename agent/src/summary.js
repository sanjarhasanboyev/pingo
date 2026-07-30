// Xato blokidan qisqa, o'qishli sarlavha ajratish.
// Maqsad: dasturchi 2 soniyada "nima bo'ldi?" degan savolga javob olsin.

// Logger prefiksi: "2026-07-30 14:23:11 ERROR c.e.OrderService - matn"
// yoki PostgreSQL uslubi: "2026-07-30 12:39:48.242 UTC [7290] FATAL:  matn"
// Logger nomi ajratgichi atrofida bo'sh joy talab qilinadi ("c.e.Service - matn"),
// aks holda "HikariPool-1 - matn" dagi ichki tire ham ajratgich deb qabul qilinardi.
const LOG_PREFIX =
  /^[\d\-/:.T ]*\s*(?:[A-Z]{2,5}\s+)?(?:\[[^\]]*\]\s*)?(?:ERROR|FATAL|CRITICAL|SEVERE|WARN)\s*[-:|]?\s*(?:[\w.$]+\s+[-:]\s+)?/i;

// Exception qatori: "java.lang.NullPointerException: matn" yoki "ZeroDivisionError: matn"
const EXCEPTION = /^([\w.$]*(?:Exception|Error))\s*:\s*(.*)$/;

// Til-maxsus boshlanishlar
const PREFIXES = [
  /^panic:\s*/i, // Go
  /^thread '.*' panicked at\s*/i, // Rust
  /^PHP (?:Fatal|Parse|Recoverable) error:\s*/i,
  /^(?:Unhandled|Uncaught)\s+(?:exception|rejection|error)[:\s]*/i,
];

const MAX = 120;

function clean(text, stripLogPrefix = true) {
  let s = String(text || '').trim();
  for (const re of PREFIXES) s = s.replace(re, '');
  // Exception matni allaqachon ajratilgan bo'lsa, prefiks olib tashlash kerak emas —
  // aks holda "Error creating bean" dagi "Error" so'zi ham kesilib ketadi
  if (stripLogPrefix) s = s.replace(LOG_PREFIX, '').trim();
  s = s.replace(/\s+/g, ' ');
  if (!s) return '';
  s = s[0].toUpperCase() + s.slice(1);
  return s.length > MAX ? `${s.slice(0, MAX)}…` : s;
}

/**
 * Blokdan bitta jumlalik sarlavha chiqaradi.
 * Avval exception qatori qidiriladi (eng aniq manba),
 * topilmasa birinchi qator tozalanadi.
 */
export function extractSummary(message) {
  const lines = String(message || '').split('\n');

  for (const raw of lines) {
    // "Caused by:" — texnik prefiks, sarlavhaga kirmasligi kerak
    const line = raw.replace(LOG_PREFIX, '').replace(/^Caused by:\s*/i, '').trim();
    const m = line.match(EXCEPTION);
    if (!m) continue;

    const [, cls, text] = m;
    // Matn bo'lsa shuni, bo'lmasa sinf nomining o'zini ko'rsatamiz
    return clean(text, false) || clean(cls.split('.').pop(), false);
  }

  for (const line of lines) {
    const s = clean(line);
    if (s) return s;
  }
  return '';
}

// Xato HTTP so'rov tufayli bo'lmasa — qanday amal bajarilayotganini aniqlaymiz
const OPERATIONS = [
  { re: /\b(?:Started|Starting)\s+[\w.$]*Application\b|ApplicationContext|Bootstrapping/i, label: () => '⚙️ Startup' },
  { re: /\b(?:Quartz|Scheduled|Scheduler|cron)\b.*?\b([A-Z][\w.$-]*(?:Job|Task|Runner))\b/, m: (m) => `⚙️ Scheduler: ${m[1]}` },
  { re: /\bKafka\b.*?\btopic[=\s:]+([\w.-]+)/i, m: (m) => `📨 Kafka: ${m[1]}` },
  { re: /\b(?:RabbitMQ|AMQP)\b.*?\bqueue[=\s:]+([\w.-]+)/i, m: (m) => `📨 Queue: ${m[1]}` },
  { re: /\b(?:migration|migrate|Flyway|Liquibase)\b/i, label: () => '⚙️ Migration' },
  { re: /\bshutdown|SIGTERM|graceful stop\b/i, label: () => '⚙️ Shutdown' },
];

/**
 * Log qatoridan amal turini aniqlaydi (HTTP so'rov bo'lmagan hollar uchun).
 */
export function extractOperation(line) {
  for (const op of OPERATIONS) {
    const m = String(line).match(op.re);
    if (m) return op.label ? op.label() : op.m(m);
  }
  return null;
}
