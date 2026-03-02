import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { items } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';

export async function queueCommand(ctx: BotContext) {
  if (!ctx.user) {
    return;
  }

  // Get all pending items grouped by week
  const allItems = await db
    .select()
    .from(items)
    .where(eq(items.userId, ctx.user.id))
    .orderBy(sql`${items.createdAt} DESC`);

  if (allItems.length === 0) {
    await ctx.reply(
      '📭 Your queue is empty!\n\n' + 'Send me URLs or screenshots to build your queue.'
    );
    return;
  }

  // Group items by week
  const groupedByWeek = new Map<string, typeof allItems>();

  allItems.forEach((item) => {
    const date = new Date(item.createdAt);
    const weekKey = getWeekKey(date);
    const weekLabel = getWeekLabel(date);

    if (!groupedByWeek.has(weekLabel)) {
      groupedByWeek.set(weekLabel, []);
    }
    groupedByWeek.get(weekLabel)!.push(item);
  });

  // Build response message
  let response = `📚 Your Queue (${allItems.length} items)\n\n`;

  for (const [weekLabel, weekItems] of groupedByWeek) {
    response += `📅 ${weekLabel}\n\n`;

    weekItems.forEach((item, index) => {
      const statusIcon =
        item.reviewStatus === 'done'
          ? '✅'
          : item.reviewStatus === 'skipped'
          ? '⏭️'
          : item.scrapeStatus === 'failed'
          ? '❌'
          : '⏳';

      const title = item.title || item.url;
      const author = item.author ? ` by ${item.author}` : '';

      response += `${statusIcon} ${index + 1}. ${title}${author}\n`;
    });

    response += '\n';
  }

  await ctx.reply(response);
}

function getWeekKey(date: Date): string {
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  return `${year}-W${week}`;
}

function getWeekLabel(date: Date): string {
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `Week ${week} (${year}): ${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
