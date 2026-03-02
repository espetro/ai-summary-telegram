import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/citta_db',
  },
  verbose: true,
  strict: true,
} satisfies Config;
