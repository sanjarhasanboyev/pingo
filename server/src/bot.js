import { Telegraf } from 'telegraf';
import { createToken } from './token.js';
import { formatConnected } from './format.js';

const GROUP_TYPES = new Set(['group', 'supergroup']);

/**
 * Buyruqni faqat guruh adminlari bajara olishini ta'minlaydi.
 * Kalit guruhga xabar yuborish huquqini bergani uchun, uni
 * istalgan a'zo emas, faqat admin olishi kerak.
 */
async function isAdmin(ctx) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    return member.status === 'creator' || member.status === 'administrator';
  } catch {
    return false;
  }
}

// Guruhda "/" bosilganda ko'rinadigan ro'yxat
const GROUP_COMMANDS = [
  { command: 'connect', description: 'Loyihani shu guruhga ulash' },
  { command: 'status', description: 'Ulangan loyihalar holati' },
  { command: 'disconnect', description: 'Ulanishni bekor qilish' },
];

// Shaxsiy chatda ko'rinadigan ro'yxat
const PRIVATE_COMMANDS = [
  { command: 'start', description: 'Yo‘riqnoma' },
  { command: 'help', description: 'Buyruqlar ro‘yxati' },
];

/**
 * Buyruqlar menyusini Telegram'da ro'yxatdan o'tkazadi.
 * Bir marta chaqirilsa yetarli, lekin har ishga tushishda yangilash zarar qilmaydi.
 */
export async function registerCommands(bot) {
  await bot.telegram.setMyCommands(GROUP_COMMANDS, { scope: { type: 'all_group_chats' } });
  await bot.telegram.setMyCommands(PRIVATE_COMMANDS, { scope: { type: 'all_private_chats' } });
}

/**
 * Agent ro'yxatdan o'tganda guruhga tanlov tugmalarini yuboradi.
 */
export async function askWhatToWatch(bot, { regId, chatId, threadId, sources, host }) {
  const tugmalar = sources.map((s, i) => [
    { text: s.container || s.type, callback_data: `pick:${regId}:${i}` },
  ]);
  tugmalar.push([{ text: '📋 Hammasi', callback_data: `pick:${regId}:all` }]);

  const matn = [
    `🖥 <b>${esc(host)}</b> serverida ${sources.length} ta loyiha topildi.`,
    '',
    'Qaysi birini kuzatay?',
  ].join('\n');

  await bot.telegram.sendMessage(chatId, matn, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: tugmalar },
    ...(threadId ? { message_thread_id: threadId } : {}),
  });
}

