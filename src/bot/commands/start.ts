import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import crypto from 'crypto';

export async function startCommand(ctx: BotContext) {
  if (!ctx.from) {
    return;
  }

  const telegramId = ctx.from.id.toString();
  const username = ctx.from.username || `user_${telegramId}`;

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: and(eq(users.telegramId, telegramId), isNull(users.deletedAt)),
  });

  if (existingUser) {
    // User already registered, send welcome back message
    await ctx.reply(
      `Welcome back, ${username}! 🎉\n\n` +
        `Your account is already set up.\n\n` +
        `Send me any URL or screenshot to start building your queue.\n\n` +
        `Commands:\n` +
        `/review - Start a review session\n` +
        `/queue - View your pending items\n` +
        `/ask - Search your queue with AI\n` +
        `/settings - Configure preferences\n` +
        `/export - Export your data\n` +
        `/help - Show all commands`
    );
    return;
  }

  // Generate API token (32 random bytes, hex encoded)
  const apiToken = crypto.randomBytes(32).toString('hex');

  // Generate salt for encryption key (16 random bytes, hex encoded)
  const encKeySalt = crypto.randomBytes(16).toString('hex');

  // Hash the API token for storage
  const apiTokenHash = crypto.createHash('sha256').update(apiToken).digest('hex');

  // Create new user
  const [user] = await db
    .insert(users)
    .values({
      telegramId,
      apiTokenHash,
      encKeySalt,
      queueSchedule: 'weekly',
      queueScheduleTime: '09:00',
      timezone: 'UTC',
      accessTier: 'beta',
    })
    .returning();

  // Send welcome message with API token
  await ctx.reply(
    `Welcome to CIB, ${username}! 🚀\n\n` +
      `Your account has been created.\n\n` +
      `🔑 Your API Token:\n` +
      `<code>${apiToken}</code>\n\n` +
      `⚠️ Save this token securely! You'll need it for API access.\n\n` +
      `How to use CIB:\n` +
      `• Send any URL or screenshot to queue it for review\n` +
      `• Use /review to start reviewing your queue\n` +
      `• Use /ask to search with AI\n\n` +
      `Commands:\n` +
      `/start - Register (you're here!)\n` +
      `/review - Start a review session\n` +
      `/queue - View your pending items\n` +
      `/ask <query> - Search your queue\n` +
      `/settings - Configure preferences\n` +
      `/export - Export your data\n` +
      `/invite - Generate invite link\n` +
      `/delete_account - Delete your account\n` +
      `/help - Show all commands`,
    { parse_mode: 'HTML' }
  );
}
