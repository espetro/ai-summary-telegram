import type { JobWithMetadata } from 'pg-boss';
import { db } from '../db';
import { items } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { IngestJobPayload } from '../types';

export async function handleIngestJob(jobs: unknown) {
  const job = (jobs as JobWithMetadata<IngestJobPayload>[])[0];
  if (!job) {
    throw new Error('No job provided');
  }
  const { itemId } = job.data;

  try {
    // 1. Get item from DB
    const itemResult = await db
      .select()
      .from(items)
      .where(eq(items.id, itemId))
      .limit(1);

    if (itemResult.length === 0) {
      throw new Error(`Item ${itemId} not found`);
    }

    const item = itemResult[0];

    // 2. Run ingestion pipeline
    // TODO: Import and call from src/ingestion/pipeline.ts once implemented
    // await runIngestionPipeline(item);

    // 3. Update item scrape_status to 'completed'
    await db
      .update(items)
      .set({ scrapeStatus: 'completed' })
      .where(eq(items.id, itemId));

    // 4. If success, send Telegram confirmation to user
    // TODO: Implement Telegram message sending
    // await bot.sendMessage(item.userId, `✅ Content ingested: ${item.title || item.url}`);

    return { success: true, itemId };
  } catch (error) {
    // Update item scrape_status to 'failed'
    await db
      .update(items)
      .set({ scrapeStatus: 'failed' })
      .where(eq(items.id, itemId));

    // Handle errors with retry (max 3 attempts)
    const retryCount = job.retryCount || 0;
    if (retryCount < 3) {
      throw error; // PgBoss will retry
    }

    // Log final failure
    console.error(`Failed to ingest item ${itemId} after 3 attempts:`, error);
    throw error;
  }
}