const escHtml = (s) => esc(s);

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createBot({ botToken, secret, status, revocations, registrations, connections, agentPackage = 'pingo-agent' }) {
  const bot = new Telegraf(botToken);

  bot.start(async (ctx) => {
    if (GROUP_TYPES.has(ctx.chat.type)) {
      return ctx.reply('Bu guruhga loyihani ulash uchun: /connect loyiha_nomi');
    }
    return ctx.replyWithHTML(
      [
        '👋 <b>Pingo</b> — serveringizdagi xatolarni Telegram guruhingizga yetkazadi.',
        '',
        '<b>Qanday ishlatiladi:</b>',
        '1. Meni o‘z guruhingizga qo‘shing',
        '2. Guruhda <code>/connect loyiha_nomi</code> deb yozing',
        '3. Men bergan buyruqni serveringizda ishga tushiring',
        '',
        'Tamom — xatolar shu guruhga tusha boshlaydi.',
        'Hech qanday bot yaratish yoki token olish shart emas.',
      ].join('\n')
    );
  });

  bot.help((ctx) =>
    ctx.replyWithHTML(
      [
        '<b>Buyruqlar</b>',
        '<code>/connect loyiha_nomi</code> — guruhga loyiha ulash',
        '<code>/status</code> — ulangan loyihalar holati',
        '<code>/disconnect</code> — ulanishni bekor qilish',
        '<code>/start</code> — yo‘riqnoma',
        '',
        '<code>/connect</code> va <code>/disconnect</code> faqat guruh adminlari uchun.',
      ].join('\n')
    )
  );

  bot.command('connect', async (ctx) => {
    if (!GROUP_TYPES.has(ctx.chat.type)) {
      return ctx.reply('Bu buyruq guruh ichida ishlaydi. Avval meni guruhingizga qo‘shing.');
    }
    if (!(await isAdmin(ctx))) {
      return ctx.reply('Bu buyruqni faqat guruh adminlari bajara oladi.');
    }

    // Nom ixtiyoriy: berilmasa agent ishga tushgach tugmalar orqali tanlanadi
    // Guruhga allaqachon loyiha ulangan bo'lsa, qayta ulashga ruxsat bermaymiz —
    // avval /disconnect qilish kerak. Aks holda eski kalit "yetim" qolib,
    // hech kim bilmagan holda ikkita ulanish yashab qolardi.
    const mavjud = connections.get(ctx.chat.id);
    if (mavjud) {
      return ctx.replyWithHTML(
        [
          `⚠️ Bu guruhga allaqachon <b>${escHtml(mavjud.project)}</b> ulangan.`,
          '',
          'Boshqa loyiha ulash uchun avval: <code>/disconnect</code>',
        ].join('\n')
      );
    }

    const project =
      ctx.message.text.split(/\s+/).slice(1).join(' ').trim().slice(0, 64) || ctx.chat.title || 'loyiha';

    // Forum guruhida buyruq qaysi bo'limda yozilgan bo'lsa, xabarlar
    // ham o'sha bo'limga tushadi. Oddiy guruhda bu maydon bo'lmaydi.
    const threadId = ctx.message?.is_topic_message ? ctx.message.message_thread_id : undefined;

    const token = createToken({ chatId: ctx.chat.id, project, threadId, secret });
    connections.set(ctx.chat.id, project);

    await ctx.replyWithHTML(formatConnected(project, threadId));

    // Kalit alohida xabarda va alohida qatorda — uzun matn xabarni
    // yon tomonga cho'zib yubormasligi uchun.
    await ctx.replyWithHTML(
      [
        '🔑 <b>Kalit</b> (bosib nusxa oling):',
        `<code>${token}</code>`,
        '',
        '<b>Serverda ishga tushiring:</b>',
        `<code>npx ${agentPackage} start --key KALIT</code>`,
        '',
        'yoki Docker bilan:',
        `<code>-e PINGO_KEY=KALIT</code>`,
        '',
        '⚠️ Kalitni maxfiy saqlang — u shu guruhga xabar yuborish huquqini beradi.',
      ].join('\n')
    );
  });

  bot.command('disconnect', async (ctx) => {
    if (!GROUP_TYPES.has(ctx.chat.type)) {
      return ctx.reply('Bu buyruq guruh ichida ishlaydi.');
    }
    if (!(await isAdmin(ctx))) {
      return ctx.reply('Bu buyruqni faqat guruh adminlari bajara oladi.');
    }

    revocations.revoke(ctx.chat.id);
    status.forget(ctx.chat.id);
    connections.clear(ctx.chat.id);

    await ctx.replyWithHTML(
      [
        '🔌 <b>Ulanish bekor qilindi.</b>',
        '',
        'Mavjud kalitlar ishlamaydi — agent keyingi urinishda o‘zi to‘xtaydi.',
        'Qayta ulash uchun: <code>/connect loyiha_nomi</code>',
        '',
        '⚠️ Butunlay va doimiy uzish uchun meni guruhdan chiqaring — ' +
          'u holda men bu guruhga umuman xabar yubora olmayman.',
      ].join('\n')
    );
  });

  bot.command('status', async (ctx) => {
    await ctx.replyWithHTML(status.render(ctx.chat.id), {
      link_preview_options: { is_disabled: true },
    });
  });

  // Tanlov tugmasi bosilganda
  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data || '';
    if (!data.startsWith('pick:')) return ctx.answerCbQuery();

    const [, regId, index] = data.split(':');
    const reg = registrations.get(regId);
    if (!reg) {
      await ctx.answerCbQuery('Bu so‘rov eskirgan — agentni qayta ishga tushiring', { show_alert: true });
      return;
    }
    if (!(await isAdmin(ctx))) {
      return ctx.answerCbQuery('Faqat guruh adminlari tanlay oladi', { show_alert: true });
    }

    const choice = index === 'all' ? { all: true } : reg.sources[Number(index)];
    if (!choice) return ctx.answerCbQuery('Noto‘g‘ri tanlov');

    registrations.choose(regId, choice);
    const nom = choice.all ? 'hammasi' : choice.container || choice.type;

    await ctx.answerCbQuery(`Tanlandi: ${nom}`);
    await ctx.editMessageText(`✅ Kuzatilyapti: <b>${esc(nom)}</b>\n🖥 <code>${esc(reg.host)}</code>`, {
      parse_mode: 'HTML',
    });
  });

  bot.on('my_chat_member', async (ctx) => {
    const st = ctx.myChatMember.new_chat_member.status;

    // Guruhdan chiqarildik — ulanishni bekor qilamiz
    if (st === 'left' || st === 'kicked') {
      revocations.revoke(ctx.chat.id);
      status.forget(ctx.chat.id);
      connections.clear(ctx.chat.id);
      return;
    }

    if (GROUP_TYPES.has(ctx.chat.type) && (st === 'member' || st === 'administrator')) {
      await ctx.reply('Salom! Loyihani ulash uchun: /connect loyiha_nomi');
    }
  });

  bot.catch((err) => {
    console.error('[bot] xato:', err?.message || err);
  });

  return bot;
}
