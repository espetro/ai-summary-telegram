import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

export async function settingsCommand(ctx: BotContext) {
  if (!ctx.message?.text || !ctx.user) {
    return;
  }

  const text = ctx.message.text.replace(/^\/settings\s*/, '').trim();

  // Parse sub-command
  if (!text) {
    // Show current settings
    await showSettings(ctx);
    return;
  }

  const [subcommand, ...args] = text.split(' ');

  switch (subcommand) {
    case 'schedule':
      await handleScheduleSettings(ctx, args);
      break;
    case 'timezone':
      await handleTimezoneSettings(ctx, args);
      break;
    case 'intent':
      await ctx.reply('⚙️ Intent settings: Not implemented yet.');
      break;
    default:
      await showSettingsHelp(ctx);
  }
}

async function showSettings(ctx: BotContext) {
  if (!ctx.user) {
    return;
  }

  await ctx.reply(
    `⚙️ Current Settings\n\n` +
      `📅 Schedule: ${ctx.user.queueSchedule} at ${ctx.user.queueScheduleTime}\n` +
      `🌍 Timezone: ${ctx.user.timezone}\n` +
      `🏷️ Access Tier: ${ctx.user.accessTier}\n\n` +
      `Commands:\n` +
      `/settings schedule <daily|weekly> <HH:MM> - Set review schedule\n` +
      `/settings timezone <timezone> - Set your timezone\n` +
      `/settings intent - Configure intent settings\n` +
      `/settings - Show current settings`
  );
}

async function handleScheduleSettings(ctx: BotContext, args: string[]) {
  if (!ctx.user) {
    return;
  }

  if (args.length < 2) {
    await ctx.reply(
      'Usage: /settings schedule <daily|weekly> <HH:MM>\n\n' +
        'Example: /settings schedule weekly 09:00'
    );
    return;
  }

  const schedule = args[0]!.toLowerCase();
  const time = args[1]!;
  // Validate schedule
  if (schedule !== 'daily' && schedule !== 'weekly') {
    await ctx.reply('❌ Invalid schedule. Use "daily" or "weekly".');
    return;
  }

  // Validate time format (HH:MM)
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(time)) {
    await ctx.reply('❌ Invalid time format. Use HH:MM (24-hour format).');
    return;
  }

  // Update settings
  await db
    .update(users)
    .set({
      queueSchedule: schedule,
      queueScheduleTime: time,
    })
    .where(eq(users.id, ctx.user.id));

  await ctx.reply(`✅ Schedule updated to ${schedule} at ${time}`);
}

async function handleTimezoneSettings(ctx: BotContext, args: string[]) {
  if (!ctx.user) {
    return;
  }

  if (args.length === 0) {
    await ctx.reply(
      'Usage: /settings timezone <timezone>\n\n' +
        'Example: /settings timezone America/New_York\n\n' +
        'Common timezones:\n' +
        '- America/New_York\n' +
        '- Europe/London\n' +
        '- Asia/Tokyo\n' +
        '- Australia/Sydney'
    );
    return;
  }

  const timezone = args[0];

  // Validate timezone by attempting to format a date with it
  try {
    const testDate = new Date();
    Intl.DateTimeFormat(undefined, { timeZone: timezone }).format(testDate);

    // Update settings
    await db.update(users).set({ timezone }).where(eq(users.id, ctx.user.id));

    await ctx.reply(`✅ Timezone updated to ${timezone}`);
  } catch (error) {
    await ctx.reply('❌ Invalid timezone. Please use a valid IANA timezone identifier.');
  }
}

async function showSettingsHelp(ctx: BotContext) {
  await ctx.reply(
    '⚙️ Settings Commands\n\n' +
      '/settings - Show current settings\n' +
      '/settings schedule <daily|weekly> <HH:MM> - Set review schedule\n' +
      '/settings timezone <timezone> - Set your timezone\n' +
      '/settings intent - Configure intent settings\n\n' +
      'Example: /settings schedule weekly 09:00'
  );
}
