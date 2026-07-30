const STACK_LINES = 6; // qisqa stack — birinchi qarashda yetarli bo'lgani
const STACK_CHARS = 900;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Tashkent';

// Standart holatda ko'rsatilmaydigan maydonlar.
// Yoqish: PINGO_SHOW=repo,branch,commit,host,count
const SHOWN = new Set(
  String(process.env.PINGO_SHOW || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

const LEVEL = {
  error: { icon: '🔴', label: 'ERROR' },
  fatal: { icon: '💀', label: 'FATAL' },
  crash: { icon: '💥', label: 'CRASH' },
  warn: { icon: '🟡', label: 'WARN' },
  info: { icon: 'ℹ️', label: 'INFO' },
  up: { icon: '✅', label: 'UP' },
  down: { icon: '🔻', label: 'DOWN' },
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function when(ts) {
  // Buzuq timestamp kelsa hozirgi vaqtni ishlatamiz — xabar yo'qolib ketmasin
  let d = ts ? new Date(ts) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

/**
 * Eski yoki soddaroq agentlar faqat `message` yuborishi mumkin —
 * u holda sarlavha va stack shu yerda ajratiladi.
 */
function normalize(event) {
  const stack = event.stack ?? event.message ?? '';
  let summary = event.summary;

  if (!summary) {
    const first = String(stack).split('\n').find((l) => l.trim());
    summary = String(first || '').trim().slice(0, 120);
  }
  return { summary, stack };
}

/**
 * Manba nomini qisqartiradi: "docker:xgo-backend" -> "xgo-backend".
 * Turi (docker/pm2/systemd) muhim emas — xizmat nomi muhim.
 */
function shortSource(source) {
  if (!source) return '';
  return String(source).replace(/^(docker|pm2|systemd):/, '');
}

function shortStack(text) {
  const all = String(text ?? '').trim().split('\n');
  let out = all.slice(0, STACK_LINES).join('\n');

  if (out.length > STACK_CHARS) out = `${out.slice(0, STACK_CHARS)}…`;
  if (all.length > STACK_LINES) out += '\n…';
  return out;
}

function githubLink({ repo, commit, branch, frame }) {
  if (!repo || !frame?.path) return null;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;

  const ref = commit || branch;
  if (!ref) return null;

  return `https://github.com/${repo}/blob/${ref}/${frame.path}${frame.line ? `#L${frame.line}` : ''}`;
}

/**
 * Hodisani Telegram xabariga aylantiradi.
 *
 * Tuzilishi (har blok bo'sh qator bilan ajratiladi):
 *   1. daraja        🔴 ERROR
 *   2. loyiha        📦 lcts-backend
 *   3. nima bo'ldi   💬 Division by zero
 *   4. tafsilot      🌐 so'rov / ⚙️ amal · 📄 fayl:qator · 🕐 vaqt
 *   5. stack         <pre>…</pre>
 *   6. havola        🔗 GitHub
 *
 * Yangi blok qo'shish uchun `blocks` ro'yxatiga qator qo'shish kifoya.
 */
export function formatEvent(event, meta = {}) {
  const lvl = LEVEL[String(event.level || 'error').toLowerCase()] || LEVEL.error;
  const { summary, stack } = normalize(event);
  const project = meta.project || event.project || 'loyiha';

  const blocks = [];

  blocks.push(`${lvl.icon} <b>${lvl.label}</b>`);

  // Loyiha nomi + xato qaysi xizmatdan kelgani.
  // Bitta agent bir nechta konteyner/jarayonni kuzatishi mumkin, shuning uchun
  // "qaysi xizmat yiqildi?" degan savolga javob sarlavhada turishi kerak.
  const service = shortSource(event.source);
  blocks.push(`📦 <b>${esc(project)}</b>${service ? ` · <code>${esc(service)}</code>` : ''}`);

  if (summary) blocks.push(`💬 ${esc(summary)}`);

  // Tafsilotlar — bir blok ichida, har biri o'z qatorida
  const details = [];
  if (event.request) details.push(`🌐 <code>${esc(event.request)}</code>`);
  else if (event.operation) details.push(`${esc(event.operation)}`);

  if (event.frame?.name) {
    const at = event.frame.line ? `${event.frame.name}:${event.frame.line}` : event.frame.name;
    details.push(`📄 <code>${esc(at)}</code>`);
  }
  details.push(`🕐 ${esc(when(event.timestamp))}`);

  // Standart holatda yashirilgan qo'shimcha maydonlar
  if (SHOWN.has('repo') && event.repo) details.push(`📦 <code>${esc(event.repo)}</code>`);
  if (SHOWN.has('branch') && event.branch) details.push(`🌿 <code>${esc(event.branch)}</code>`);
  if (SHOWN.has('commit') && event.commit) details.push(`🔖 <code>${esc(String(event.commit).slice(0, 7))}</code>`);
  if (SHOWN.has('host') && event.host) details.push(`🖥 <code>${esc(event.host)}</code>`);
  if (SHOWN.has('count') && event.count > 1) details.push(`🔁 ${event.count} marta`);

  blocks.push(details.join('\n'));

  if (stack?.trim()) blocks.push(`<pre>${esc(shortStack(stack))}</pre>`);

  const link = githubLink(event);
  if (link) blocks.push(`🔗 <a href="${esc(link)}">GitHub'da ochish</a>`);

  return blocks.join('\n\n');
}

export function formatConnected(project, threadId) {
  return [
    `✅ <b>${esc(project)}</b> ${threadId ? 'shu bo‘limga' : 'shu guruhga'} ulandi.`,
    '',
    'Endi serveringizda quyidagi buyruqni ishga tushiring:',
  ].join('\n');
}
