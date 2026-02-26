import { z } from 'zod';

// Validation schema for environment variables
const configSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AI_API_URL: z.string().url('AI_API_URL must be a valid URL'),
  AI_API_KEY: z.string().min(1, 'AI_API_KEY is required'),
  AI_API_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  AI_API_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  JINA_READER_API_KEY: z.string().optional(),
  ENCRYPTION_MASTER_SECRET: z.string().length(64, 'ENCRYPTION_MASTER_SECRET must be 32 bytes (64 hex characters)'),
  API_TOKEN_SECRET: z.string().min(1, 'API_TOKEN_SECRET is required'),
  PORT: z.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Validation for required variables in production
const requiredVarsInProduction = [
  'TELEGRAM_BOT_TOKEN',
  'DATABASE_URL',
  'AI_API_URL',
  'AI_API_KEY',
  'ENCRYPTION_MASTER_SECRET',
  'API_TOKEN_SECRET',
];

function validateRequiredVarsInProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    const missing = requiredVarsInProduction.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
    }
  }
}

// Load and validate config
let config: z.infer<typeof configSchema>;

try {
  validateRequiredVarsInProduction();
  config = configSchema.parse({
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
    AI_API_URL: process.env.AI_API_URL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_API_CHAT_MODEL: process.env.AI_API_CHAT_MODEL,
    AI_API_EMBEDDING_MODEL: process.env.AI_API_EMBEDDING_MODEL,
    JINA_READER_API_KEY: process.env.JINA_READER_API_KEY,
    ENCRYPTION_MASTER_SECRET: process.env.ENCRYPTION_MASTER_SECRET,
    API_TOKEN_SECRET: process.env.API_TOKEN_SECRET,
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    NODE_ENV: process.env.NODE_ENV,
  });
} catch (error) {
  throw new Error(`Failed to validate environment variables: ${error instanceof Error ? error.message : 'Unknown error'}`);
}

// Constants
const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 50;
const EMBEDDING_DIMENSIONS = 1536;

export {
  config,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  EMBEDDING_DIMENSIONS,
};

export type Config = z.infer<typeof configSchema>;
