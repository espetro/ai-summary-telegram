import { db } from '../db';
import { items, chunks, users } from '../db/schema';
import { CHUNK_SIZE, CHUNK_OVERLAP } from '../config';
import { encrypt, deriveUserKey } from '../crypto';
import { summarizeContent } from '../ai/summarize';
import { embedTexts } from '../ai/embed';
import { scrapeContent } from './scraper';
import { eq } from 'drizzle-orm';

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const result: string[] = [];

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();

    if (currentChunk.length + trimmedSentence.length > chunkSize) {
      if (currentChunk) {
        result.push(currentChunk.trim());
      }

      if (result.length > 0) {
        const lastChunk = result[result.length - 1] || '';
        const lastSentences = lastChunk.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
        let overlapChunk = '';
        let overlapLength = 0;

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

  if (currentChunk.trim()) {
    result.push(currentChunk.trim());
  }

  return result;
}

export async function processItem(itemId: string): Promise<void> {
  const itemResult = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (itemResult.length === 0) {
    throw new Error(`Item ${itemId} not found`);
  }
  const item = itemResult[0];
  if (!item) {
    throw new Error(`Item ${itemId} not found`);
  }

  const userResult = await db.select().from(users).where(eq(users.id, item.userId)).limit(1);
  if (userResult.length === 0) {
    throw new Error(`User ${item.userId} not found`);
  }
  const user = userResult[0];
  if (!user) {
    throw new Error(`User ${item.userId} not found`);
  }

  const scrapeResult = await scrapeContent(item.url);
  const text = scrapeResult.text;
  const title = scrapeResult.title || item.title
  const author = scrapeResult.author

  if (!text || text.trim().length < 10) {
    throw new Error('No meaningful content extracted from URL');
  }

  const summaryResult = await summarizeContent(text)
  const summary = summaryResult.summary
  const tags = summaryResult.tags
  const estimatedReadMins = summaryResult.estimatedReadMins

  const textChunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP)

  const masterSecret = Buffer.from(process.env.ENCRYPTION_MASTER_SECRET || '', 'hex').slice(0, 32)
  const userKey = deriveUserKey(masterSecret, Buffer.from(user.encKeySalt, 'hex'))

  const contentEnc = encrypt(text, userKey).toString('base64')
  const summaryEnc = encrypt(summary, userKey).toString('base64')
  const chunkEncs = textChunks.map((chunk: string) => encrypt(chunk, userKey).toString('base64'))

  const embeddings = await embedTexts(textChunks)

  await db
    .update(items)
    .set({
      title,
      author,
      estimatedReadMins,
      tags,
      contentEnc,
      summaryEnc,
      scrapeStatus: 'completed',
    })
    .where(eq(items.id, itemId))

  if (chunkEncs.length > 0) {
    await db.insert(chunks).values(
      chunkEncs.map((contentEnc, index) => ({
        itemId,
        userId: item.userId,
        chunkIndex: index,
        contentEnc,
        embedding: embeddings[index],
      }))
    )
  }
}