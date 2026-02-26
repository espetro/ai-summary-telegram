# CIB MVP Implementation Plan

## TL;DR

> **Quick Summary**: Build a Telegram-first content capture and intelligence tool with URL/screenshot ingestion, AI summarization, RAG-powered chat, queue review system, and weekly digest.
> 
> **Deliverables**:
> - Telegram bot with full command suite
> - Ingestion pipeline (scraping + AI)
> - PostgreSQL + pgvector database with encryption
> - Job queue (pg-boss) for async processing
> - REST API endpoint for browser extension
> - Docker compose for local development
>
> **Estimated Effort**: XL (Large multi-week project)
> **Parallel Execution**: YES - 7 waves
> **Critical Path**: Config → DB → Crypto → AI → Ingestion → Jobs → Bot

---

## Context

### Original Request
Implement the Content Intelligence Bot (CIB) per the high-level specification - a Telegram-first content capture and intelligence tool.

### Interview Summary
**Key Discussions**:
- **AI Provider**: Vercel AI SDK with OpenAI-compatible connector (configurable via env vars)
- **Scraping**: Shell exec trafilatura (requires Python in Docker)
- **Browser Extension**: Same plan, lower priority (later waves)
- **Data Retention**: Keep forever, user controls deletion
- **Telegram Framework**: grammY (TypeScript-first)

**Research Findings**:
- grammY recommended over Telegraf for TypeScript-first design
- Critical plugins needed: autoRetry, rateLimiter, transformer-throttler
- Must handle file download URL expiry (1 hour)
- Must implement graceful shutdown

### Metis Review
**Identified Gaps** (addressed):
- Framework choice: Resolved (grammY)
- Rate limiting guardrails: Added to plan
- Error handling patterns: Added global error handler requirement
- Session persistence: Database adapter (via pg-boss)

---

## Work Objectives

### Core Objective
Build a production-ready Telegram bot that captures content (URLs + screenshots), processes it through an AI pipeline (scrape → summarize → embed), stores it securely (encrypted), and enables retrieval via RAG chat and queue review system.

### Concrete Deliverables
- `src/config.ts` - Environment configuration
- `src/crypto/index.ts` - AES-256-GCM encryption
- `src/db/schema.sql` + `src/db/schema.ts` - Database schema and ORM
- `src/ai/client.ts`, `summarize.ts`, `embed.ts`, `rag.ts`, `digest.ts` - AI layer
- `src/ingestion/pipeline.ts`, `scraper.ts`, `vision.ts`, `metadata.ts` - Ingestion
- `src/jobs/*.ts` - Job queue workers
- `src/bot/index.ts`, `handlers/*.ts`, `commands/*.ts` - Telegram bot
- `src/api/ingest.ts` - REST API endpoint
- `docker-compose.yml` - Local dev setup
- `migrations/*.sql` - Database migrations

### Definition of Done
- [ ] All TypeScript files compile without errors
- [ ] Docker compose starts Postgres + app successfully
- [ ] Bot responds to all defined commands
- [ ] URL ingestion completes end-to-end
- [ ] Screenshot ingestion completes end-to-end
- [ ] RAG query returns relevant results with citations
- [ ] Queue review session works with inline buttons
- [ ] Weekly digest generates and sends

### Must Have
- grammY bot with autoRetry and rate limiting
- Per-user encryption (AES-256-GCM)
- pgvector for semantic search
- pg-boss for job queue
- Vercel AI SDK integration
- Docker compose with Python for trafilatura

### Must NOT Have (Guardrails)
- NO Telegraf (use grammY)
- NO parallel broadcast messages (sequential with delays)
- NO raw file_id for deduplication (use file_unique_id)
- NO missing await next() in middleware
- NO unhandled bot errors (global catch required)
- NO Tier 3 authenticated scraping (V2)
- NO Stripe billing (V2)
- NO Telegram Forum/Topics (V2)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (new project)
- **Automated tests**: YES (TDD)
- **Framework**: bun test
- **Pattern**: RED-GREEN-REFACTOR for each task

### QA Policy
Every task includes agent-executed QA scenarios:
- **Frontend/Telegram**: Playwright for web UI, interactive_bash (tmux) for bot testing
- **API/Backend**: Bash (curl) for endpoint testing
- **Library/Module**: Bash (bun test) for unit tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 7 parallel tasks):
├── T1: Project scaffolding + package.json [quick]
├── T2: Environment config + constants [quick]
├── T3: Database schema SQL [quick]
├── T4: Drizzle ORM schema + client [quick]
├── T5: Crypto utilities (encrypt/decrypt) [quick]
├── T6: Docker compose setup [quick]
└── T7: TypeScript config + base types [quick]

