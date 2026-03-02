import { embed } from 'ai';
import { embeddingModel } from './client';

export async function embedText(text: string): Promise<number[]> {
  const result = await embed({ model: embeddingModel, value: text });
  return result.embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const results = await Promise.all(texts.map(text => embed({ model: embeddingModel, value: text })));
  return results.map(r => r.embedding);
}
