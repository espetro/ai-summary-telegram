import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { items, reviewSessions } from '../../db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { deriveUserKey, decrypt } from '../../crypto';
import { config } from '../../config';

const masterSecret = Buffer.from(config.ENCRYPTION_MASTER_SECRET, 'hex');

async function decryptField(encrypted: string, key: Buffer): Promise<string> {
  const ciphertext = Buffer.from(encrypted, 'base64');
  return decrypt(ciphertext, key);
}

async function sendItem(ctx: BotContext, item: typeof items.$inferSelect, userKey: Buffer, index: number, total: number) {
  const title = item.title || 'Untitled';
  const summary = item.summaryEnc
    ? await decryptField(item.summaryEnc, userKey)
    : 'No summary available';
  const author = item.author ? `by ${item.author}` : '';
  const readTime = item.estimatedReadMins ? `📖 ${item.estimatedReadMins} min read` : '';
  const domain = item.domain ? `🌐 ${item.domain}` : '';

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Keep', callback_data: `session:done:${item.id}` },
        { text: '🗑 Discard', callback_data: `session:remove:${item.id}` },
      ],
      [
        { text: '⏭ Skip', callback_data: `session:skip:${item.id}` },
        { text: '🔗 Open', callback_data: `session:open:${item.id}` },
      ],
    ],
  };

  await ctx.reply(
    `📚 *${title}* ${author}\n\n` +
    `${domain} ${readTime}\n` +
    `📊 Item ${index + 1} of ${total}\n\n` +
    `${summary.substring(0, 500)}${summary.length > 500 ? '...' : ''}`,
    {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    }
  );
}

export async function reviewCommand(ctx: BotContext) {
  if (!ctx.user) {
    return;
  }

  const pendingItems = await db
    .select()
    .from(items)
    .where(and(eq(items.userId, ctx.user.id), eq(items.reviewStatus, 'pending')))
    .orderBy(asc(items.createdAt));

  if (pendingItems.length === 0) {
    await ctx.reply(
      '📭 Your queue is empty!\n\n' +
        'Send me URLs or screenshots to build your queue, then use /review to start reviewing.'
    );
    return;
  }

  const [session] = await db
    .insert(reviewSessions)
    .values({ userId: ctx.user.id, itemCount: pendingItems.length })
    .returning();

  if (!session) {
    await ctx.reply('❌ Failed to create review session. Please try again.');
    return;
  }

  ctx.session = session;

  const userKey = deriveUserKey(masterSecret, Buffer.from(ctx.user.encKeySalt, 'hex'));
  const firstItem = pendingItems[0];

  if (!firstItem) {
    await ctx.reply('❌ No items found. Please try again.');
    return;
  }

  await sendItem(ctx, firstItem, userKey, 0, pendingItems.length);
}
