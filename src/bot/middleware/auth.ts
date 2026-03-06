import type { Middleware } from 'grammy';
import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export const authMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    return;
  }

  // Skip auth for /start command to allow registration
  const text = ctx.message?.text;
  if (text?.startsWith('/start')) {
    await next();
    return;
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.telegramId, telegramId), isNull(users.deletedAt)),
  });

  if (!user) {
    await ctx.reply('Please use /start to register first.');
    return;
  }

  ctx.user = user;
  await next();
};
