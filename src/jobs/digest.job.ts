import type { Job } from 'pg-boss';
import { db } from '../db';
import { users } from '../db/schema';
import { and, isNull } from 'drizzle-orm';
import { boss } from './index';
import type { DigestJobPayload } from '../types';

// Fanout job - runs weekly, creates per-user digest jobs
export async function handleDigestFanoutJob() {
  // 1. Query all active users (deletedAt IS NULL)
  const activeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(isNull(users.deletedAt));

  // 2. For each user, enqueue 'digest' job with userId
  for (const user of activeUsers) {
    await boss.send('digest', { userId: user.id } as DigestJobPayload);
  }

  return { success: true, userCount: activeUsers.length };
}

// Individual digest job
export async function handleDigestJob(jobs: unknown) {
  const job = (jobs as Job<DigestJobPayload>[])[0];
  if (!job) {
    throw new Error('No job provided');
  }
  const { userId } = job.data;

  try {
    // 1. Call digest.ts from src/ai/digest.ts
    // TODO: Import and call from src/ai/digest.ts once implemented
    // const digest = await generateDigest(userId);

    // 2. Send digest message to user via Telegram
    // TODO: Implement Telegram message sending
    // await bot.sendMessage(userId, formatDigestMessage(digest));

    return { success: true, userId };
  } catch (error) {
    console.error(`Failed to generate digest for user ${userId}:`, error);
    throw error;
  }
}
