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

export function createBot({ botToken, secret, status, revocations, agentPackage = 'pingo-agent' }) {
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

    const project =
      ctx.message.text.split(/\s+/).slice(1).join(' ').trim().slice(0, 64) || ctx.chat.title || 'loyiha';

    // Yangi kalit berilgandan keyin eski bekor qilish kuchini yo'qotadi
    revocations.clear(ctx.chat.id);
    const token = createToken({ chatId: ctx.chat.id, project, secret });

    await ctx.replyWithHTML(formatConnected(project));
    // Buyruqni alohida xabarda yuboramiz — nusxa olish qulay bo'lsin.
    await ctx.replyWithHTML(
      `<pre>npx ${agentPackage} start --key ${token}</pre>\n\n` +
        '⚠️ Bu kalitni maxfiy saqlang — u shu guruhga xabar yuborish huquqini beradi.'
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

  bot.on('my_chat_member', async (ctx) => {
    const st = ctx.myChatMember.new_chat_member.status;

    // Guruhdan chiqarildik — ulanishni bekor qilamiz
    if (st === 'left' || st === 'kicked') {
      revocations.revoke(ctx.chat.id);
      status.forget(ctx.chat.id);
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
