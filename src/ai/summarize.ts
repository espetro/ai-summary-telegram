import { generateText } from 'ai';
import { chatModel } from './client';

export interface SummaryResult {
  summary: string;
  tags: string[];
  estimatedReadMins: number;
}

const SUMMARY_PROMPT = `Analyze the following content and respond with ONLY a valid JSON object (no markdown, no code blocks) in this exact format:
{"summary": "• Key takeaway 1\\n• Key takeaway 2\\n• Key takeaway 3", "tags": ["dataType", "contentType", "topic1", "topic2"], "estimatedReadMins": 5}

Requirements:
- summary: Exactly 3 bullet points (use \\n between each), each capturing a distinct key takeaway from the content
- tags: 4-6 tags total, must include:
  - dataType: the source format (article, x-post, instagram-post, youtube-video, reddit-post, github-readme, newsletter, screenshot, pdf, etc.)
  - contentType: the subject domain (development, leadership, finance, career, ai-ml, design, productivity, science, business, marketing, etc.)
  - 2-4 additional topic-specific tags relevant to the content
- estimatedReadMins: estimated reading time in whole minutes (integer, based on content length)

Content to analyze:`;

export async function summarizeContent(content: string): Promise<SummaryResult> {
  const result = await generateText({
    model: chatModel,
    prompt: `${SUMMARY_PROMPT}\n${content.slice(0, 8000)}`,
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
