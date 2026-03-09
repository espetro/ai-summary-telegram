import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { items, users } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { deriveUserKey, decrypt, encrypt } from '../../crypto';
import { summarizeContent } from '../../ai/summarize';
import { config } from '../../config';

const masterSecret = Buffer.from(config.ENCRYPTION_MASTER_SECRET, 'hex').slice(0, 32);

export async function regenerateCommand(ctx: BotContext) {
  if (!ctx.user) {
    return;
  }

  const text = ctx.message?.text || '';
  const args = text.split(/\s+/).slice(1);
  const indexArg = args[0];

  let index = 1;
  let defaultedToFirst = false;

  if (indexArg) {
    const parsed = parseInt(indexArg, 10);
    if (isNaN(parsed) || parsed < 1) {
      await ctx.reply('❌ Invalid index. Usage: /regenerate [index]\nExample: /regenerate 3');
      return;
    }
    index = parsed;
  } else {
    defaultedToFirst = true;
  }

  const allItems = await db
    .select()
    .from(items)
    .where(eq(items.userId, ctx.user.id))
    .orderBy(sql`${items.createdAt} DESC`);

  if (allItems.length === 0) {
    await ctx.reply('📭 Your queue is empty! Send me URLs or screenshots to build your queue.');
    return;
  }

  if (index > allItems.length) {
    await ctx.reply(`❌ Index ${index} is out of range. Your queue has ${allItems.length} item${allItems.length === 1 ? '' : 's'}.`);
    return;
  }

  const item = allItems[index - 1];
  if (!item) {
    await ctx.reply('❌ Failed to get item. Please try again.');
    return;
  }

  if (item.scrapeStatus !== 'completed' || !item.contentEnc) {
    await ctx.reply('⏳ This item is still being processed or has no content. Please wait and try again.');
    return;
  }

  const statusMsg = defaultedToFirst
    ? '🔄 No index provided, regenerating summary for item #1...'
    : `🔄 Regenerating summary for item #${index}...`;

  await ctx.reply(statusMsg);

  try {
    const userResult = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const user = userResult[0];
    if (!user) {
      await ctx.reply('❌ User not found. Please try again.');
      return;
    }

    const userKey = deriveUserKey(masterSecret, Buffer.from(user.encKeySalt, 'hex'));

    const contentBuffer = Buffer.from(item.contentEnc, 'base64');
    const content = decrypt(contentBuffer, userKey);

    const summaryResult = await summarizeContent(content);
    const summaryEnc = encrypt(summaryResult.summary, userKey).toString('base64');

    await db
      .update(items)
      .set({
        summaryEnc,
        tags: summaryResult.tags,
        estimatedReadMins: summaryResult.estimatedReadMins,
      })
      .where(eq(items.id, item.id));

    const title = item.title || 'Untitled';
    const tagsDisplay = summaryResult.tags.slice(0, 5).join(', ');

    await ctx.reply(
      `✅ Summary regenerated for: *${title}*\n\n` +
      `${summaryResult.summary}\n\n` +
      `🏷 Tags: ${tagsDisplay}\n` +
      `📖 ${summaryResult.estimatedReadMins} min read`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Failed to regenerate summary:', error);
    await ctx.reply('❌ Failed to regenerate summary. Please try again later.');
  }
}
