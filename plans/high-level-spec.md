***

# Product Spec: Content Intelligence Bot (CIB)

## Overview

A Telegram-first content capture and intelligence tool. Users save URLs (and screenshots) via Telegram DM or browser extension. The system scrapes, summarizes, embeds, and stores content. Users interact with their saved content through a queue review system, a weekly digest, and a RAG-powered chat interface — all inside Telegram.

**Runtime:** Bun + TypeScript  
**Interface:** Telegram Bot (DM mode for MVP)  
**Deployment:** Railway  

***

## Repository Structure

```
cib/
├── src/
│   ├── bot/
│   │   ├── index.ts           # Bot init, middleware, router
│   │   ├── handlers/
│   │   │   ├── ingest.ts      # URL + screenshot messages
│   │   │   ├── commands.ts    # /ask, /search, /queue, /review, /settings, /delete_account
│   │   │   └── callbacks.ts   # Inline button callbacks (Done, Skip, Remove, Reschedule)
│   │   └── session.ts         # Review session state machine
│   ├── ingestion/
│   │   ├── scraper.ts         # Tier 1: trafilatura via shell / Jina Reader API
│   │   ├── vision.ts          # Tier 2: GPT-4o vision for screenshots
│   │   ├── metadata.ts        # OG tags, canonical URL, dedup hash
│   │   └── pipeline.ts        # Orchestrates scrape → summarize → chunk → embed → store
│   ├── ai/
│   │   ├── client.ts          # Vercel AI SDK, OpenAI-compatible provider config
│   │   ├── summarize.ts       # 3-sentence summary + tags via generateObject
│   │   ├── embed.ts           # text-embedding-3-small wrapper
│   │   ├── rag.ts             # Query embedding → pgvector search → LLM answer
│   │   └── digest.ts          # Weekly digest generation
│   ├── jobs/
│   │   ├── index.ts           # pg-boss init, worker registration
│   │   ├── ingest.job.ts      # Worker: process a saved URL
│   │   ├── notify.job.ts      # Worker: send queue review session
│   │   ├── digest.job.ts      # Worker: generate + send weekly digest
│   │   └── schedules.ts       # Cron schedule registration
│   ├── db/
│   │   ├── schema.sql         # Source of truth for DB schema
│   │   ├── schema.ts          # Drizzle ORM schema (derived from SQL)
│   │   └── index.ts           # Drizzle client init
│   ├── crypto/
│   │   └── index.ts           # AES-256 encrypt/decrypt, per-user key derivation
│   ├── api/
│   │   └── ingest.ts          # REST POST /ingest for browser extension
│   └── config.ts              # Env vars, constants
├── extension/                 # Browser extension (Week 2)
├── migrations/                # SQL migration files
├── docker-compose.yml         # Local dev: Postgres + pgvector
└── .env.example
```

***

## Database Schema

### SQL (Source of Truth)

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Users
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id         BIGINT UNIQUE NOT NULL,
  api_token_hash      TEXT NOT NULL,
  enc_key_salt        BYTEA NOT NULL,        -- per-user salt for HKDF key derivation
  queue_schedule      TEXT NOT NULL DEFAULT 'weekly',  -- 'daily' | 'weekly' | 'weekends' | cron string
  queue_schedule_time TIME NOT NULL DEFAULT '09:00',
  timezone            TEXT NOT NULL DEFAULT 'UTC',
  invited_by          UUID REFERENCES users(id),
  access_tier         TEXT NOT NULL DEFAULT 'beta',    -- 'owner' | 'beta' | 'paid'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

-- Invite tokens
CREATE TABLE invites (
  token               TEXT PRIMARY KEY,
  created_by          UUID NOT NULL REFERENCES users(id),
  used_by             UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at             TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ NOT NULL
);

