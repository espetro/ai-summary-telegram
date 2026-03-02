import { generateText } from 'ai';
import { chatModel } from './client';
import { db } from '../db';
import { items } from '../db/schema';
import { and, gte, eq } from 'drizzle-orm';

export interface DigestItem {
  id: string;
  title: string | null;
  url: string;
  tags: string[];
  createdAt: Date;
}

export interface DigestGroup {
  tag: string;
  items: DigestItem[];
}

export async function generateDigest(userId: string): Promise<string | null> {
  // Calculate date 7 days ago
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Fetch items from last 7 days for user
  const userItems = await db
    .select({
      id: items.id,
      title: items.title,
      url: items.url,
      tags: items.tags,
      createdAt: items.createdAt,
    })
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        gte(items.createdAt, sevenDaysAgo)
      )
    );

  // If no items, return null
  if (userItems.length === 0) {
    return null;
  }

  // Group items by tags
  const groupedItems = groupItemsByTags(userItems);

  // Create prompt for AI to generate digest
  const prompt = createDigestPrompt(groupedItems);

  // Use generateText to create weekly digest
  const { text } = await generateText({
    model: chatModel,
    prompt,
    system: 'You are a helpful assistant that creates concise, informative weekly digests of content items. Group items by topic and provide brief summaries.',
  });

  return text;
}

function groupItemsByTags(items: DigestItem[]): DigestGroup[] {
  const tagMap = new Map<string, DigestItem[]>();

  for (const item of items) {
    if (item.tags.length > 0) {
      for (const tag of item.tags) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, []);
        }
        tagMap.get(tag)!.push(item);
      }
    } else {
      // Items without tags go to "Uncategorized"
      if (!tagMap.has('Uncategorized')) {
        tagMap.set('Uncategorized', []);
      }
      tagMap.get('Uncategorized')!.push(item);
    }
  }

  // Convert map to array
  const groups: DigestGroup[] = [];
  for (const [tag, items] of Array.from(tagMap.entries())) {
    groups.push({ tag, items });
  }

  // Sort by tag name
  return groups.sort((a, b) => a.tag.localeCompare(b.tag));
}

function createDigestPrompt(groups: DigestGroup[]): string {
  let prompt = 'Create a weekly digest of the following content items:\n\n';

  for (const group of groups) {
    prompt += `## ${group.tag}\n`;
    for (const item of group.items) {
      prompt += `- ${item.title || 'Untitled'}: ${item.url}\n`;
    }
    prompt += '\n';
  }

  prompt += `Create a digest message formatted for Telegram. Use markdown formatting with bold (**text**), italic (_text_), and links. Keep it concise and engaging. Include section headers for each topic.`;

  return prompt;
}
