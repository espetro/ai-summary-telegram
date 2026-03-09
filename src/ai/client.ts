import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { config } from "../config";

export const aiProvider = createOpenAICompatible({
  name: "lmstudio",
  baseURL: config.AI_API_URL,
  apiKey: config.AI_API_KEY,
});

export const chatModel = aiProvider.chatModel(config.AI_API_CHAT_MODEL);

export const embeddingModel = aiProvider.embeddingModel(config.AI_API_EMBEDDING_MODEL);
