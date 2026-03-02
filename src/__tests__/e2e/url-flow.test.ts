import { test, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import crypto from 'crypto';
import { db } from '../../db';
import { users, items, chunks } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { startJobs, stopJobs, boss } from '../../jobs';

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
      telegramId: 'test_user_123',
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

test('URL ingestion flow - complete', async () => {
  const testUrl = 'https://example.com/test-article';
  const sourceLabel = 'api-test';

  // 1. Send URL to API
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
  // Note: This would require boss integration testing
  // For now, we'll just verify the item was created with proper status

  // 4. Simulate job worker processing (mock)
  // In a real scenario, this would be handled by the ingest.job worker
  // For E2E testing, we'd need to actually run the worker or mock its effects

  // 5. Verify item updated with encrypted content (mock assertion)
  // In real E2E test with actual worker, we'd wait for job completion
  // await boss.waitUntilComplete(jobId);
  // const updatedItem = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  // expect(updatedItem[0].scrapeStatus).toBe('completed');
  // expect(updatedItem[0].contentEnc).toBeTruthy();

  // 6. Verify chunks created with embeddings (mock assertion)
  // const chunkResults = await db.select().from(chunks).where(eq(chunks.itemId, itemId));
  // expect(chunkResults.length).toBeGreaterThan(0);
  // expect(chunkResults[0].embedding).toBeTruthy();
});

test('URL ingestion - missing auth token', async () => {
  const response = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: 'https://example.com/test-article',
    }),
  });

  expect(response.status).toBe(401);

  const body = await response.json();
  expect(body).toHaveProperty('error', 'Missing or invalid Authorization header');
});

test('URL ingestion - invalid API token', async () => {
  const response = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer invalid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: 'https://example.com/test-article',
    }),
  });

  expect(response.status).toBe(401);

  const body = await response.json();
  expect(body).toHaveProperty('error', 'Invalid API token');
});

test('URL ingestion - duplicate URL for same user', async () => {
  const testUrl = 'https://example.com/duplicate-test';

  // First ingestion
  const firstResponse = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: testUrl }),
  });

  expect(firstResponse.status).toBe(201);

  // Second ingestion with same URL
  const secondResponse = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: testUrl }),
  });

  expect(secondResponse.status).toBe(409);

  const body = await secondResponse.json();
  expect(body).toHaveProperty('error', 'URL already exists for this user');
  expect(body).toHaveProperty('itemId');

  // Verify only one item was created
  const itemResults = await db
    .select()
    .from(items)
    .where(eq(items.userId, testUserId));

  expect(itemResults.length).toBe(1);
});

test('URL ingestion - invalid URL format', async () => {
  const response = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: 'not-a-valid-url',
    }),
  });

  expect(response.status).toBe(400);

  const body = await response.json();
  expect(body).toHaveProperty('error', 'Invalid URL format');
});

test('URL ingestion - missing URL', async () => {
  const response = await testApi.request('/api/ingest', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  expect(response.status).toBe(400);

  const body = await response.json();
  expect(body).toHaveProperty('error', 'URL is required');
});

test('Health check endpoint', async () => {
  const response = await testApi.request('/api/health');

  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body).toHaveProperty('status', 'ok');
  expect(body).toHaveProperty('timestamp');
});
