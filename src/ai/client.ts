import { createOpenAI } from '@ai-sdk/openai';
import { config } from '../config';

// Create AI provider using OpenAI-compatible API
export const aiProvider = createOpenAI({
  baseURL: config.AI_API_URL,
  apiKey: config.AI_API_KEY,
});

// Chat model
export const chatModel = aiProvider(config.AI_API_CHAT_MODEL);

// Embedding model
export const embeddingModel = aiProvider.embedding(config.AI_API_EMBEDDING_MODEL);
