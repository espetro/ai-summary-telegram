import type { BotContext } from '../../types/bot';
import { boss } from '../../jobs';
import { db } from '../../db';
import { items } from '../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function reviewCommand(ctx: BotContext) {
  if (!ctx.user) {
    return;
  }

  // Check if user has any pending items
  const pendingItems = await db
    .select()
    .from(items)
    .where(and(eq(items.userId, ctx.user.id), eq(items.reviewStatus, 'pending')));

  if (pendingItems.length === 0) {
    await ctx.reply(
      '📭 Your queue is empty!\n\n' +
        'Send me URLs or screenshots to build your queue, then use /review to start reviewing.'
    );
    return;
  }

  // Trigger notify job immediately
  await boss.send('notify', { userId: ctx.user.id });

  await ctx.reply('🔄 Starting review session...\n\n' + `You have ${pendingItems.length} item(s) to review.`);
}
