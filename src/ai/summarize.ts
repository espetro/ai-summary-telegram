import { generateObject } from 'ai';
import { z } from 'zod';
import { chatModel } from './client';

const summarySchema = z.object({
  summary: z.string().describe('2-3 sentence summary of the content'),
  tags: z.array(z.string()).min(3).max(7),
  estimatedReadMins: z.number().int().min(1),
});

export async function summarizeContent(content: string) {
  const result = await generateObject({
    model: chatModel,
    schema: summarySchema,
    prompt: `Summarize this content:\n\n${content}`,
  });

  return result.object;
}
