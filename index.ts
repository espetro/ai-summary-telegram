import { api } from './src/api/ingest';
import { startJobs, stopJobs } from './src/jobs';
import { startBot, stopBot } from './src/bot';
import { config } from './src/config';

let isShuttingDown = false;

/**
 * Main entry point for the application
 */
async function main() {
  console.log('Starting CIB content capture bot...');

  try {
    // 1. Start job queue
    console.log('Starting job queue...');
    await startJobs();
    console.log('Job queue started');

    // 2. Start Telegram bot (fails gracefully if token is invalid)
    console.log('Starting Telegram bot...');
    await startBot();
    // 3. Start HTTP server with Hono
    console.log(`Starting HTTP server on port ${config.PORT}...`);
    Bun.serve({
      port: config.PORT,
      fetch: api.fetch,
    });
    console.log(`HTTP server started on port ${config.PORT}`);

    console.log('');
    console.log('✓ All services started successfully');
    console.log(`✓ API: http://localhost:${config.PORT}/api/ingest`);
    console.log(`✓ Health: http://localhost:${config.PORT}/health`);
    console.log('');

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string) {
  if (isShuttingDown) {
    console.log('Shutdown already in progress, ignoring signal');
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} received, starting graceful shutdown...`);

  try {
    // Stop services in reverse order
    console.log('Stopping Telegram bot...');
    await stopBot();
    console.log('Telegram bot stopped');

    console.log('Stopping job queue...');
    await stopJobs();
    console.log('Job queue stopped');

    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't shutdown - log and continue (allows API to keep running even if bot fails)
});

// Start the application
main().catch(console.error);