-- Saved items
CREATE TABLE items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url                 TEXT NOT NULL,
  canonical_url       TEXT NOT NULL,
  url_hash            TEXT NOT NULL,          -- SHA-256 of canonical_url for dedup
  domain              TEXT NOT NULL,
  title               TEXT,                   -- plaintext, used for display
  author              TEXT,
  published_at        TIMESTAMPTZ,
  estimated_read_mins INT,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  source_surface      TEXT,                   -- 'x' | 'linkedin' | 'instagram' | 'web' | 'extension'
  scrape_status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'full' | 'partial' | 'failed' | 'vision'
  content_enc         BYTEA,                  -- AES-256 encrypted scraped text
  summary_enc         BYTEA,                  -- AES-256 encrypted summary
  review_status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'removed'
  session_id          UUID,                   -- FK set when reviewed in a session
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ,
  UNIQUE(user_id, url_hash)
);

CREATE INDEX ON items(user_id, review_status);
CREATE INDEX ON items(user_id, created_at DESC);

-- Embedding chunks
CREATE TABLE chunks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_index         INT NOT NULL,
  content_enc         BYTEA NOT NULL,         -- AES-256 encrypted chunk text
  embedding           vector(1536),           -- text-embedding-3-small output
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON chunks(user_id);
CREATE INDEX chunks_embedding_idx ON chunks
  USING hnsw (embedding vector_cosine_ops);  -- ANN index for fast similarity search

-- Review sessions
CREATE TABLE review_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  item_count          INT NOT NULL,
  items_done          INT NOT NULL DEFAULT 0,
  items_skipped       INT NOT NULL DEFAULT 0,
  items_removed       INT NOT NULL DEFAULT 0,
  nudge_sent          BOOLEAN NOT NULL DEFAULT false  -- 24h follow-up nudge flag
);

-- Platform credentials (Tier 3 - opt-in)
CREATE TABLE credentials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,          -- 'linkedin' | 'instagram'
  session_cookie_enc  BYTEA NOT NULL,         -- AES-256 encrypted
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- Row-Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
```

***

## Job Queue (pg-boss)

All async work runs through pg-boss. No separate Redis needed — queue state lives in Postgres.

### Job Types

```typescript
// jobs/index.ts — job name constants and payload types

type IngestJobPayload = {
  itemId: string;         // UUID of the already-inserted items row
  userId: string;
  url: string;
  sourceType: 'url' | 'screenshot';
  screenshotBase64?: string;
};

type NotifyJobPayload = {
  userId: string;
  sessionId: string;      // pre-created review_sessions row
};

type DigestJobPayload = {
  userId: string;
};

type NudgeJobPayload = {
  userId: string;
  sessionId: string;
};
```

### Job Registration

```typescript
// jobs/schedules.ts
// Called once at startup after pg-boss connects

