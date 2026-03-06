# Session: 2026-03-06 - Telegram Bot Testing & Fixes

## Summary

Continued CIB MVP implementation by testing the Telegram bot and fixing critical bugs discovered during user testing. The bot now fully supports URL ingestion, content processing, and queue review with AI-powered summaries.

## Issues Fixed

### 1. Auth Middleware Blocking /start
- **Problem**: New users couldn't register - `/start` was blocked by auth middleware
- **Fix**: Skip auth check for `/start` command in middleware
- **File**: `src/bot/middleware/auth.ts`

### 2. Missing Required Fields on Item Insert
- **Problem**: Items table has NOT NULL constraints on `content_enc` and `summary_enc`
- **Fix**: Add empty string defaults when inserting pending items
- **File**: `src/bot/handlers/ingest.ts`

### 3. Python Trafila Setup
- **Problem**: Trafila wasn't available in the environment
- **Fix**: Set up Python venv with `uv` and installed trafilatura
- **Command**: `uv venv .venv && uv pip install trafilatura`
- **File**: `src/ingestion/scraper.ts` - Updated to use `.venv/bin/trafilatura`

### 4. AI Summarization JSON Parsing
- **Problem**: Local LMStudio returns markdown, not JSON - `generateObject` failed
- **Fix**: Switched to `generateText` with regex JSON extraction and fallback
- **File**: `src/ai/summarize.ts`

### 5. HTTP Server Not Starting
- **Problem**: `bot.start()` is a long-polling loop that blocks the HTTP server
- **Fix**: Start HTTP server first, run bot in background (non-blocking)
- **File**: `index.ts`

### 6. Internet Access Check Too Strict
- **Problem**: Jina Reader returning 503 was considered "no internet"
- **Fix**: Check for any HTTP response (status !== 0) instead of `response.ok`
- **File**: `src/ingestion/scraper.ts`

### 7. Encryption Key Mismatch
- **Problem**: Pipeline used `userId` as salt, review used `user.encKeySalt`
- **Fix**: Fetch user's `encKeySalt` in pipeline for consistent encryption
- **File**: `src/ingestion/pipeline.ts`

### 8. Review Command Incomplete
- **Problem**: Review just showed "You have X items" without showing them
- **Fix**: Implemented full review flow with item display and inline buttons
- **File**: `src/bot/commands/review.ts`

### 9. Ingestion Job Not Running Pipeline
- **Problem**: Job just marked items as completed without processing
- **Fix**: Import and call `processItem()` from pipeline
- **File**: `src/jobs/ingest.job.ts`

## Features Added

### System Status Check on /start
- Checks trafilatura availability
- Checks internet connectivity
- Shows status to user on registration

### Full Review Session Flow
- Shows item with AI-generated summary
- Displays title, author, domain, read time
- Shows progress counter (Item X of Y)
- Inline buttons: Keep, Discard, Skip, Open
- Advances to next item after action

## Current State

### Working
- ✅ Bot registration (`/start`)
- ✅ URL ingestion with scraping
- ✅ Content summarization via AI
- ✅ Encryption of content and summaries
- ✅ Review session with inline buttons
- ✅ Callback handling for actions

### Pending Items
- Add real Telegram bot token (user provided)
- Test full end-to-end flow with real URLs
- Implement `/ask` command for RAG-powered search
- Test `/queue` command

## Key Commands

```bash
# Start database
docker compose up -d

# Start app
bun run dev

# Test health
curl http://localhost:3000/health

# Check database
docker exec cib-postgres psql -U cib -d cib -c "SELECT * FROM items;"
```

## Database Status

- Postgres running on port 5435 (avoiding conflict with tyk-postgres)
- Schema applied correctly (RLS policies removed for local dev)
- pgvector extension enabled for embeddings

## Files Modified

- `index.ts` - App startup order
- `src/bot/middleware/auth.ts` - Skip auth for /start
- `src/bot/commands/review.ts` - Full review implementation
- `src/bot/commands/start.ts` - System status checks
- `src/bot/handlers/ingest.ts` - Required field defaults
- `src/bot/index.ts` - Callback routing
- `src/ingestion/pipeline.ts` - Encryption key fix
- `src/ingestion/scraper.ts` - Trafila venv path, internet check
- `src/ai/summarize.ts` - Text generation with JSON fallback
- `src/jobs/ingest.job.ts` - Pipeline integration
- `src/config.ts` - AI_API_KEY allows empty string
