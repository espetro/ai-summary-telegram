import { generateText } from 'ai';
import { chatModel } from './client';

export interface SummaryResult {
  summary: string;
  tags: string[];
  estimatedReadMins: number;
}

export async function summarizeContent(content: string): Promise<SummaryResult> {
  const result = await generateText({
    model: chatModel,
    prompt: `Summarize the following content. Respond with ONLY a valid JSON object (no markdown, no code blocks) in this exact format:
{"summary": "2-3 sentence summary here", "tags": ["tag1", "tag2", "tag3"], "estimatedReadMins": 5}

Content to summarize:
${content.slice(0, 8000)}`,
  });

  const text = result.text.trim();
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Unable to generate summary',
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 7) : ['untagged'],
      estimatedReadMins: typeof parsed.estimatedReadMins === 'number' ? parsed.estimatedReadMins : 5,
    };
  } catch {
    return {
      summary: text.slice(0, 500) || 'Unable to generate summary',
      tags: ['untagged'],
      estimatedReadMins: 5,
    };
  }
}