export async function registerSchedules(boss: PgBoss) {
  // Per-user queue notifications: scheduled dynamically when user's
  // queue_schedule changes. Use boss.schedule() with user-specific cron.

  // Weekly digest: fixed global cron, fans out per user inside the worker
  await boss.schedule('digest-fanout', '0 10 * * 0', {}); // Sunday 10AM UTC
}
```

### Worker Responsibilities

| Job | Trigger | What it does |
|---|---|---|
| `ingest` | On URL save | Scrape → summarize → chunk → embed → store → notify user via Telegram |
| `notify-queue` | User's cron schedule | Create `review_session`, send first item card to user |
| `nudge` | 24h after `notify-queue` if session incomplete | Send single follow-up message if queue not finished |
| `digest-fanout` | Sunday 10AM (global cron) | For each active user, enqueue one `digest` job |
| `digest` | Enqueued by fanout | Fetch week's items → cluster → LLM call → send Telegram message |

***

## Ingestion Pipeline

### Flow

```
ingest worker receives IngestJobPayload
  │
  ├─ sourceType === 'screenshot'
  │     → ai/vision.ts: GPT-4o multimodal call
  │       prompt: extract title, author, body text, url if visible
  │       → write decrypted text to item
  │
  └─ sourceType === 'url'
        → check domain blocklist (instagram.com, linkedin.com)
        │
        ├─ blocked domain, no credentials
        │     → scrape_status = 'partial', store OG metadata only
        │     → bot message: "🔒 Send a screenshot to extract content"
        │
        ├─ blocked domain, credentials exist
        │     → decrypt session cookie → Playwright fetch
        │     → scrape_status = 'full' (or 'partial' if still blocked)
        │
        └─ open domain
              → trafilatura (shell exec or HTTP wrapper)
              → fallback: Jina Reader API (GET https://r.jina.ai/{url})
              → fallback: OG tags only → scrape_status = 'partial'

  → ai/summarize.ts: generateObject (Vercel AI SDK)
      schema: { summary: string, tags: string[], estimatedReadMins: number }

  → crypto: encrypt content + summary with per-user key

  → write to items table

  → chunk content (400 tokens, 50 overlap)
  → ai/embed.ts: embed each chunk
  → crypto: encrypt chunk content
  → write to chunks table

  → send Telegram confirmation card
```

### Intent Parsing (on save, before enqueue)

```typescript
// Runs synchronously in the bot message handler, before the ingest job is enqueued.
// Uses a simple LLM call or regex heuristics.

async function parseInlineIntent(text: string): Promise<'now' | null> {
  const nowPatterns = /\b(now|today|asap|read this|send me this|immediately)\b/i;
  if (nowPatterns.test(text)) return 'now';
  // If no signal, return null → apply user's default queue_schedule
  return null;
}

// If intent === 'now': enqueue a notify-queue job with sendAt = now
// Otherwise: item sits in queue until next scheduled session
```

***

## Telegram Bot

### Middleware Stack

```
Request in
  → Allowlist check (telegram_id in users table, deleted_at IS NULL)
  → Active review session check (attach session state if mid-review)
  → Route to handler
```

### Message Routing

```typescript
// bot/handlers/ingest.ts

on('message:url')        → extract URL, parseInlineIntent, insert item, enqueue ingest job
on('message:photo')      → extract photo, insert item with sourceType='screenshot', enqueue ingest job
on('message:text')       → if no URL and no command → treat as /ask [text] (RAG passthrough)
```

### Commands

| Command | Handler | Notes |
|---|---|---|
| `/start` | onboarding flow | Timezone prompt → schedule prompt → generate api_token → done |
| `/invite` | generate invite token | Expires in 48h, single-use |
| `/review` | start session now | Ignores schedule, triggers notify job immediately |
| `/ask [question]` | RAG query | Optional `--this-week` flag filters by `created_at` |
| `/search [query]` | hybrid search | Keyword + vector, returns top 5 cards |
| `/queue` | show queue | Counts pending items grouped by week saved |
| `/settings` | settings menu | Sub-commands: `intent`, `schedule`, `timezone` |
| `/export` | data export | Sends JSON of all items (decrypted) as a file |
| `/delete_account` | hard delete | Confirmation required; cascades all tables |

### Review Session State Machine

The session state is kept in-memory (a `Map<userId, SessionState>`) for the duration of a review session. It is not persisted — if the bot restarts mid-session, the user can `/review` again.

```typescript
type SessionState = {
  sessionId: string;
  userId: string;
  itemIds: string[];       // ordered list of pending item IDs for this session
  currentIndex: number;
  startedAt: Date;
};

// Inline button callback routing:
// callback_data format: `session:{action}:{sessionId}`
// actions: 'done' | 'skip' | 'remove' | 'open' | 'reschedule'

// On 'reschedule': show schedule picker keyboard
// On schedule selected: show confirmation ("Change whole queue to daily?")
// On confirm: UPDATE users SET queue_schedule = ? , re-register cron, resume session
```

***

## AI Layer (Vercel AI SDK)

```typescript
// ai/client.ts
import { createOpenAI } from '@ai-sdk/openai';

export const aiProvider = createOpenAI({
  baseURL: process.env.AI_BASE_URL,   // custom provider endpoint
  apiKey: process.env.AI_API_KEY,
});

export const chatModel = aiProvider(process.env.AI_CHAT_MODEL);
export const embeddingModel = aiProvider.embedding(process.env.AI_EMBEDDING_MODEL);
```

### Summarization

```typescript
// ai/summarize.ts — uses generateObject for structured output
const result = await generateObject({
  model: chatModel,
  schema: z.object({
    summary: z.string().describe('2-3 sentence summary of the content'),
    tags: z.array(z.string()).min(3).max(7),
    estimatedReadMins: z.number().int().min(1),
  }),
  prompt: `Summarize this content:\n\n${text}`,
});
```

### RAG Query

```typescript
// ai/rag.ts
// 1. Embed the user query
const queryEmbedding = await embed({ model: embeddingModel, value: query });

// 2. pgvector similarity search (scoped to user_id via RLS)
// SELECT item_id, content_enc, 1 - (embedding <=> $1) AS score
// FROM chunks WHERE user_id = $2 [AND created_at > $3]
// ORDER BY score DESC LIMIT 8

// 3. Decrypt retrieved chunks
// 4. Assemble context window
// 5. streamText call with citations prompt
const result = await streamText({
  model: chatModel,
  system: `You are answering questions based only on the user's saved content.
           Always cite sources by item title and URL.
           If the answer is not in the provided content, say so.`,
  prompt: `Context:\n${formattedChunks}\n\nQuestion: ${query}`,
});
```

***

## Encryption

```typescript
// crypto/index.ts
// Per-user AES-256-GCM encryption using HKDF-derived keys

// Key derivation: never stored, always re-derived
// masterSecret = process.env.ENCRYPTION_MASTER_SECRET (32 bytes, in env)
// userKey = HKDF(masterSecret, salt=user.enc_key_salt, info='cib-user-key', length=32)

export function deriveUserKey(masterSecret: Buffer, salt: Buffer): Buffer
export function encrypt(plaintext: string, key: Buffer): Buffer  // returns IV + ciphertext
export function decrypt(ciphertext: Buffer, key: Buffer): string
```

***

## REST API (Browser Extension)

Single endpoint. Auth via `Authorization: Bearer <api_token>` header (token hash checked against DB).

```
POST /api/ingest
Body: { url: string, sourceLabel?: string }
Response: { itemId: string, status: 'queued' }
```

The browser extension (Week 2) is a Manifest V3 extension with a single popup: current tab URL + a "Save" button that calls this endpoint.

***

## Environment Variables

```bash
# Telegram
TELEGRAM_BOT_TOKEN=

# Database
DATABASE_URL=                    # postgres://... (includes pgvector)

# AI Provider
AI_BASE_URL=                     # OpenAI-compatible endpoint
AI_API_KEY=
AI_CHAT_MODEL=                   # e.g. gpt-4o-mini
AI_EMBEDDING_MODEL=              # e.g. text-embedding-3-small

# Scraping fallback
JINA_READER_API_KEY=             # optional, rate-limited free tier available

# Security
ENCRYPTION_MASTER_SECRET=        # 32-byte hex string, never rotated after launch
API_TOKEN_SECRET=                # used to generate user api_tokens

# App
PORT=3000
NODE_ENV=production
```

***

## Local Dev Setup

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: cib
      POSTGRES_USER: cib
      POSTGRES_PASSWORD: cib
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./src/db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql

volumes:
  pgdata:
```

Start with `docker compose up -d`, then `bun run dev`.

***

## What This Spec Excludes (Explicitly Out of MVP Scope)

- Telegram Forum/Topics UX — ship on DM, migrate later
- Tier 3 authenticated scraping (Playwright + session cookies) — V2
- `/activity` audit log — V2
- Multi-language support
- Stripe billing integration — allowlist controls access for now
