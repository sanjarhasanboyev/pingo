const OFFLINE_MS = 15 * 60_000; // agent signali 15 daqiqa kelmasa — aloqa yo'q deb hisoblaymiz
const ERROR_WINDOW_MS = 60 * 60_000; // "oxirgi 1 soat" oynasi
const MAX_CHATS = 5000;
const MAX_PROJECTS_PER_CHAT = 50;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ago(ms) {
  const s = Math.floor(ms / 1000);
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
      const recent = p.errors.length;

      let icon = '🟢';
      let state = 'ishlayapti, xato yo‘q';

      if (offline) {
        icon = '⚪️';
        state = p.lastSeen ? `aloqa yo‘q (oxirgi signal ${ago(now - p.lastSeen)})` : 'hali signal kelmadi';
      } else if (recent) {
        icon = '🔴';
        state = `oxirgi 1 soatda <b>${recent} ta xato</b>`;
      }

      out.push(`${icon} <b>${esc(name)}</b> — ${state}`);
      if (p.host) out.push(`    🖥 <code>${esc(p.host)}</code>`);

      if (p.lastError) {
        const f = p.lastError.frame;
        const at = f?.name ? ` (<code>${esc(f.name)}${f.line ? `:${f.line}` : ''}</code>)` : '';
        out.push(`    ↳ oxirgi xato ${ago(now - p.lastError.at)}${at}`);
        out.push(`    <code>${esc(p.lastError.first)}</code>`);
      }
      out.push('');
    }

    return out.join('\n').trim();
  }
}