Wave 2 (AI Layer - 5 parallel tasks):
├── T8: AI client setup (Vercel AI SDK) [quick]
├── T9: Summarization service [unspecified-high]
├── T10: Embedding service [quick]
├── T11: RAG query service [deep]
└── T12: Digest generation service [unspecified-high]

Wave 3 (Ingestion - 4 parallel tasks):
├── T13: URL scraper (trafilatura + Jina fallback) [unspecified-high]
├── T14: Screenshot vision (GPT-4o) [unspecified-high]
├── T15: Metadata extractor [quick]
└── T16: Ingestion pipeline orchestrator [deep]

Wave 4 (Job Queue - 5 parallel tasks):
├── T17: pg-boss initialization [quick]
├── T18: Ingest job worker [unspecified-high]
├── T19: Notify job worker [unspecified-high]
├── T20: Digest job worker [unspecified-high]
└── T21: Schedule registration [quick]

Wave 5 (Bot Core - 6 parallel tasks):
├── T22: Bot initialization + plugins [quick]
├── T23: Auth middleware [quick]
├── T24: Session middleware + state machine [deep]
├── T25: URL/photo message handlers [unspecified-high]
├── T26: Command handlers (core: /start, /review, /ask) [deep]
└── T27: Command handlers (utility: /invite, /queue, /settings, /export, /delete_account) [unspecified-high]

Wave 6 (Bot Features - 4 parallel tasks):
├── T28: Callback handlers (inline buttons) [unspecified-high]
├── T29: Search command (/search) [unspecified-high]
├── T30: Global error handler + graceful shutdown [quick]
└── T31: Rate limiting + throttling [quick]

Wave 7 (API + Integration - 3 parallel tasks):
├── T32: REST API endpoint (/api/ingest) [quick]
├── T33: Integration: End-to-end URL flow [deep]
└── T34: Integration: End-to-end screenshot flow [deep]

Wave 8 (Browser Extension - 3 sequential tasks, lower priority):
├── T35: WXT project setup [quick]
├── T36: Extension popup UI [visual-engineering]
└── T37: Extension API integration [unspecified-high]

