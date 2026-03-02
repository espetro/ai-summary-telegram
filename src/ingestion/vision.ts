import { generateObject } from 'ai';
import { z } from 'zod';
import { chatModel } from '../ai/client';

export interface VisionResult {
  text: string;
  title?: string;
  author?: string;
  url?: string;
}

const visionExtractionSchema = z.object({
  text: z.string().describe('Full extracted text content from the image'),
  title: z.string().optional().describe('Title if visible in the image'),
  author: z.string().optional().describe('Author name if visible in the image'),
  url: z.string().optional().describe('URL if visible in the image'),
});

/**
 * Extract text content from an image using GPT-4o multimodal
 * @param imageInput - Either a base64 data URL or a file path
 * @returns Extracted text and metadata from the image
 */
export async function extractFromImage(imageInput: string): Promise<VisionResult> {
  let imageData: string;

  // Handle both file paths and base64 data URLs
  if (imageInput.startsWith('data:image')) {
    // Already a base64 data URL
    imageData = imageInput;
  } else {
    // Assume it's a file path, read and convert to base64
    const file = Bun.file(imageInput);
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = file.type || 'image/jpeg';
    imageData = `data:${mimeType};base64,${base64}`;
  }

  const result = await generateObject({
    model: chatModel,
    schema: visionExtractionSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract all text content from this image. Provide the full text, and if visible, include the title, author, and any URL shown.',
          },
          {
            type: 'image',
            image: imageData,
          },
        ],
      },
    ],
  });

  return {
    text: result.object.text.trim(),
    title: result.object.title?.trim(),
    author: result.object.author?.trim(),
    url: result.object.url?.trim(),
  };
}
