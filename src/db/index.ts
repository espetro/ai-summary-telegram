import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Get connection URL from environment variable
const connectionString = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/citta_db';

// Create postgres client
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create drizzle client
export const db = drizzle(client, { schema });

// Graceful shutdown
process.on('SIGINT', async () => {
  await client.end();
  process.exit(0);
});
