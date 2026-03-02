import { eq, and, or, sql, ilike } from 'drizzle-orm';
import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { items, chunks } from '../../db/schema';
import { deriveUserKey, decrypt } from '../../crypto';
import { embedText } from '../../ai/embed';
import { config } from '../../config';

const masterSecret = Buffer.from(config.ENCRYPTION_MASTER_SECRET, 'hex');

interface SearchResult {
  id: string;
  title: string;
  summary: string;
  url: string;
  score: number;
  source: 'keyword' | 'vector';
}

async function deriveUserSessionKey(userId: string, encKeySalt: string): Promise<Buffer> {
  const salt = Buffer.from(encKeySalt, 'hex');
  const deriveUserKey = (await import('../../crypto')).deriveUserKey;
  return deriveUserKey(masterSecret, salt);
}

async function decryptField(encrypted: string, key: Buffer): Promise<string> {
  const ciphertext = Buffer.from(encrypted, 'base64');
  const decrypt = (await import('../../crypto')).decrypt;
  return decrypt(ciphertext, key);
}

export async function searchCommand(ctx: BotContext) {
  if (!ctx.message?.text) return;

  const userId = ctx.from?.id.toString();
  if (!userId || !ctx.user) {
    await ctx.reply('User not found. Please start the bot with /start.');
    return;
  }

  const query = ctx.message.text.replace(/^\/search\s*/, '').trim();
  if (!query) {
    await ctx.reply('Please provide a search query.\nUsage: /search <query>');
    return;
  }

  await ctx.replyWithChatAction('typing');

  const userKey = await deriveUserSessionKey(ctx.user.id, ctx.user.encKeySalt);

  try {
    const results = await hybridSearch(ctx.user.id, query, userKey);

    if (results.length === 0) {
      await ctx.reply('No results found. Try a different query.');
      return;
    }

    const message = formatResults(results, 1);
    const keyboard = createPaginationKeyboard(1, Math.ceil(results.length / 5), query);

    await ctx.reply(message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    console.error('Search error:', error);
    await ctx.reply('An error occurred while searching. Please try again.');
  }
}

async function hybridSearch(userId: string, query: string, userKey: Buffer): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // 1. Keyword search on title
  const keywordResults = await db
    .select({
      id: items.id,
      title: items.title,
      summaryEnc: items.summaryEnc,
      url: items.url,
    })
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        or(
          ilike(items.title, sql`%${query}%`),
        )
      )
    )
    .limit(10);

  for (const item of keywordResults) {
    const summary = item.summaryEnc
      ? await decryptField(item.summaryEnc, userKey)
      : 'No summary available';

    results.push({
      id: item.id,
      title: item.title || 'Untitled',
      summary: summary.substring(0, 200),
      url: item.url,
      score: 1.0,
      source: 'keyword',
    });
  }

  // 2. Vector similarity search
  try {
    const queryEmbedding = await embedText(query);

    const vectorResults = await db
      .select({
        id: items.id,
        title: items.title,
        summaryEnc: items.summaryEnc,
        url: items.url,
        distance: sql<number>`${chunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`.as('distance'),
      })
      .from(chunks)
      .innerJoin(items, sql`${chunks.itemId} = ${items.id}`)
      .where(eq(items.userId, userId))
      .orderBy(sql`${chunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
      .limit(10);

    for (const item of vectorResults) {
      const exists = results.find(r => r.id === item.id);
      if (!exists) {
        const summary = item.summaryEnc
          ? await decryptField(item.summaryEnc, userKey)
          : 'No summary available';

        results.push({
          id: item.id,
          title: item.title || 'Untitled',
          summary: summary.substring(0, 200),
          url: item.url,
          score: 1 - (item.distance as number),
          source: 'vector',
        });
      } else {
        exists.score += 0.5;
      }
    }
  } catch (error) {
    console.error('Vector search error:', error);
  }

  // Sort by combined score and return top 5
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function formatResults(results: SearchResult[], page: number): string {
  const start = (page - 1) * 5;
  const end = start + 5;
  const pageResults = results.slice(start, end);

  let message = `🔍 *Search Results* (Page ${page})\n\n`;

  pageResults.forEach((result, index) => {
    const globalIndex = start + index + 1;
    message += `${globalIndex}. *${result.title}*\n`;
    message += `   ${result.summary}${result.summary.length >= 200 ? '...' : ''}\n`;
    message += `   🔗 [View](${result.url})\n\n`;
  });

  return message;
}

function createPaginationKeyboard(page: number, totalPages: number, query: string) {
  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  if (totalPages > 1) {
    const row: Array<{ text: string; callback_data: string }> = [];

    if (page > 1) {
      row.push({
        text: '⬅️ Previous',
        callback_data: `search:${page - 1}:${encodeURIComponent(query)}`,
      });
    }

    row.push({
      text: `${page}/${totalPages}`,
      callback_data: 'search:info',
    });

    if (page < totalPages) {
      row.push({
        text: 'Next ➡️',
        callback_data: `search:${page + 1}:${encodeURIComponent(query)}`,
      });
    }

    buttons.push(row);
  }

  return { inline_keyboard: buttons };
}
