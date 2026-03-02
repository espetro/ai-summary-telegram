import { eq, and, sql } from 'drizzle-orm';
import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { items, reviewSessions } from '../../db/schema';
import { deriveUserKey, decrypt } from '../../crypto';
import { config } from '../../config';

const masterSecret = Buffer.from(config.ENCRYPTION_MASTER_SECRET, 'hex');

async function deriveUserSessionKey(userId: string, encKeySalt: string): Promise<Buffer> {
  const salt = Buffer.from(encKeySalt, 'hex');
  return deriveUserKey(masterSecret, salt);
}

async function decryptField(encrypted: string, key: Buffer): Promise<string> {
  const ciphertext = Buffer.from(encrypted, 'base64');
  return decrypt(ciphertext, key);
}

async function getNextItem(userId: string, sessionId: string) {
  const nextItem = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        eq(items.reviewStatus, 'pending')
      )
    )
    .limit(1);

  if (nextItem.length === 0) {
    return null;
  }

  return nextItem[0];
}

async function updateSessionCounter(sessionId: string, field: 'itemsDone' | 'itemsSkipped' | 'itemsRemoved') {
  const fieldMap = {
    itemsDone: { itemsDone: sql`${reviewSessions.itemsDone} + 1` },
    itemsSkipped: { itemsSkipped: sql`${reviewSessions.itemsSkipped} + 1` },
    itemsRemoved: { itemsRemoved: sql`${reviewSessions.itemsRemoved} + 1` },
  };

  await db
    .update(reviewSessions)
    .set(fieldMap[field] as any)
    .where(eq(reviewSessions.id, sessionId));
}

export async function handleCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const [prefix, action, itemId] = data.split(':');
  if (prefix !== 'session' || !itemId) return;

  const userId = ctx.from?.id.toString();
  if (!userId || !ctx.user) {
    await ctx.reply('User not found. Please start the bot with /start.');
    return;
  }

  const userKey = await deriveUserSessionKey(ctx.user.id, ctx.user.encKeySalt);
  switch (action) {
    case 'done': {
      await db
        .update(items)
        .set({
          reviewStatus: 'reviewed',
          reviewedAt: new Date(),
          sessionId: ctx.session?.id || null,
        })
        .where(eq(items.id, itemId));

      if (ctx.session?.id) {
        await updateSessionCounter(ctx.session.id, 'itemsDone');
      }

      await ctx.answerCallbackQuery('Marked as done!');

      const nextItem = await getNextItem(ctx.user.id, ctx.session?.id || '');
      if (nextItem) {
        await sendItem(ctx, nextItem, userKey);
      } else {
        await ctx.reply('No more items to review! Great job! 🎉');
      }
      break;
    }

    case 'skip': {
      await db
        .update(items)
        .set({
          sessionId: ctx.session?.id || null,
        })
        .where(eq(items.id, itemId));

      if (ctx.session?.id) {
        await updateSessionCounter(ctx.session.id, 'itemsSkipped');
      }

      await ctx.answerCallbackQuery('Skipped.');

      const nextItem = await getNextItem(ctx.user.id, ctx.session?.id || '');
      if (nextItem) {
        await sendItem(ctx, nextItem, userKey);
      } else {
        await ctx.reply('No more items to review! Great job! 🎉');
      }
      break;
    }

    case 'remove': {
      await db
        .delete(items)
        .where(eq(items.id, itemId));

      if (ctx.session?.id) {
        await updateSessionCounter(ctx.session.id, 'itemsRemoved');
      }

      await ctx.answerCallbackQuery('Removed.');

      const nextItem = await getNextItem(ctx.user.id, ctx.session?.id || '');
      if (nextItem) {
        await sendItem(ctx, nextItem, userKey);
      } else {
        await ctx.reply('No more items to review! Great job! 🎉');
      }
      break;
    }

    case 'open': {
      const item = await db
        .select()
        .from(items)
        .where(eq(items.id, itemId))
        .limit(1);

      if (item.length === 0) {
        await ctx.answerCallbackQuery('Item not found.', { show_alert: true } as any);
        return;
      }

      await ctx.reply(`Here's the link:\n${item[0]!.url}`);
      await ctx.answerCallbackQuery('Opening...');
      break;
    }

    case 'reschedule': {
      const item = await db
        .select()
        .from(items)
        .where(eq(items.id, itemId))
        .limit(1);

      if (item.length === 0) {
        await ctx.answerCallbackQuery('Item not found.', { show_alert: true } as any);
        return;
      }

      const summary = item[0]!.summaryEnc
        ? await decryptField(item[0]!.summaryEnc, userKey)
        : 'No summary available';

      await ctx.reply(
        `📅 *Reschedule Item*\n\n` +
          `Title: ${item[0]!.title || 'Untitled'}\n` +
          `Summary: ${summary.substring(0, 200)}...\n\n` +
          `To reschedule, use /schedule <item_id> <new_date>\n` +
          `Example: /schedule ${itemId} tomorrow`,
        { parse_mode: 'Markdown' }
      );

      await ctx.answerCallbackQuery('Schedule options sent.');
      break;
    }

    default:
      await ctx.answerCallbackQuery('Unknown action.');
  }
}

async function sendItem(ctx: BotContext, item: typeof items.$inferSelect, userKey: Buffer) {
  const title = item.title || 'Untitled';
  const summary = item.summaryEnc
    ? await decryptField(item.summaryEnc, userKey)
    : 'No summary available';
  const author = item.author ? `by ${item.author}` : '';
  const readTime = item.estimatedReadMins ? `📖 ${item.estimatedReadMins} min read` : '';

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Done', callback_data: `session:done:${item.id}` },
        { text: '⏭ Skip', callback_data: `session:skip:${item.id}` },
      ],
      [
        { text: '🔗 Open', callback_data: `session:open:${item.id}` },
        { text: '🗑 Remove', callback_data: `session:remove:${item.id}` },
      ],
      [
        { text: '📅 Reschedule', callback_data: `session:reschedule:${item.id}` },
      ],
    ],
  };

  await ctx.reply(
    `📚 *${title}* ${author}\n\n` +
    `${readTime}\n\n` +
    `${summary.substring(0, 500)}${summary.length > 500 ? '...' : ''}`,
    {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    }
  );
}
