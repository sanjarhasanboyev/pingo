import { extractFrame, extractRequest } from './frame.js';
import { extractSummary, extractOperation } from './summary.js';

// Xatolarni aniqlash — dasturlash tiliga bog'liq emas, chunki
// deyarli barcha tillar xatoni stdout/stderr ga shu ko'rinishlarda chiqaradi.

// Log darajasi har doim xabar matnidan OLDIN turadi. Xabarning o'zida esa
// daraja nomi uchrashi mumkin — masalan Spring'ning "increase the logging
// level of '...' to ERROR" maslahati WARN qatorini xatoga aylantirib
// yuborardi. Shuning uchun qatordagi eng birinchi daraja tokeni hal qiladi.
const LEVEL_TOKEN =
  /(^|[\s[|(])(ERROR|FATAL|CRITICAL|SEVERE|EMERG|ALERT|WARN(?:ING)?|INFO|DEBUG|TRACE|NOTICE|VERBOSE)([\s\]:|)]|$)/;

// nginx, Apache va syslog uslubidagi ilovalar darajani kichik harfda, qavs
// ichida yozadi: "2026/07/31 07:21:00 [error] connect() failed". Kichik harfni
// hamma joyda tan olsak, oddiy matndagi "error" so'zi yolg'on signal berardi —
// shuning uchun faqat qavs ichidagisini qabul qilamiz.
const BRACKET_LEVEL = /\[(error|crit|alert|emerg|fatal|warn|notice|info|debug|trace)\]/i;

const ERROR_LEVELS = new Set(['ERROR', 'FATAL', 'CRITICAL', 'SEVERE', 'EMERG', 'ALERT']);

// nginx "crit" deb qisqartiradi — umumiy nomga keltiramiz
const LEVEL_ALIAS = { CRIT: 'CRITICAL', WARNING: 'WARN' };

