import { db } from '../db';
import { items, chunks } from '../db/schema';
import { CHUNK_SIZE, CHUNK_OVERLAP } from '../config';
import { encrypt } from '../crypto';
import { summarizeContent } from '../ai/summarize';
import { embedTexts } from '../ai/embed';
import { scrapeContent } from './scraper';
import { extractFromImage } from './vision';
import { extractMetadata, type Metadata } from './metadata';
import { eq } from 'drizzle-orm';

export interface PipelineSource {
  type: 'url' | 'screenshot';
  content: string;
}

export interface PipelineOptions {
  inlineIntent?: string;
}

/**
 * Run the complete ingestion pipeline for URL or screenshot content
 * @param userId - User ID for the item
 * @param source - Source content (URL or screenshot)
 * @param options - Optional inline intent
 * @returns The created item ID
 */
export async function runIngestionPipeline(
  userId: string,
  source: PipelineSource,
  options?: PipelineOptions
): Promise<string> {
  let text: string;
  let title: string | undefined;
  let author: string | undefined;
  let url: string;
  let canonicalUrl: string;
  let urlHash: string;
  let domain: string;
  let publishedAt: Date | undefined;
  let image: string | undefined;

  // Step 1: Extract content and metadata
  if (source.type === 'url') {
    // URL-based ingestion
    url = source.content;

    // Extract metadata
    const metadata: Metadata = await extractMetadata(url);
    canonicalUrl = metadata.canonicalUrl;
    urlHash = metadata.urlHash;
    domain = metadata.domain;
    title = metadata.title;
    image = metadata.image;
    publishedAt = metadata.publishedAt;

    // Scrape content
    const scrapeResult = await scrapeContent(url);
    text = scrapeResult.text;

    // Use scrape metadata if metadata extraction didn't find these
    if (!title && scrapeResult.title) {
      title = scrapeResult.title;
    }
    if (!author && scrapeResult.author) {
      author = scrapeResult.author;
    }
  } else {
    // Screenshot-based ingestion
    const screenshotPath = source.content;

    // Extract text from image
    const visionResult = await extractFromImage(screenshotPath);
    text = visionResult.text;
    title = visionResult.title;
    author = visionResult.author;

    // Generate URL and hash for screenshots (use a placeholder URL)
    url = `screenshot://${Date.now()}`;
    canonicalUrl = url;
    urlHash = Buffer.from(url).toString('base64');
    domain = 'screenshot';
    publishedAt = undefined;
  }

  // Step 2: Summarize content
  const summaryResult = await summarizeContent(text);
  const summary = summaryResult.summary;
  const tags = summaryResult.tags;
  const estimatedReadMins = summaryResult.estimatedReadMins;

  // Step 3: Chunk text
  const textChunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);

  // Step 4: Get user encryption key (mock for now - should come from user context)
  // In a real implementation, you'd fetch the user's salt and derive the key
  const masterSecret = Buffer.from(process.env.ENCRYPTION_MASTER_SECRET || '', 'hex').slice(0, 32);
  const encKeySalt = Buffer.from(process.env.ENCRYPTION_MASTER_SECRET || '', 'hex').slice(0, 16);
  
  // Import deriveUserKey from crypto
  const { deriveUserKey } = await import('../crypto');
  const userKey = deriveUserKey(masterSecret, encKeySalt);

  // Step 5: Encrypt sensitive data
  const contentEnc = encrypt(text, userKey).toString('base64');
  const summaryEnc = encrypt(summary, userKey).toString('base64');
  const chunkEncs = textChunks.map(chunk => encrypt(chunk, userKey).toString('base64'));

  // Step 6: Generate embeddings for chunks
  const embeddings = await embedTexts(textChunks);

  // Step 7: Store item in DB
  const [item] = await db
    .insert(items)
    .values({
      userId,
      url,
      canonicalUrl,
      urlHash,
      domain,
      title,
      author,
      publishedAt,
      estimatedReadMins,
      tags,
      sourceSurface: source.type,
      scrapeStatus: 'completed',
      contentEnc,
      summaryEnc,
      reviewStatus: 'pending',
    })
    .returning();

  if (!item) {
    throw new Error('Failed to create item');
  }

  const itemId = item.id;

  // Step 8: Store chunks with embeddings
  await db.insert(chunks).values(
    chunkEncs.map((contentEnc, index) => ({
      itemId,
      userId,
      chunkIndex: index,
      contentEnc,
      embedding: embeddings[index],
    }))
  );

  return itemId;
}

/**
 * Chunk text into overlapping segments
 * @param text - Input text to chunk
 * @param chunkSize - Maximum size of each chunk
 * @param overlap - Overlap between chunks
 * @returns Array of text chunks
 */
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let index = 0;

  // Split by sentences to avoid breaking in the middle of a sentence
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();

    // If adding this sentence would exceed chunk size, save current chunk
    if (currentChunk.length + trimmedSentence.length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }

      // Start new chunk with overlap from previous chunk
      if (chunks.length > 0) {
        const lastChunk = chunks[chunks.length - 1] || '';
        const lastSentences = lastChunk.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
        let overlapChunk = '';
        let overlapLength = 0;

        // Take sentences from the end until we reach overlap size
        for (let i = lastSentences.length - 1; i >= 0; i--) {
          const lastSentence = lastSentences[i];
          if (!lastSentence) continue;
          const sentenceLen = lastSentence.trim().length;
          if (overlapLength + sentenceLen <= overlap) {
            overlapChunk = lastSentence.trim() + ' ' + overlapChunk;
          } else {
            break;
          }
        }

        currentChunk = overlapChunk + trimmedSentence + ' ';
      } else {
        currentChunk = trimmedSentence + ' ';
      }
    } else {
      currentChunk += trimmedSentence + ' ';
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Check if a URL has already been ingested by a user
 * @param userId - User ID
 * @param urlHash - Hash of the URL to check
 * @returns Boolean indicating if the URL exists
 */
export async function checkUrlExists(userId: string, urlHash: string): Promise<boolean> {
  const result = await db
    .select()
    .from(items)
    .where(eq(items.userId, userId))
    .limit(1);

  return result.some(item => item.urlHash === urlHash);
}
