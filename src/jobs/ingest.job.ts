import type { JobWithMetadata } from 'pg-boss';
import { db } from '../db';
import { items } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { IngestJobPayload } from '../types';
import { processItem } from '../ingestion/pipeline';

export async function handleIngestJob(jobs: unknown) {
  const job = (jobs as JobWithMetadata<IngestJobPayload>[])[0];
  if (!job) {
    throw new Error('No job provided');
  }
  const { itemId } = job.data;

  try {
    await processItem(itemId);
    return { success: true, itemId };
  } catch (error) {
    await db
      .update(items)
      .set({ scrapeStatus: 'failed' })
      .where(eq(items.id, itemId));

    const retryCount = job.retryCount || 0;
    if (retryCount < 3) {
      throw error;
    }

    console.error(`Failed to ingest item ${itemId} after 3 attempts:`, error);
    throw error;
  }
}
