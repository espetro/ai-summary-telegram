import { Bot, BotError } from 'grammy';

export function setupErrorHandler(bot: Bot) {
  bot.catch((err: BotError) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    console.error(err.error);

    if (err.error instanceof Error) {
      console.error(`Error name: ${err.error.name}`);
      console.error(`Error message: ${err.error.message}`);
      console.error(`Error stack: ${err.error.stack}`);
    }

    ctx.reply('Sorry, something went wrong. Please try again.').catch((replyError) => {
      console.error('Failed to send error message to user:', replyError);
    });
  });
}

export function setupGracefulShutdown(
  stopBot: () => Promise<void>,
  stopJobs: () => Promise<void>
): void {
  async function shutdown(signal: string) {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    try {
      await Promise.all([
        stopBot().catch((err) => {
          console.error('Error stopping bot:', err);
        }),
        stopJobs().catch((err) => {
          console.error('Error stopping jobs:', err);
        }),
      ]);

      console.log('Shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });
}
