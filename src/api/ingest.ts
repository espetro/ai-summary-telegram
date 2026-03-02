import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users, items } from '../db/schema';
import { boss } from '../jobs';
import { config } from '../config';
import crypto from 'crypto';

const api = new Hono();

/**
 * POST /api/ingest
 * 
 * Accepts a URL for ingestion and queues it for processing
 * 
 * Headers:
 *   Authorization: Bearer <api_token>
 * 
 * Body:
 *   {
 *     url: string;
 *     sourceLabel?: string;
 *   }
 * 
 * Response:
 *   {
 *     itemId: string;
 *     status: 'queued';
 *   }
 */
api.post('/ingest', async (c) => {
  try {
    // 1. Validate Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const apiToken = authHeader.slice(7); // Remove 'Bearer ' prefix
    if (!apiToken) {
      return c.json({ error: 'Missing API token' }, 401);
    }

    // 2. Hash the token and look up user
    const tokenHash = crypto.createHash('sha256').update(apiToken).digest('hex');

    const userResults = await db
      .select()
      .from(users)
      .where(eq(users.apiTokenHash, tokenHash))
      .limit(1);

    if (userResults.length === 0) {
      return c.json({ error: 'Invalid API token' }, 401);
    }

    const user = userResults[0]!;

    // 3. Parse request body
    const body = await c.req.json();
    const { url, sourceLabel } = body;

    if (!url || typeof url !== 'string') {
      return c.json({ error: 'URL is required' }, 400);
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return c.json({ error: 'Invalid URL format' }, 400);
    }

    // 4. Generate URL metadata
    const urlObj = new URL(url);
    const canonicalUrl = urlObj.href;
    const urlHash = crypto.createHash('sha256').update(canonicalUrl).digest('hex');
    const domain = urlObj.hostname;

    // 5. Check if URL already exists for this user
    const existingItem = await db
      .select()
      .from(items)
      .where(eq(items.urlHash, urlHash))
      .limit(1);

    if (existingItem.length > 0 && existingItem[0]!.userId === user.id) {
      return c.json({
        error: 'URL already exists for this user',
        itemId: existingItem[0]!.id,
      }, 409);
    }

    // 6. Insert item to DB
    const itemResults = await db
      .insert(items)
      .values({
        userId: user.id,
        url: canonicalUrl,
        canonicalUrl,
        urlHash,
        domain,
        sourceSurface: sourceLabel || 'api',
      })
      .returning();

    const item = itemResults[0]!;

    // 7. Enqueue ingest job
    await boss.send('ingest', {
      itemId: item.id,
    });

    // 8. Return success response
    return c.json({
      itemId: item.id,
      status: 'queued',
    }, 201);

  } catch (error) {
    console.error('Error in /api/ingest:', error);
    return c.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * GET /health
 * 
 * Health check endpoint
 * 
 * Response:
 *   {
 *     status: 'ok';
 *     timestamp: string;
 *   }
 */
api.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export { api };
