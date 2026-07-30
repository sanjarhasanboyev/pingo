import path from 'node:path';

// Stack trace'dan fayl, qator va funksiyani ajratib olish.
// Har til o'z ko'rinishida yozadi, shuning uchun alohida naqshlar.
const FRAMES = [
  // Java/Kotlin:  at com.example.OrderService.create(OrderService.java:42)
  {
    re: /^\s*at\s+([\w.$]+)\.([\w$<>]+)\(([\w.$]+\.\w+):(\d+)\)/,
    map: (m) => ({ func: m[2], file: m[3], line: +m[4], pkg: m[1] }),
  },
  // Python:  File "/srv/app/views.py", line 88, in checkout
  { re: /^\s*File "([^"]+)", line (\d+)(?:, in (\S+))?/, map: (m) => ({ file: m[1], line: +m[2], func: m[3] }) },
  // Node/JS:  at handler (/srv/app/routes.js:22:15)   yoki   at /srv/app/routes.js:22:15
  { re: /^\s*at\s+(?:([\w.$<>[\] ]+)\s+\()?(\/?[\w./\-@]+\.[jtm]sx?):(\d+):\d+\)?/, map: (m) => ({ func: m[1], file: m[2], line: +m[3] }) },
  // Go:  /srv/payment/main.go:112 +0x1d
  { re: /^\s*(\/[\w./\-]+\.go):(\d+)/, map: (m) => ({ file: m[1], line: +m[2] }) },
  // PHP:  #0 /srv/app/Controller.php(22): App\handle()
  { re: /^#\d+\s+([^(]+\.php)\((\d+)\)(?::\s*(\S+))?/, map: (m) => ({ file: m[1], line: +m[2], func: m[3] }) },
  // Ruby:  from /app/models/user.rb:12:in `save'
  { re: /^\s*(?:from\s+)?([\w./\-]+\.rb):(\d+):in [`'"]([^'"`]+)/, map: (m) => ({ file: m[1], line: +m[2], func: m[3] }) },
  // Rust:  at src/main.rs:25:9
  { re: /^\s*at\s+([\w./\-]+\.rs):(\d+)/, map: (m) => ({ file: m[1], line: +m[2] }) },
];

// Kutubxona kodi — bularni emas, loyihaning o'z faylini ko'rsatgan ma'qul
const VENDOR = /node_modules|site-packages|dist-packages|\/vendor\/|\/usr\/lib|internal\/|<anonymous>|\.pex\//;

// Go'da funksiya nomi fayl qatoridan oldin keladi:  main.processBatch()
const GO_FUNC = /^([\w./]+\.[\w.]+)\((?:\.\.\.)?\)$/;

/**
 * Java stack trace'da faqat fayl nomi bo'ladi, to'liq yo'l yo'q.
 * Maven/Gradle konventsiyasi bo'yicha paket nomidan yo'lni tiklaymiz:
 *   com.example.OrderService → src/main/java/com/example/OrderService.java
 */
function conventionPath({ file, pkg }) {
  if (!pkg || !/\.(java|kt)$/.test(file)) return undefined;

  const parts = pkg.split('.');
  const cls = file.replace(/\.(java|kt)$/, '');
  const i = parts.lastIndexOf(cls.split('$')[0]);
  const dir = (i > 0 ? parts.slice(0, i) : parts.slice(0, -1)).join('/');
  if (!dir) return undefined;

  return `src/main/${file.endsWith('.kt') ? 'kotlin' : 'java'}/${dir}/${file}`;
}

/**
 * Stack trace'dan xato aynan qayerda bo'lganini topadi.
 * Kutubxona fayllari o'tkazib yuboriladi — loyihaning o'z kodi ustun.
 */
export function extractFrame(message, cwd) {
  const lines = String(message).split('\n');
  let fallback = null;
  let goFunc = null;

  for (const line of lines) {
    const gm = line.match(GO_FUNC);
    if (gm) {
      goFunc = gm[1].split('.').pop();
      continue;
    }

    for (const { re, map } of FRAMES) {
      const m = line.match(re);
      if (!m) continue;

      const frame = map(m);
      if (!frame.file) break;
      if (frame.file.endsWith('.go') && !frame.func) frame.func = goFunc;

      const isVendor = VENDOR.test(frame.file);
      const result = { ...frame, name: path.basename(frame.file) };

      // cwd ma'lum bo'lsa — repo ichidagi nisbiy yo'lni hisoblaymiz (GitHub havolasi uchun)
      if (cwd && frame.file.startsWith(cwd)) {
        result.path = path.relative(cwd, frame.file);
      } else {
        result.path = conventionPath(frame);
      }

      if (!isVendor) return result; // loyiha kodi — shuni olamiz
      fallback ??= result; // kutubxona — faqat boshqasi topilmasa
      break;
    }
  }

  return fallback;
}

const REQUEST = [
  // Umumiy access log:  POST /api/checkout 500 12ms
  /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/\S*)/,
  // Spring:  Completed 500 INTERNAL_SERVER_ERROR ... "POST /api/checkout"
  /"(GET|POST|PUT|PATCH|DELETE)\s+([^"]+)"/,
];

/**
 * Log qatoridan HTTP so'rovni ajratadi — xatodan oldin qaysi request
 * kelganini ko'rsatish uchun.
 */
export function extractRequest(line) {
  for (const re of REQUEST) {
    const m = line.match(re);
    if (m) return `${m[1]} ${m[2].split('?')[0].slice(0, 80)}`;
  }
  return null;
}
