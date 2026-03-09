# Session: 2026-03-07 - Scraping Pipeline Fix & Regenerate Command

## Summary

Fixed critical scraping pipeline bug causing items to remain stuck at `pending` status. The root cause was an embedding dimension mismatch between the database schema and the local embedding model. Also improved the summarize prompt and added a `/regenerate` command for re-generating AI summaries.

## Issues Fixed

### 1. Scraping Stuck at Pending Status
- **Problem**: Items sent to Telegram bot remained at `scrapeStatus: 'pending'` indefinitely
- **Root Cause**: Database schema expected 1536-dimension embeddings, but local model (`text-embedding-nomic-embed-text-v2-moe`) produces 768-dimension embeddings
- **Symptom**: Chunk insertion failed silently with vector dimension error
- **Fix**: 
  - Altered DB column: `ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(768)`
  - Updated schema: `src/db/schema.ts` - changed dimensions from 1536 to 768
  - Updated config: `src/config.ts` - `EMBEDDING_DIMENSIONS = 768`

### 2. Trafilatura JSON Parsing Error
- **Problem**: Main scraper crashed with "JSON Parse error: Unexpected EOF" on some URLs
- **Root Cause**: `.json()` helper threw when trafilatura returned error output or empty response
- **Fix**: Capture raw output first, check for errors, then parse JSON manually
- **File**: `src/ingestion/scraper.ts`

### 3. Improved Error Handling in Scraper
- **Problem**: No visibility into why trafilatura was failing
- **Fix**: Check exit code and raw output before JSON parsing, surface actual error messages
- **Result**: Now gracefully falls back to Jina Reader when trafilatura fails

## Features Added

### 1. Enhanced Summarize Prompt
- **File**: `src/ai/summarize.ts`
- **Changes**:
  - Summary now generates exactly **3 bullet points** (key takeaways)
  - Tags include:
    - **dataType**: source format (article, x-post, instagram-post, youtube-video, etc.)
    - **contentType**: subject domain (development, leadership, finance, career, ai-ml, etc.)
    - **2-4 topic-specific tags**
  - Extracted prompt into `SUMMARY_PROMPT` constant for maintainability

### 2. `/regenerate` Command
- **File**: `src/bot/commands/regenerate.ts`
- **Usage**:
  - `/regenerate` - Regenerates summary for item #1 (logs "No index provided")
  - `/regenerate 3` - Regenerates summary for item #3
- **Flow**:
  1. Parses optional index argument (defaults to 1, logs when defaulted)
  2. Validates index is within queue range
  3. Decrypts item content using user's encryption key
  4. Calls `summarizeContent()` with new prompt format
  5. Encrypts and saves new summary to DB
  6. Displays regenerated summary with tags and read time
- **Registered**: `src/bot/index.ts` line 51
- **Help text**: Updated to include `/regenerate [index]`

## Scraper Status

| Scraper | Status | Notes |
|---------|--------|-------|
| **Jina Reader (fallback)** | ✅ Working | Returns full content from most URLs |
| **Trafilatura (main)** | ⚠️ Site-specific | Fails with "ERROR: file size" for some sites (e.g., danluu.com) but works for others (Wikipedia) |

The fallback mechanism ensures content is always captured even when trafilatura fails.

## Verification

```bash
# Test scraper directly
bun -e '
import { scrapeContent } from "./src/ingestion/scraper";
const result = await scrapeContent("https://example.com");
console.log("Status:", result.status, "Length:", result.text.length);
'

# Test full pipeline
bun -e '
import { processItem } from "./src/ingestion/pipeline";
await processItem("75ace3a1-d7e7-4d52-adb5-1f142e0ccb0c");
console.log("✅ Pipeline works");
'

# Check item status in DB
bun -e '
import { db } from "./src/db";
import { items } from "./src/db/schema";
import { desc } from "drizzle-orm";
const all = await db.select().from(items).orderBy(desc(items.createdAt)).limit(5);
all.forEach(i => console.log(i.scrapeStatus, i.title));
'
```

## Files Modified

- `src/db/schema.ts` - Embedding dimensions 1536 → 768
- `src/config.ts` - EMBEDDING_DIMENSIONS constant updated
- `src/ingestion/scraper.ts` - Improved error handling, raw output parsing
- `src/ai/summarize.ts` - New prompt format with bullet points and structured tags
- `src/bot/commands/regenerate.ts` - New command file
- `src/bot/index.ts` - Registered `/regenerate` command, updated help text

## Database Changes

```sql
-- Applied migration (manual)
ALTER TABLE chunks 
ALTER COLUMN embedding TYPE vector(768)
USING embedding::vector(768);
```

## Current State

### Working
- ✅ URL ingestion and scraping (with fallback)
- ✅ Content processing pipeline
- ✅ Embedding generation and storage
- ✅ AI summarization with new format
- ✅ `/regenerate` command

### Known Limitations
- Trafilatura fails on some sites (works as designed - falls back to Jina)
- Embedding dimensions hardcoded to match local model (768)
