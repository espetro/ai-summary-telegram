import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { items } from '../../db/schema';
import { boss } from '../../jobs';
import crypto from 'crypto';
import { createHash } from 'crypto';

// URL regex pattern
const URL_REGEX = /(https?:\/\/[^\s]+)/i;

// Inline intent keywords
const INTENT_KEYWORDS = {
  now: 'immediate',
  today: 'today',
  asap: 'immediate',
};

export async function handleUrlMessage(ctx: BotContext) {
  if (!ctx.message?.text || !ctx.user) {
    return;
  }

  const text = ctx.message.text;
  const urls = text.match(URL_REGEX);

  if (!urls) {
    return;
  }

  // Parse inline intent
  const lowerText = text.toLowerCase();
  let intent: 'immediate' | 'today' | 'scheduled' = 'scheduled';

  if (lowerText.includes('now') || lowerText.includes('asap')) {
    intent = 'immediate';
  } else if (lowerText.includes('today')) {
    intent = 'today';
  }

  for (const url of urls) {
    try {
      // Parse URL
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname;
      const urlHash = createHash('sha256').update(url).digest('hex');
      const canonicalUrl = url; // TODO: Implement URL normalization

      // Check for duplicate
      const existing = await db.query.items.findFirst({
        where: (items, { and, eq }) =>
          and(eq(items.userId, ctx.user!.id), eq(items.urlHash, urlHash)),
      });

      if (existing) {
        await ctx.reply(`⚠️ This link is already in your queue.`);
        continue;
      }

      // Insert item
      const [item] = await db
        .insert(items)
        .values({
          userId: ctx.user.id,
          url,
          canonicalUrl,
          urlHash,
          domain,
          scrapeStatus: 'pending',
          reviewStatus: 'pending',
          sourceSurface: intent === 'immediate' ? 'immediate' : 'manual',
        })
        .returning();

      // Enqueue ingest job
      await boss.send('ingest', { itemId: item!.id });
      // Send confirmation
      const message =
        intent === 'immediate'
          ? `🚀 Link queued (immediate): ${url}`
          : intent === 'today'
          ? `📅 Link queued (today): ${url}`
          : `📥 Link queued: ${url}`;

      await ctx.reply(message);
    } catch (error) {
      console.error('Error handling URL:', error);
      await ctx.reply(`❌ Failed to queue link: ${url}`);
    }
  }
}

export async function handlePhotoMessage(ctx: BotContext) {
  if (!ctx.message?.photo || !ctx.user) {
    return;
  }

  // Get largest photo
  const photos = ctx.message.photo;
  const largestPhoto = photos[photos.length - 1];

  if (!largestPhoto) {
    return;
  }

  const fileUniqueId = largestPhoto.file_unique_id;

  try {
    // Check for duplicate using file_unique_id
    const existing = await db.query.items.findFirst({
      where: (items, { and, eq }) =>
        and(eq(items.userId, ctx.user!.id), eq(items.urlHash, fileUniqueId)),
    });

    if (existing) {
      await ctx.reply('⚠️ This screenshot is already in your queue.');
      return;
    }

    // Get file from Telegram
    const file = await ctx.api.getFile(largestPhoto.file_id);

    if (!file.file_path) {
      await ctx.reply('❌ Failed to get screenshot.');
      return;
    }

    // Construct file URL (valid for 1 hour)
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    // Download photo
    const response = await fetch(fileUrl);
    if (!response.ok) {
      await ctx.reply('❌ Failed to download screenshot.');
      return;
    }

    const buffer = await response.arrayBuffer();

    // Create a URL for the photo (we'll store it as a data URL or upload to storage)
    // For now, store as base64 data URL
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    // Insert item
    const [item] = await db
      .insert(items)
      .values({
        userId: ctx.user.id,
        url: dataUrl,
        canonicalUrl: dataUrl,
        urlHash: fileUniqueId,
        domain: 'screenshot',
        scrapeStatus: 'completed', // Screenshot doesn't need scraping
        reviewStatus: 'pending',
        sourceSurface: 'screenshot',
      })
      .returning();

    // Enqueue vision job for screenshot analysis
    await boss.send('vision', { itemId: item!.id });
    await ctx.reply('📸 Screenshot queued for analysis.');
  } catch (error) {
    console.error('Error handling photo:', error);
    await ctx.reply('❌ Failed to queue screenshot.');
  }
}
