import type { Job } from 'pg-boss';
import { db } from '../db';
import { reviewSessions, items, users } from '../db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import type { NotifyJobPayload } from '../types';

export async function handleNotifyJob(jobs: unknown) {
  const job = (jobs as Job<NotifyJobPayload>[])[0];
  if (!job) {
    throw new Error('No job provided');
  }
  const { userId } = job.data;

  try {
    // 1. Create review_session row for user
    const [session] = await db
      .insert(reviewSessions)
      .values({ userId, itemCount: 0 })
      .returning();

    if (!session) {
      throw new Error('Failed to create review session');
    }

    // 2. Fetch pending items (reviewStatus='pending') for user
    const pendingItems = await db
      .select()
      .from(items)
      .where(and(eq(items.userId, userId), eq(items.reviewStatus, 'pending')))
      .orderBy(asc(items.createdAt));

    if (pendingItems.length === 0) {
      return { success: true, sessionId: session.id, itemCount: 0 };
    }

    // Update session with itemCount
    await db
      .update(reviewSessions)
      .set({ itemCount: pendingItems.length })
      .where(eq(reviewSessions.id, session.id!));

    // 3. Send first item card to user via Telegram
    const firstItem = pendingItems[0];
    // TODO: Implement Telegram message sending
    // await bot.sendMessage(userId, formatItemCard(firstItem, 0, pendingItems.length));

    return { success: true, sessionId: session.id, itemCount: pendingItems.length };
  } catch (error) {
    console.error(`Failed to send notification for user ${userId}:`, error);
    throw error;
  }
}