Wave FINAL (Verification - 4 parallel tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Manual QA - full bot flow (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T3 → T4 → T5 → T8 → T11 → T16 → T18 → T22 → T26 → T33
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 7 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| T1 | - | T2-T7, T8-T12, T13-T16 |
| T2 | T1 | T8-T12, T22-T31 |
| T3 | T1 | T4, T17-T21 |
| T4 | T3 | T17-T21, T8-T12 |
| T5 | T1, T2 | T9-T12, T13-T16, T18 |
| T6 | T1 | T3, T4 |
| T7 | T1 | All TypeScript tasks |
| T8 | T1, T2 | T9-T12, T11, T14, T16 |
| T9 | T8 | T16, T18 |
| T10 | T8 | T11, T16, T18 |
| T11 | T8, T10, T5 | T26, T29 |
| T12 | T8 | T20 |
| T13 | T1 | T16 |
| T14 | T8 | T16 |
| T15 | T1 | T16 |
| T16 | T5, T8, T9, T10, T13, T14, T15 | T18 |
| T17 | T3, T4 | T18-T21 |
| T18 | T5, T9, T10, T16, T17 | T33, T34 |
| T19 | T17 | T26 |
| T20 | T12, T17 | - |
| T21 | T17 | - |
| T22 | T1, T2 | T23-T31 |
| T23 | T4, T22 | T25-T27 |
| T24 | T4, T22 | T28 |
| T25 | T4, T5, T22, T23 | T33, T34 |
| T26 | T4, T11, T19, T22, T23 | T33 |
| T27 | T4, T22, T23 | - |
| T28 | T22, T24 | T26 |
| T29 | T4, T10, T11, T22 | - |
| T30 | T22 | - |
| T31 | T22 | - |
| T32 | T4, T5, T17 | T35 |
| T33 | T18, T25, T26 | F1-F4 |
| T34 | T18, T25 | F1-F4 |
| T35 | T32 | T36, T37 |
| T36 | T35 | T37 |
| T37 | T35, T36 | - |

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| T1 | - | T2-T7, T8-T12, T13-T16 |
| T2 | T1 | T8-T12, T22-T31 |
| T3 | T1 | T4, T17-T21 |
| T4 | T3 | T17-T21, T8-T12 |
| T5 | T1, T2 | T9-T12, T13-T16, T18 |
| T6 | T1 | T3, T4 |
| T7 | T1 | All TypeScript tasks |
| T8 | T1, T2 | T9-T12, T11, T14, T16 |
| T9 | T8 | T16, T18 |
| T10 | T8 | T11, T16, T18 |
| T11 | T8, T10, T5 | T26, T29 |
| T12 | T8 | T20 |
| T13 | T1 | T16 |
| T14 | T8 | T16 |
| T15 | T1 | T16 |
| T16 | T5, T8, T9, T10, T13, T14, T15 | T18 |
| T17 | T3, T4 | T18-T21 |
| T18 | T5, T9, T10, T16, T17 | T33, T34 |
| T19 | T17 | T26 |
| T20 | T12, T17 | - |
| T21 | T17 | - |
| T22 | T1, T2 | T23-T31 |
| T23 | T4, T22 | T25-T27 |
| T24 | T4, T22 | T28 |
| T25 | T4, T5, T22, T23 | T33, T34 |
| T26 | T4, T11, T19, T22, T23 | T33 |
| T27 | T4, T22, T23 | - |
| T28 | T22, T24 | T26 |
| T29 | T4, T10, T11, T22 | - |
| T30 | T22 | - |
| T31 | T22 | - |
| T32 | T4, T5, T17 | - |
| T33 | T18, T25, T26 | F1-F4 |
| T34 | T18, T25 | F1-F4 |

---

## TODOs

### Wave 1: Foundation (7 parallel tasks)

- [ ] 1. Project Scaffolding + Package.json

  **What to do**:
  - Initialize Bun project with `bun init`
  - Create package.json with all dependencies:
    - grammY + plugins: `grammy`, `@grammyjs/ratelimiter`, `@grammyjs/auto-retry`, `@grammyjs/transformer-throttler`, `@grammyjs/files`, `@grammyjs/menu`, `@grammyjs/session`
    - Database: `drizzle-orm`, `postgres`, `pg-boss`
    - AI: `ai` (Vercel AI SDK), `zod`
    - Utils: `hono` (API server)
  - Create directory structure per spec
  - Add scripts: `dev`, `build`, `start`, `test`, `typecheck`
  - Create .env.example

  **Must NOT do**: Don't install Telegraf, Don't add Stripe dependencies

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T2-T34, Blocked By: None

  **Acceptance Criteria**:
  - [ ] package.json exists with all dependencies
  - [ ] Directory structure matches spec
  - [ ] `bun install` succeeds

  **QA Scenarios**:
  - Tool: Bash, Run `bun install`, Expected: Exit code 0
  - Evidence: .sisyphus/evidence/task-01-install.txt

  **Commit**: NO (groups with Wave 1)

---

- [ ] 2. Environment Config + Constants

  **What to do**:
  - Create `src/config.ts` with typed env vars
  - Define: TELEGRAM_BOT_TOKEN, DATABASE_URL, AI_API_URL, AI_API_KEY, etc.
  - Add validation, export constants

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T8-T12, T22-T31, Blocked By: T1

  **Acceptance Criteria**:
  - [ ] src/config.ts exists with all env vars
  - [ ] Validation throws on missing required vars

  **Commit**: NO (groups with Wave 1)

---

- [ ] 3. Database Schema SQL

  **What to do**:
  - Create `src/db/schema.sql` with full schema
  - Tables: users, invites, items, chunks, review_sessions, credentials
  - Enable pgvector, create indexes and RLS policies

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T4, T17-T21, Blocked By: T1

  **Acceptance Criteria**:
  - [ ] All 6 tables defined
  - [ ] pgvector extension enabled
  - [ ] RLS policies defined

  **Commit**: NO (groups with Wave 1)

---

- [ ] 4. Drizzle ORM Schema + Client

  **What to do**:
  - Create `src/db/schema.ts` matching SQL
  - Create `src/db/index.ts` with client
  - Configure drizzle.config.ts

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T17-T21, Blocked By: T3

  **Acceptance Criteria**:
  - [ ] Schema matches SQL
  - [ ] TypeScript compiles

  **Commit**: NO (groups with Wave 1)

---

- [ ] 5. Crypto Utilities (Encrypt/Decrypt)

  **What to do**:
  - Create `src/crypto/index.ts`:
    - `deriveUserKey()` - HKDF key derivation
    - `encrypt()` - AES-256-GCM
    - `decrypt()` - AES-256-GCM
  - Add unit tests

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T9-T12, T13-T16, T18, Blocked By: T1, T2

  **Acceptance Criteria**:
  - [ ] HKDF key derivation works
  - [ ] AES-256-GCM encrypt/decrypt roundtrip
  - [ ] Tests pass

  **Commit**: NO (groups with Wave 1)

---

- [ ] 6. Docker Compose Setup

  **What to do**:
  - Create `docker-compose.yml` with Postgres (pgvector/pgvector:pg16)
  - Add Python + trafilatura
  - Create Dockerfile, .dockerignore

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T3, T4 (testing), Blocked By: T1

  **Acceptance Criteria**:
  - [ ] `docker compose up -d` works
  - [ ] pgvector extension available

  **Commit**: NO (groups with Wave 1)

---

- [ ] 7. TypeScript Config + Base Types

  **What to do**:
  - Create `tsconfig.json` with strict mode
  - Create `src/types/index.ts` with job payload types
  - Create `src/types/bot.ts` for grammY context

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks all TS tasks, Blocked By: T1

  **Acceptance Criteria**:
  - [ ] tsconfig.json with strict mode
  - [ ] `bun run typecheck` passes

  **Commit**: YES (Wave 1 complete)
  - Message: `feat: project scaffolding and foundation`

### Wave 2: AI Layer (5 parallel tasks)

- [ ] 8. AI Client Setup (Vercel AI SDK)

  **What to do**:
  - Create `src/ai/client.ts` with OpenAI-compatible provider
  - Use `createOpenAI` from @ai-sdk/openai
  - Configure with env vars: AI_API_URL, AI_API_KEY
  - Export chatModel and embeddingModel

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T9-T12, Blocked By: T1, T2

  **Acceptance Criteria**:
  - [ ] src/ai/client.ts exports aiProvider, chatModel, embeddingModel
  - [ ] Configurable via env vars

  **Commit**: NO (groups with Wave 2)

---

- [ ] 9. Summarization Service

  **What to do**:
  - Create `src/ai/summarize.ts`
  - Use `generateObject` with Zod schema: summary (string), tags (array), estimatedReadMins (number)
  - Accept decrypted content, return structured summary
  - Handle errors gracefully

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: [`ai-sdk`]

  **Parallelization**: Blocks T16, T18, Blocked By: T8

  **Acceptance Criteria**:
  - [ ] Returns { summary, tags, estimatedReadMins }
  - [ ] Tags: 3-7 items
  - [ ] Summary: 2-3 sentences

  **Commit**: NO (groups with Wave 2)

---

- [ ] 10. Embedding Service

  **What to do**:
  - Create `src/ai/embed.ts`
  - Use `embed()` from Vercel AI SDK with embeddingModel
  - Return vector array (1536 dimensions for text-embedding-3-small)
  - Handle batching for multiple texts

  **Recommended Agent Profile**: Category: `quick`, Skills: [`ai-sdk`]

  **Parallelization**: Blocks T11, T16, T18, Blocked By: T8

  **Acceptance Criteria**:
  - [ ] Returns number[] of length 1536
  - [ ] Handles single text embedding

  **Commit**: NO (groups with Wave 2)

---

- [ ] 11. RAG Query Service

  **What to do**:
  - Create `src/ai/rag.ts`
  - Flow: embed query → pgvector search → decrypt chunks → assemble context → streamText
  - Use cosine similarity (`<=>` operator)
  - System prompt: cite sources by title and URL
  - Support `--this-week` filter via created_at

  **Recommended Agent Profile**: Category: `deep`, Skills: [`ai-sdk`]

  **Parallelization**: Blocks T26, T29, Blocked By: T8, T10, T5

  **Acceptance Criteria**:
  - [ ] Query embedding works
  - [ ] pgvector search returns relevant chunks
  - [ ] Response includes citations
  - [ ] Filters by date when specified

  **QA Scenarios**:
  - Tool: Bash, Run RAG query with test data, Expected: Response with citations

  **Commit**: NO (groups with Wave 2)

---

- [ ] 12. Digest Generation Service

  **What to do**:
  - Create `src/ai/digest.ts`
  - Fetch week's items for user
  - Cluster by tags/topics
  - Generate summary using LLM
  - Return formatted message for Telegram

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: [`ai-sdk`]

  **Parallelization**: Blocks T20, Blocked By: T8

  **Acceptance Criteria**:
  - [ ] Clusters items by topic
  - [ ] Generates readable digest
  - [ ] Returns Telegram-formatted message

  **Commit**: YES (Wave 2 complete)
  - Message: `feat(ai): add AI layer with summarization, embedding, and RAG`

---

### Wave 3: Ingestion (4 parallel tasks)

- [ ] 13. URL Scraper (trafilatura + Jina fallback)

  **What to do**:
  - Create `src/ingestion/scraper.ts`
  - Primary: Shell exec trafilatura (Python required in Docker)
  - Fallback: Jina Reader API (GET https://r.jina.ai/{url})
  - Return extracted text, title, author
  - Handle blocklist domains (instagram.com, linkedin.com) → return partial status

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: []

  **Parallelization**: Blocks T16, Blocked By: T1

  **Acceptance Criteria**:
  - [ ] trafilatura extracts content from open URLs
  - [ ] Jina fallback works when trafilatura fails
  - [ ] Blocklist returns partial status
  - [ ] Returns { text, title, author, status }

  **QA Scenarios**:
  - Tool: Bash, Scrape test URL, Expected: Extracted content

  **Commit**: NO (groups with Wave 3)

---

- [ ] 14. Screenshot Vision (GPT-4o)

  **What to do**:
  - Create `src/ingestion/vision.ts`
  - Use GPT-4o multimodal via Vercel AI SDK
  - Prompt: extract title, author, body text, URL if visible
  - Accept base64 image or file path

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: [`ai-sdk`]

  **Parallelization**: Blocks T16, Blocked By: T8

  **Acceptance Criteria**:
  - [ ] Extracts text from screenshot
  - [ ] Returns { text, title, author, url? }

  **Commit**: NO (groups with Wave 3)

---

- [ ] 15. Metadata Extractor

  **What to do**:
  - Create `src/ingestion/metadata.ts`
  - Extract OG tags: title, description, image
  - Get canonical URL
  - Generate URL hash (SHA-256) for dedup
  - Extract domain
  - Parse published_at if available

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T16, Blocked By: T1

  **Acceptance Criteria**:
  - [ ] Extracts OG metadata
  - [ ] Generates canonical URL
  - [ ] Creates SHA-256 hash for dedup

  **Commit**: NO (groups with Wave 3)

---

- [ ] 16. Ingestion Pipeline Orchestrator

  **What to do**:
  - Create `src/ingestion/pipeline.ts`
  - Orchestrate: scrape/vision → summarize → chunk → embed → store
  - Handle encryption of content, summary, chunks
  - Support both URL and screenshot sources
  - Return item ID on success

  **Recommended Agent Profile**: Category: `deep`, Skills: [`ai-sdk`]

  **Parallelization**: Blocks T18, Blocked By: T5, T8, T9, T10, T13, T14, T15

  **Acceptance Criteria**:
  - [ ] Full pipeline completes for URL
  - [ ] Full pipeline completes for screenshot
  - [ ] All data encrypted before storage
  - [ ] Chunks embedded and stored

  **Commit**: YES (Wave 3 complete)
  - Message: `feat(ingestion): add content ingestion pipeline`

---

### Wave 4: Job Queue (5 parallel tasks)

- [ ] 17. pg-boss Initialization

  **What to do**:
  - Create `src/jobs/index.ts`
  - Initialize PgBoss with DATABASE_URL
  - Export boss instance
  - Create start/stop functions for graceful shutdown

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T18-T21, Blocked By: T3, T4

  **Acceptance Criteria**:
  - [ ] PgBoss connects to Postgres
  - [ ] start() and stop() functions work

  **Commit**: NO (groups with Wave 4)

---

- [ ] 18. Ingest Job Worker

  **What to do**:
  - Create `src/jobs/ingest.job.ts`
  - Handler: receive IngestJobPayload, run pipeline.ts
  - Update item status on completion
  - Send Telegram confirmation card on success
  - Handle errors: retry with backoff, max 3 attempts

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: []

  **Parallelization**: Blocks T33, T34, Blocked By: T5, T9, T10, T16, T17

  **Acceptance Criteria**:
  - [ ] Processes IngestJobPayload
  - [ ] Updates item scrape_status
  - [ ] Sends confirmation to user
  - [ ] Retries on failure

  **Commit**: NO (groups with Wave 4)

---

- [ ] 19. Notify Job Worker

  **What to do**:
  - Create `src/jobs/notify.job.ts`
  - Handler: create review_session, fetch pending items
  - Send first item card to user
  - Support immediate /review trigger

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: []

  **Parallelization**: Blocks T26, Blocked By: T17

  **Acceptance Criteria**:
  - [ ] Creates review_session row
  - [ ] Sends first item card
  - [ ] Works with scheduled cron

  **Commit**: NO (groups with Wave 4)

---

- [ ] 20. Digest Job Worker

  **What to do**:
  - Create `src/jobs/digest.job.ts`
  - Handler: call digest.ts, send result to user
  - Also create `digest-fanout` handler: enumerate active users, enqueue individual digest jobs

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: []

  **Parallelization**: Blocked By: T12, T17

  **Acceptance Criteria**:
  - [ ] Fanout enqueues per-user jobs
  - [ ] Individual digest generates and sends

  **Commit**: NO (groups with Wave 4)

---

- [ ] 21. Schedule Registration

  **What to do**:
  - Create `src/jobs/schedules.ts`
  - Register global cron: digest-fanout (Sunday 10AM UTC)
  - Function to register per-user queue notification schedules
  - Called at startup

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocked By: T17

  **Acceptance Criteria**:
  - [ ] Global digest schedule registered
  - [ ] Per-user schedule registration works

  **Commit**: YES (Wave 4 complete)
  - Message: `feat(jobs): add pg-boss job queue workers`

---

### Wave 5: Bot Core (6 parallel tasks)

- [ ] 22. Bot Initialization + Plugins

  **What to do**:
  - Create `src/bot/index.ts`
  - Initialize grammY bot with token
  - Apply plugins: autoRetry, apiThrottler, rateLimiter
  - Export bot instance and start function
  - Register global error handler with bot.catch()

  **Must do**:
  - Use @grammyjs/auto-retry for 429 handling
  - Use @grammyjs/transformer-throttler for API limits
  - Use @grammyjs/ratelimiter for user-level limits

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T23-T31, Blocked By: T1, T2

  **Acceptance Criteria**:
  - [ ] Bot initializes with all plugins
  - [ ] autoRetry configured
  - [ ] Rate limiting active
  - [ ] Global error handler set

  **Commit**: NO (groups with Wave 5)

---

- [ ] 23. Auth Middleware

  **What to do**:
  - Create `src/bot/middleware/auth.ts`
  - Check telegram_id exists in users table (deleted_at IS NULL)
  - Attach user to context
  - Reject unauthorized users with friendly message

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocks T25-T27, Blocked By: T4, T22

  **Acceptance Criteria**:
  - [ ] Authorized users proceed
  - [ ] Unauthorized users get rejection message
  - [ ] User attached to context

  **Commit**: NO (groups with Wave 5)

---

- [ ] 24. Session Middleware + State Machine

  **What to do**:
  - Create `src/bot/session.ts`
  - In-memory Map<userId, SessionState> for active review sessions
  - SessionState: sessionId, itemIds[], currentIndex, startedAt
  - Functions: startSession, endSession, nextItem, getCurrentItem

  **Recommended Agent Profile**: Category: `deep`, Skills: []

  **Parallelization**: Blocks T28, Blocked By: T4, T22

  **Acceptance Criteria**:
  - [ ] Session state tracked in memory
  - [ ] nextItem advances correctly
  - [ ] endSession clears state

  **Commit**: NO (groups with Wave 5)

---

- [ ] 25. URL/Photo Message Handlers

  **What to do**:
  - Create `src/bot/handlers/ingest.ts`
  - `on('message:url')`: extract URL, parseInlineIntent, insert item, enqueue ingest job
  - `on('message:photo')`: get largest photo, download, insert item with sourceType='screenshot', enqueue
  - Parse inline intent ('now', 'today', 'asap') for immediate notification

  **Must do**:
  - Use file_unique_id for deduplication
  - Download photos within 1 hour (URL expiry)

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: []

  **Parallelization**: Blocks T33, T34, Blocked By: T4, T5, T22, T23

  **Acceptance Criteria**:
  - [ ] URLs trigger ingest job
  - [ ] Photos trigger vision pipeline
  - [ ] Inline intent parsed correctly

  **Commit**: NO (groups with Wave 5)

---

- [ ] 26. Command Handlers (Core: /start, /review, /ask)

  **What to do**:
  - Create `src/bot/commands/start.ts`: onboarding flow, timezone prompt, schedule prompt, generate api_token
  - Create `src/bot/commands/review.ts`: trigger notify job immediately
  - Create `src/bot/commands/ask.ts`: RAG query, support --this-week flag

  **Recommended Agent Profile**: Category: `deep`, Skills: []

  **Parallelization**: Blocks T33, Blocked By: T4, T11, T19, T22, T23

  **Acceptance Criteria**:
  - [ ] /start creates user, collects preferences
  - [ ] /review starts immediate session
  - [ ] /ask returns RAG response with citations

  **Commit**: NO (groups with Wave 5)

---

- [ ] 27. Command Handlers (Utility: /invite, /queue, /settings, /export, /delete_account)

  **What to do**:
  - Create `src/bot/commands/invite.ts`: generate 48h single-use token
  - Create `src/bot/commands/queue.ts`: show pending items grouped by week
  - Create `src/bot/commands/settings.ts`: sub-commands for intent, schedule, timezone
  - Create `src/bot/commands/export.ts`: send JSON file of all items
  - Create `src/bot/commands/delete_account.ts`: confirmation, then hard delete

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: []

  **Parallelization**: Blocked By: T4, T22, T23

  **Acceptance Criteria**:
  - [ ] All commands work as specified
  - [ ] Delete requires confirmation

  **Commit**: YES (Wave 5 complete)
  - Message: `feat(bot): add Telegram bot core`

---

### Wave 6: Bot Features (4 parallel tasks)

- [ ] 28. Callback Handlers (Inline Buttons)

  **What to do**:
  - Create `src/bot/handlers/callbacks.ts`
  - Handle callback_data format: `session:{action}:{sessionId}`
  - Actions: done, skip, remove, open, reschedule
  - Update item review_status, session counters
  - Show next item or completion message

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: []

  **Parallelization**: Blocked By: T22, T24

  **Acceptance Criteria**:
  - [ ] Done marks item reviewed, advances
  - [ ] Skip keeps pending, advances
  - [ ] Remove deletes item
  - [ ] Reschedule shows schedule picker

  **Commit**: NO (groups with Wave 6)

---

- [ ] 29. Search Command (/search)

  **What to do**:
  - Create `src/bot/commands/search.ts`
  - Hybrid search: keyword + vector similarity
  - Return top 5 cards with title, summary snippet, URL
  - Use inline buttons for pagination

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: []

  **Parallelization**: Blocked By: T4, T10, T11, T22

  **Acceptance Criteria**:
  - [ ] Returns top 5 results
  - [ ] Hybrid ranking works
  - [ ] Pagination functional

  **Commit**: NO (groups with Wave 6)

---

- [ ] 30. Global Error Handler + Graceful Shutdown

  **What to do**:
  - Create `src/bot/error-handler.ts`
  - bot.catch() handler: log error, send user-friendly message
  - SIGINT/SIGTERM listeners: stop bot, stop pg-boss, close DB connections
  - Ensure no hanging connections on shutdown

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocked By: T22

  **Acceptance Criteria**:
  - [ ] All errors caught and logged
  - [ ] Graceful shutdown completes cleanly
  - [ ] No hanging processes

  **Commit**: NO (groups with Wave 6)

---

- [ ] 31. Rate Limiting + Throttling

  **What to do**:
  - Configure @grammyjs/ratelimiter: 3 messages/second per user
  - Configure @grammyjs/transformer-throttler: 30 requests/second globally
  - Add custom rate limit message

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocked By: T22

  **Acceptance Criteria**:
  - [ ] User rate limiting active
  - [ ] Global throttling active
  - [ ] Rate limit message shown

  **Commit**: YES (Wave 6 complete)
  - Message: `feat(bot): add bot features and error handling`

---

### Wave 7: API + Integration (3 parallel tasks)

- [ ] 32. REST API Endpoint (/api/ingest)

  **What to do**:
  - Create `src/api/ingest.ts` using Hono
  - POST /api/ingest: accept { url, sourceLabel? }
  - Auth: Bearer token, validate against api_token_hash in DB
  - Insert item, enqueue ingest job
  - Return { itemId, status: 'queued' }

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocked By: T4, T5, T17

  **Acceptance Criteria**:
  - [ ] Endpoint accepts URL
  - [ ] Token auth works
  - [ ] Returns itemId on success

  **QA Scenarios**:
  - Tool: Bash (curl), POST with valid token, Expected: { itemId, status: 'queued' }

  **Commit**: NO (groups with Wave 7)

---

- [ ] 33. Integration: End-to-end URL Flow

  **What to do**:
  - Create `src/__tests__/e2e/url-flow.test.ts`
  - Test: send URL to bot → verify item created → verify ingest job runs → verify confirmation received
  - Mock external services (AI, scraping) or use test fixtures

  **Recommended Agent Profile**: Category: `deep`, Skills: []

  **Parallelization**: Blocks F1-F4, Blocked By: T18, T25, T26

  **Acceptance Criteria**:
  - [ ] Full URL flow passes
  - [ ] Item stored with encrypted content
  - [ ] Embeddings created

  **Commit**: NO (groups with Wave 7)

---

- [ ] 34. Integration: End-to-end Screenshot Flow

  **What to do**:
  - Create `src/__tests__/e2e/screenshot-flow.test.ts`
  - Test: send photo to bot → verify vision extraction → verify item created → verify confirmation received

  **Recommended Agent Profile**: Category: `deep`, Skills: []

  **Parallelization**: Blocks F1-F4, Blocked By: T18, T25

  **Acceptance Criteria**:
  - [ ] Full screenshot flow passes
  - [ ] Vision extraction works
  - [ ] Item stored correctly

  **Commit**: YES (Wave 7 complete)
  - Message: `feat(api): add REST endpoint and integration tests`

---

### Wave 8: Browser Extension (Lower Priority, uses WXT)

- [ ] 35. WXT Project Setup

  **What to do**:
  - Initialize WXT project in `extension/` directory
  - Configure for Manifest V3
  - Set up TypeScript
  - Add build scripts to root package.json

  **References**:
  - WXT docs: https://wxt.dev/guide/essentials/getting-started.html

  **Recommended Agent Profile**: Category: `quick`, Skills: []

  **Parallelization**: Blocked By: T32

  **Acceptance Criteria**:
  - [ ] WXT project initialized
  - [ ] TypeScript configured
  - [ ] Build works: `bun run build:extension`

  **Commit**: NO (groups with extension)

---

- [ ] 36. Extension Popup UI

  **What to do**:
  - Create popup.html with minimal UI
  - Show current tab URL
  - Add "Save to CIB" button
  - Add source label input (optional)
  - Style with Tailwind or basic CSS

  **Recommended Agent Profile**: Category: `visual-engineering`, Skills: []

  **Parallelization**: Blocked By: T35

  **Acceptance Criteria**:
  - [ ] Popup shows current tab URL
  - [ ] Save button triggers API call
  - [ ] Shows success/error feedback

  **Commit**: NO (groups with extension)

---

- [ ] 37. Extension API Integration

  **What to do**:
  - Store user's API token in extension storage
  - Call POST /api/ingest with token
  - Handle auth errors (prompt for token)
  - Handle network errors gracefully

  **Recommended Agent Profile**: Category: `unspecified-high`, Skills: []

  **Parallelization**: Blocked By: T35, T36

  **Acceptance Criteria**:
  - [ ] Token stored securely
  - [ ] API calls work
  - [ ] Error handling complete

  **Commit**: YES (Extension complete)
  - Message: `feat(extension): add browser extension with WXT`

---


## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, unused imports.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Manual QA - Full Bot Flow** — `unspecified-high`
  Start bot in Docker. Execute full flow: /start → send URL → wait for processing → /ask query → /review session → verify digest.
  Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat: project scaffolding and foundation` — all Wave 1 files
- **Wave 2**: `feat(ai): add AI layer with summarization, embedding, and RAG` — src/ai/*
- **Wave 3**: `feat(ingestion): add content ingestion pipeline` — src/ingestion/*
- **Wave 4**: `feat(jobs): add pg-boss job queue workers` — src/jobs/*
- **Wave 5**: `feat(bot): add Telegram bot core` — src/bot/*
- **Wave 6**: `feat(bot): add bot features and error handling` — src/bot/* updates
- **Wave 7**: `feat(api): add REST endpoint and integration tests` — src/api/*, tests
- **Wave 8**: `feat(extension): add browser extension with WXT` — extension/*
- **Final**: `chore: final cleanup and verification` — misc

---

## Success Criteria

### Verification Commands
```bash
# Type check
bun run typecheck  # Expected: no errors

# Tests
bun test  # Expected: all pass

# Docker
docker compose up -d  # Expected: Postgres + app running

# Bot health
curl http://localhost:3000/health  # Expected: {"status":"ok"}
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Bot responds to all commands
- [ ] End-to-end URL flow works
- [ ] End-to-end screenshot flow works
- [ ] RAG query returns results with citations
- [ ] Queue review session works
- [ ] Weekly digest sends
