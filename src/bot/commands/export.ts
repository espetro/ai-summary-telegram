import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { items } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { InputFile } from 'grammy';

export async function exportCommand(ctx: BotContext) {
  if (!ctx.user) {
    return;
  }

  // Get all user's items
  const userItems = await db.select().from(items).where(eq(items.userId, ctx.user.id));

  if (userItems.length === 0) {
    await ctx.reply('📭 You have no items to export.');
    return;
  }

  // Prepare export data (exclude encrypted content)
  const exportData = userItems.map((item) => ({
    id: item.id,
    url: item.url,
    canonicalUrl: item.canonicalUrl,
    urlHash: item.urlHash,
    domain: item.domain,
    title: item.title,
    author: item.author,
    publishedAt: item.publishedAt,
    estimatedReadMins: item.estimatedReadMins,
    tags: item.tags,
    sourceSurface: item.sourceSurface,
    scrapeStatus: item.scrapeStatus,
    reviewStatus: item.reviewStatus,
    sessionId: item.sessionId,
    createdAt: item.createdAt,
    reviewedAt: item.reviewedAt,
  }));

  // Create JSON string
  const jsonData = JSON.stringify(exportData, null, 2);
  const buffer = Buffer.from(jsonData, 'utf-8');

  // Send file
  const file = new InputFile(buffer, `cib-export-${ctx.user.id}-${Date.now()}.json`);

  await ctx.replyWithDocument(file, {
    caption: `📦 Export: ${userItems.length} items`,
  });
}