const ERROR_START = [
  /\b\w*(Exception|Error)\s*:/, // Error:, NullPointerException:, ValueError:
  /^Traceback \(most recent call last\)/, // Python
  /^panic:/, // Go
  /^\s*goroutine \d+ \[/, // Go
  /^PHP (Fatal|Parse|Recoverable) error/, // PHP
  /^(Unhandled|Uncaught) (exception|rejection|error)/i, // Node, .NET
  /^thread '.*' panicked at/, // Rust
  /^\s*\*\* \(\w+Error\)/, // Elixir
  /segmentation fault|core dumped/i, // C/C++
];

// Yangi, xato bo'lmagan log qatori — ochiq blokni yakunlaydi
const NEW_LOG_LINE = [
  /^\d{4}-\d{2}-\d{2}[T ]/, // 2026-07-30 12:00:01
  /^\d{4}\/\d{2}\/\d{2} /, // 2026/07/30 12:00:01 — nginx
  /^\d{2}:\d{2}:\d{2}/, // 12:00:01
  /^\[\d/, // [2026-...] yoki [12:00...]
  /(^|[\s[|])(WARN(?:ING)?|INFO|DEBUG|TRACE|NOTICE|VERBOSE)([\s\]:|]|$)/,
  /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//, // HTTP access log
];

// Agentning o'z loglari qayta ushlanib, cheksiz siklga tushmasligi uchun
const SELF = /\[pingo\]/;

const MAX_LINES = 40;
const MAX_CHARS = 4000;
const FLUSH_MS = 400; // stack trace to'liq kelib bo'lishi uchun kutish

function firstLevel(line) {
  const upper = LEVEL_TOKEN.exec(line);
  const bracket = BRACKET_LEVEL.exec(line);

  // Ikkalasi ham topilsa — qatorda oldinroq turgani haqiqiy daraja
  let name = null;
  if (upper && bracket) name = upper.index <= bracket.index ? upper[2] : bracket[1];
  else if (upper) name = upper[2];
  else if (bracket) name = bracket[1];
  if (!name) return null;

  const level = name.toUpperCase();
  return LEVEL_ALIAS[level] || level;
}

function isErrorStart(line) {
  if (SELF.test(line)) return false;

  // Qatorda daraja ko'rsatilgan bo'lsa — o'shanga ishonamiz. Ilova o'z
  // xabarini WARN deb belgilagan bo'lsa, uni xato deb hisoblamaymiz.
  const level = firstLevel(line);
  if (level) return ERROR_LEVELS.has(level);

  // Darajasiz qatorlar (stack trace boshi, panic, traceback) — shakliga qarab
  return ERROR_START.some((re) => re.test(line));
}

function isNewLogLine(line) {
  return NEW_LOG_LINE.some((re) => re.test(line));
}

/**
 * Blok ichidagi bir xil qatorlarni birlashtiradi.
 * Masalan bitta xato ketma-ket 5 marta yozilgan bo'lsa, 5 qator emas,
 * "… (×5)" ko'rinishida bitta qator bo'ladi.
 */
function collapseRepeats(lines) {
  const out = [];
  let prevKey = null;
  let count = 0;

  const push = (line) => {
    if (count > 1) out[out.length - 1] += `   … (×${count})`;
    if (line !== undefined) out.push(line);
  };

  for (const line of lines) {
    const key = line.replace(/\d+/g, '#'); // raqamlar (port, id, vaqt) e'tiborga olinmaydi
    if (key === prevKey) {
      count += 1;
      continue;
    }
    push(line);
    prevKey = key;
    count = 1;
  }
  push();

  return out;
}

function levelOf(line) {
  const level = firstLevel(line);
  if (level === 'FATAL' || level === 'EMERG') return 'fatal';
  if (/panicked|^panic:|core dumped/im.test(line)) return 'fatal';
  return 'error';
}

/**
 * Loglar oqimidan xato bloklarini ajratib oladi.
 *
 * Blok ochilgach, unga tegishli qatorlar (stack trace, "Caused by",
 * exception nomi) yig'ib boriladi. Blok ikki holatda yakunlanadi:
 * yangi oddiy log qatori kelganda yoki 400ms jimlikdan keyin.
 *
 * Bu yondashuv stack trace'ni bir nechta xabarga bo'lib yubormaslik uchun —
 * ortiqcha qator qo'shilgani, xatoni bo'lib tashlagandan ko'ra yaxshiroq.
 */
export class LogParser {
  #lines = [];
  #level = 'error';
  #timer = null;
  #context = {}; // xatodan oldingi kontekst: { request } yoki { operation }

  constructor({ source, cwd, onEvent }) {
    this.source = source;
    this.cwd = cwd;
    this.onEvent = onEvent;
  }

  push(line) {
    if (!line || !line.trim() || SELF.test(line)) return;

    const errorStart = isErrorStart(line);

    // Xatodan oldingi kontekstni eslab qolamiz: HTTP so'rov yoki bajarilayotgan amal.
    // Qaysi biri oxirgi ko'rilgan bo'lsa, o'shani ko'rsatamiz.
    if (!errorStart) {
      const req = extractRequest(line);
      if (req) this.#context = { request: req };
      else {
        const op = extractOperation(line);
        if (op) this.#context = { operation: op };
      }
    }

    if (this.#lines.length) {
      // Oddiy log qatori keldi (va o'zi xato emas) — blokni yakunlaymiz
      if (!errorStart && isNewLogLine(line)) {
        this.flush();
        return;
      }
      if (this.#lines.length < MAX_LINES) {
        this.#lines.push(line);
        if (errorStart && this.#level !== 'fatal') this.#level = levelOf(line);
        this.#resetTimer();
        return;
      }
      // Blok to'ldi — yakunlab, kerak bo'lsa yangisini boshlaymiz
      this.flush();
    }

    if (errorStart) {
      this.#lines = [line];
      this.#level = levelOf(line);
      this.#resetTimer();
    }
  }

  #resetTimer() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), FLUSH_MS);
    this.#timer.unref?.();
  }

  flush() {
    clearTimeout(this.#timer);
    this.#timer = null;
    if (!this.#lines.length) return;

    const message = collapseRepeats(this.#lines).join('\n').slice(0, MAX_CHARS);
    const level = this.#level;
    this.#lines = [];

    // Strukturalangan holda yuboramiz — server formatlashda hech narsa
    // ajratib olishi shart bo'lmaydi (Sentry/Datadog yondashuvi).
    this.onEvent({
      level,
      summary: extractSummary(message),
      stack: message,
      source: this.source,
      frame: extractFrame(message, this.cwd),
      ...this.#context,
      timestamp: Date.now(),
    });
  }
}
