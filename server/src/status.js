const OFFLINE_MS = 15 * 60_000; // agent signali 15 daqiqa kelmasa — aloqa yo'q deb hisoblaymiz
const ERROR_WINDOW_MS = 60 * 60_000; // "oxirgi 1 soat" oynasi — statistika uchun
// Muammo "hozir davom etyapti" deb hisoblanadigan oyna. /status joriy holatni
// ko'rsatishi kerak: yarim soat oldin bo'lib o'tgan va o'zi tinchigan xato
// (masalan deploy paytidagi qayta ishga tushish) uni qizil qilmasligi kerak.
const ACTIVE_MS = 5 * 60_000;

const MAX_LINE = 72; // /status ichidagi xato matni — xabar formatidagi kenglik bilan bir xil
const MAX_CHATS = 5000;
const MAX_PROJECTS_PER_CHAT = 50;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Uzun matnni so'z chegarasida kesadi — "server: l" kabi yarim so'z qolmasin */
function cut(text, max = MAX_LINE) {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const space = slice.lastIndexOf(' ');
  return `${(space > max * 0.6 ? slice.slice(0, space) : slice).replace(/[\s,:;]+$/, '')}…`;
}

function ago(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 10) return 'hozirgina';
  if (s < 60) return `${s} soniya oldin`;
  if (s < 3600) return `${Math.floor(s / 60)} daqiqa oldin`;
  if (s < 86400) return `${Math.floor(s / 3600)} soat oldin`;
  return `${Math.floor(s / 86400)} kun oldin`;
}

/**
 * Loyihalar holatini xotirada saqlaydi (baza yo'q).
 * Server qayta ishga tushsa holat nolga qaytadi va agentlarning
 * birinchi signalidan keyin o'zi tiklanadi.
 */
export class StatusStore {
  #chats = new Map(); // chatId -> Map(project -> holat)

  #project(chatId, project) {
    if (!this.#chats.has(chatId)) {
      if (this.#chats.size >= MAX_CHATS) this.#chats.delete(this.#chats.keys().next().value);
      this.#chats.set(chatId, new Map());
    }
    const projects = this.#chats.get(chatId);
    if (!projects.has(project)) {
      if (projects.size >= MAX_PROJECTS_PER_CHAT) projects.delete(projects.keys().next().value);
      projects.set(project, { lastSeen: 0, host: '', errors: [], lastError: null });
    }
    return projects.get(project);
  }

  /** Agent tirikligini belgilaydi (heartbeat yoki istalgan xabar) */
  seen(chatId, project, host) {
    const p = this.#project(chatId, project);
    p.lastSeen = Date.now();
    if (host) p.host = host;
  }

  /** Xato qayd etiladi */
  error(chatId, project, event) {
    const p = this.#project(chatId, project);
    const now = Date.now();
    p.errors.push(now);
    p.errors = p.errors.filter((t) => now - t < ERROR_WINDOW_MS);
    p.lastError = {
      at: now,
      level: event.level,
      frame: event.frame,
      source: String(event.source || '').replace(/^(docker|pm2|systemd):/, ''),
      first: (event.summary || String(event.stack || event.message || '').split('\n')[0]).slice(0, 120),
    };
  }

  /** Guruh ma'lumotini butunlay unutadi (/disconnect yoki guruhdan chiqarilganda) */
  forget(chatId) {
    this.#chats.delete(chatId);
  }

  /** /status buyrug'i uchun matn */
  render(chatId) {
    const projects = this.#chats.get(chatId);
    if (!projects?.size) {
      return [
        '⚪️ <b>Hali hech qanday ma’lumot yo‘q.</b>',
        '',
        'Agent ulanganidan keyin holat shu yerda ko‘rinadi.',
        'Ulash uchun: /connect loyiha_nomi',
      ].join('\n');
    }

    const now = Date.now();
    const out = ['📊 <b>Holat</b>', ''];

    for (const [name, p] of projects) {
      const offline = now - p.lastSeen > OFFLINE_MS;
      const hourly = p.errors.length;
      const lastAge = p.lastError ? now - p.lastError.at : Infinity;
      const active = !offline && lastAge <= ACTIVE_MS;

      let icon = '🟢';
      let state = 'tinch, xato yo‘q';

      if (offline) {
        icon = '⚪️';
        state = p.lastSeen ? `aloqa yo‘q (oxirgi signal ${ago(now - p.lastSeen)})` : 'hali signal kelmadi';
      } else if (active) {
        icon = '🔴';
        state = '<b>hozir xato bermoqda</b>';
      }

      out.push(`${icon} <b>${esc(name)}</b> — ${state}`);
      if (p.host) out.push(`    🖥 <code>${esc(p.host)}</code>`);

      // Xato tafsiloti faqat muammo hozir davom etayotganda ko'rsatiladi.
      // Aks holda eski xato matni tinch holatni ham xavotirli qilib ko'rsatardi.
      if (active) {
        const f = p.lastError.frame;
        const at = f?.name ? ` (<code>${esc(f.name)}${f.line ? `:${f.line}` : ''}</code>)` : '';
        const svc = p.lastError.source ? ` · <code>${esc(p.lastError.source)}</code>` : '';
        out.push(`    ↳ oxirgi xato ${ago(lastAge)}${svc}${at}`);
        out.push(`    <code>${esc(cut(p.lastError.first))}</code>`);
      } else if (hourly) {
        // Tinch, lekin yaqinda nimadir bo'lgan — bir qatorlik eslatma yetarli
        out.push(`    <i>oxirgi 1 soatda ${hourly} ta xato, oxirgisi ${ago(lastAge)}</i>`);
      }
      out.push('');
    }

    return out.join('\n').trim();
  }
}
