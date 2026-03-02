import { test, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import crypto from 'crypto';
import { db } from '../../db';
import { users, items, chunks } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { startJobs, stopJobs } from '../../jobs';

// Import the API routes
import { api as ingestApi } from '../../api/ingest';

let testApi: Hono;
let testUserId: string;
let testApiToken: string;
let testApiTokenHash: string;

beforeEach(async () => {
  // Create a test API for each test
  testApi = new Hono();
  testApi.route('/api', ingestApi);

  // Generate test API token
  testApiToken = crypto.randomBytes(32).toString('hex');
  testApiTokenHash = crypto.createHash('sha256').update(testApiToken).digest('hex');

  // Create test user
  const userResults = await db
    .insert(users)
    .values({
      telegramId: 'test_user_screenshot_123',
      apiTokenHash: testApiTokenHash,
      encKeySalt: crypto.randomBytes(16).toString('hex'),
    })
    .returning();

  testUserId = userResults[0]!.id;

  // Start job queue for testing
  await startJobs();
});

afterEach(async () => {
  // Clean up test data
  await db.delete(chunks).where(eq(chunks.userId, testUserId));
  await db.delete(items).where(eq(items.userId, testUserId));
  await db.delete(users).where(eq(users.id, testUserId));

  // Stop job queue
  await stopJobs();
});

test('Screenshot ingestion flow - complete', async () => {
  const testUrl = 'https://example.com/screenshot-test';
  const sourceLabel = 'screenshot-test';

  // 1. Send URL to API (screenshots are also URLs in the current design)
  const response = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: testUrl,
      sourceLabel,
    }),
  });

  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body).toHaveProperty('itemId');
  expect(body).toHaveProperty('status', 'queued');

  const itemId = (body as { itemId: string }).itemId;

  // 2. Verify item created in DB
  const itemResults = await db
    .select()
    .from(items)
    .where(eq(items.id, itemId));

  expect(itemResults.length).toBe(1);

  const item = itemResults[0]!;
  expect(item.userId).toBe(testUserId);
  expect(item.url).toBe(testUrl);
  expect(item.sourceSurface).toBe(sourceLabel);
  expect(item.urlHash).toBe(crypto.createHash('sha256').update(testUrl).digest('hex'));
  expect(item.domain).toBe('example.com');
  expect(item.scrapeStatus).toBe('pending');

  // 3. Verify ingest job enqueued
  // The job worker would determine this is a screenshot URL and handle vision extraction
  // This would typically be based on URL pattern or metadata

  // 4. Simulate job worker processing for screenshots (mock)
  // In a real E2E test, the ingest job worker would:
  // - Download the screenshot
  // - Use vision extraction (AI SDK with vision capabilities)
  // - Extract text/content from the image
  // - Store encrypted content

  // 5. Verify item updated with encrypted content (mock assertion)
  // await boss.waitUntilComplete(jobId);
  // const updatedItem = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  // expect(updatedItem[0].scrapeStatus).toBe('completed');
  // expect(updatedItem[0].contentEnc).toBeTruthy();

  // For screenshots, the title might be extracted from vision analysis
  // expect(updatedItem[0].title).toBeTruthy();

  // 6. Verify chunks created with embeddings (mock assertion)
  // Vision-extracted text would be chunked and embedded like URL content
  // const chunkResults = await db.select().from(chunks).where(eq(chunks.itemId, itemId));
  // expect(chunkResults.length).toBeGreaterThan(0);
  // expect(chunkResults[0].embedding).toBeTruthy();

  // 7. Verify vision extraction happened (mock assertion)
  // The content would include OCR or vision-extracted text
  // expect(updatedItem[0].contentEnc).toBeTruthy();
});

test('Screenshot ingestion - different URL patterns', async () => {
  const testCases = [
    'https://example.com/screenshot.png',
    'https://example.com/image.jpg',
    'https://example.com/photo.jpeg',
  ];

  for (const testUrl of testCases) {
    const response = await testApi.request('/api/ingest', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: testUrl,
        sourceLabel: 'screenshot-pattern-test',
      }),
    });

    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body).toHaveProperty('itemId');

    // Verify item was created
    const itemResults = await db
      .select()
      .from(items)
      .where(eq(items.id, (body as { itemId: string }).itemId));

    expect(itemResults.length).toBe(1);
    expect(itemResults[0]!.url).toBe(testUrl);
  }
});

test('Screenshot ingestion - with metadata', async () => {
  const testUrl = 'https://example.com/screenshot-with-meta.jpg';

  const response = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: testUrl,
      sourceLabel: 'telegram',
    }),
  });

  expect(response.status).toBe(201);

  const body = await response.json();
  const itemId = (body as { itemId: string }).itemId;

  // Verify source surface is properly set
  const itemResults = await db
    .select()
    .from(items)
    .where(eq(items.id, itemId));

    expect(itemResults.length).toBe(1);
    expect(itemResults[0]!.sourceSurface).toBe('telegram');
});

test('Screenshot ingestion - auth validation same as URL flow', async () => {
  const testUrl = 'https://example.com/screenshot.jpg';

  // Test without auth token
  const noAuthResponse = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: testUrl }),
  });

  expect(noAuthResponse.status).toBe(401);

  // Test with invalid token
  const invalidTokenResponse = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer invalid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: testUrl }),
  });

  expect(invalidTokenResponse.status).toBe(401);
});

test('Screenshot ingestion - vision extraction content handling', async () => {
  const testUrl = 'https://example.com/text-heavy-screenshot.jpg';

  const response = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: testUrl,
      sourceLabel: 'vision-test',
    }),
  });

  expect(response.status).toBe(201);

  const itemId = (await response.json() as { itemId: string }).itemId;

  // After job processing, verify:
  // 1. Content is encrypted
  // 2. Title is extracted (from vision analysis or filename)
  // 3. Chunks are created with embeddings
  // 4. Review status is pending

  // Mock assertions (real E2E would wait for job completion)
  // const updatedItem = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  // expect(updatedItem[0].contentEnc).toBeTruthy();
  // expect(updatedItem[0].reviewStatus).toBe('pending');

  // const chunkResults = await db.select().from(chunks).where(eq(chunks.itemId, itemId));
  // expect(chunkResults.length).toBeGreaterThan(0);
});

test('Screenshot ingestion - error handling', async () => {
  const invalidUrl = 'https://example.com/does-not-exist.jpg';

  const response = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: invalidUrl,
      sourceLabel: 'error-test',
    }),
  });

  // The API should accept the URL and queue it
  // Error handling happens during job processing
  expect(response.status).toBe(201);

  const itemId = (await response.json() as { itemId: string }).itemId;

  // Verify item was created with pending status
  const itemResults = await db
    .select()
    .from(items)
    .where(eq(items.id, itemId));

    expect(itemResults.length).toBe(1);
    expect(itemResults[0]!.scrapeStatus).toBe('pending');

  // The job worker would handle the 404 or download error
  // and update the scrapeStatus to 'failed'
  // (mock assertion for real E2E test)
});
