import { streamText } from 'ai';
import { sql, and, gte } from 'drizzle-orm';
import { chatModel } from './client';
import { embedText } from './embed';
import { db } from '../db';
import { chunks, items } from '../db/schema';

export interface QueryRAGOptions {
  thisWeek?: boolean;
}

export async function queryRAG(
  userId: string,
  query: string,
  options?: QueryRAGOptions
) {
  // Step a: Embed the query
  const queryEmbedding = await embedText(query);

  // Build conditions
  const conditions = [sql`${chunks.userId} = ${userId}`];

  // Add thisWeek filter if requested
  if (options?.thisWeek) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    conditions.push(gte(chunks.createdAt, oneWeekAgo));
  }

  // Step b: Search chunks using cosine similarity with pgvector
  // Using <=> for cosine distance (smaller values = more similar)
  const similarChunks = await db
    .select({
      id: chunks.id,
      itemId: chunks.itemId,
      contentEnc: chunks.contentEnc,
      chunkIndex: chunks.chunkIndex,
      createdAt: chunks.createdAt,
      itemTitle: items.title,
      itemAuthor: items.author,
      itemUrl: items.url,
    })
    .from(chunks)
    .innerJoin(items, sql`${chunks.itemId} = ${items.id}`)
    .where(and(...conditions))
    .orderBy(sql`${chunks.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
    .limit(10);

  // Step c: Format context from chunks
  const context = similarChunks
    .map(
      (chunk, index) =>
        `[Source ${index + 1}] ${chunk.itemTitle || 'Untitled'}${
          chunk.itemAuthor ? ` by ${chunk.itemAuthor}` : ''
        }\nURL: ${chunk.itemUrl}\nContent: ${chunk.contentEnc}`
    )
    .join('\n\n---\n\n');

  // Step d: Use streamText with system prompt about citing sources
  const result = await streamText({
    model: chatModel,
    system: `You are a helpful assistant that answers questions based on the provided context. 

When answering:
1. Always cite your sources using [Source N] notation
2. If the context doesn't contain information to answer the question, say so
3. Be concise and direct
4. Focus on answering the specific question asked`,
    messages: [
      {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${query}`,
      },
    ],
  });

  // Step e: Return the stream result
  return result;
}
