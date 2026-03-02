import type { Job } from 'pg-boss';
import type { NudgeJobPayload } from '../types';

export async function handleNudgeJob(jobs: unknown) {
  const job = (jobs as Job<NudgeJobPayload>[])[0];
  if (!job) {
    throw new Error('No job provided');
  }
  const { userId, sessionId, itemIds, urgency = 'normal' } = job.data;

  try {
    // TODO: Implement Telegram message sending
    // const urgencyEmoji = urgency === 'high' ? '🔴' : urgency === 'low' ? '🟢' : '🟡';
    // await bot.sendMessage(userId, `${urgencyEmoji} Reminder: You have ${itemIds.length} items waiting in your review session.`);

    return { success: true, userId, sessionId, itemCount: itemIds.length };
  } catch (error) {
    console.error(`Failed to send nudge for user ${userId}, session ${sessionId}:`, error);
    throw error;
  }
}
