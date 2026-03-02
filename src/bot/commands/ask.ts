import type { BotContext } from '../../types/bot';
import { queryRAG } from '../../ai/rag';
import { db } from '../../db';
import { chunks } from '../../db/schema';
import { eq } from 'drizzle-orm';

export async function askCommand(ctx: BotContext) {
  if (!ctx.message?.text || !ctx.user) {
    return;
  }

  // Parse query from message text (remove /ask)
  let text = ctx.message.text.replace(/^\/ask\s*/, '').trim();

  if (!text) {
    await ctx.reply('Please provide a query. Usage: /ask <query>');
    return;
  }

  // Parse --this-week flag
  const thisWeekFlag = text.includes('--this-week');
  if (thisWeekFlag) {
    text = text.replace('--this-week', '').trim();
  }

  // Check if user has any chunks
  const userChunks = await db.query.chunks.findFirst({
    where: eq(chunks.userId, ctx.user.id),
  });

  if (!userChunks) {
    await ctx.reply(
      '📚 Your queue is empty!\n\n' +
        'Send me URLs or screenshots to build your knowledge base, then use /ask to search it.'
    );
    return;
  }

  // Send typing indicator
  await ctx.api.sendChatAction(ctx.chat!.id, 'typing');
  try {
    // Call queryRAG
    const result = await queryRAG(ctx.user.id, text, { thisWeek: thisWeekFlag });

    // Stream response to user
    const fullText = await result.text;
    await ctx.reply(fullText);
  } catch (error) {
    console.error('Error in ask command:', error);
    await ctx.reply('❌ Failed to search your queue. Please try again later.');
  }
}
