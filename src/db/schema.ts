import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  vector,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  telegramId: text('telegram_id').notNull().unique(),
  apiTokenHash: text('api_token_hash').notNull(),
  encKeySalt: text('enc_key_salt').notNull(),
  queueSchedule: text('queue_schedule').notNull().default('weekly'),
  queueScheduleTime: text('queue_schedule_time').notNull().default('09:00'),
  timezone: text('timezone').notNull().default('UTC'),
  invitedBy: uuid('invited_by'),
  accessTier: text('access_tier').notNull().default('beta'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const invites = pgTable('invites', {
  token: text('token').primaryKey(),
  createdBy: uuid('created_by').notNull(),
  usedBy: uuid('used_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  usedAt: timestamp('used_at'),
  expiresAt: timestamp('expires_at').notNull(),
});

export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  url: text('url').notNull(),
  canonicalUrl: text('canonical_url').notNull(),
  urlHash: text('url_hash').notNull(),
  domain: text('domain').notNull(),
  title: text('title'),
  author: text('author'),
  publishedAt: timestamp('published_at'),
  estimatedReadMins: integer('estimated_read_mins'),
  tags: text('tags').array().notNull().default([]),
  sourceSurface: text('source_surface'),
  scrapeStatus: text('scrape_status').notNull().default('pending'),
  contentEnc: text('content_enc'),
  summaryEnc: text('summary_enc'),
  reviewStatus: text('review_status').notNull().default('pending'),
  sessionId: uuid('session_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at'),
}, (table) => ({
  userReviewIdx: index('items_user_review_idx').on(table.userId, table.reviewStatus),
  userCreatedIdx: index('items_user_created_idx').on(table.userId, table.createdAt),
  userUrlHashIdx: uniqueIndex('items_user_url_hash_idx').on(table.userId, table.urlHash),
}));

export const chunks = pgTable('chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull(),
  userId: uuid('user_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  contentEnc: text('content_enc').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: index('chunks_user_idx').on(table.userId),
  embeddingIdx: index('chunks_embedding_idx').using('hnsw', table.embedding),
}));

export const reviewSessions = pgTable('review_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  itemCount: integer('item_count').notNull(),
  itemsDone: integer('items_done').notNull().default(0),
  itemsSkipped: integer('items_skipped').notNull().default(0),
  itemsRemoved: integer('items_removed').notNull().default(0),
  nudgeSent: boolean('nudge_sent').notNull().default(false),
});

export const credentials = pgTable('credentials', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  platform: text('platform').notNull(),
  sessionCookieEnc: text('session_cookie_enc').notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userPlatformIdx: uniqueIndex('credentials_user_platform_idx').on(table.userId, table.platform),
}));
