import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import { limit } from '@grammyjs/ratelimiter';
import { config } from '../config';
import type { BotContext } from '../types/bot';
import { authMiddleware } from './middleware/auth';
import { handleUrlMessage, handlePhotoMessage } from './handlers/ingest';
import { handleCallback } from './handlers/callbacks';
import { startCommand } from './commands/start';
import { reviewCommand } from './commands/review';
import { askCommand } from './commands/ask';
import { inviteCommand } from './commands/invite';
import { queueCommand } from './commands/queue';
import { settingsCommand } from './commands/settings';
import { exportCommand } from './commands/export';
import { deleteAccountCommand, handleDeleteConfirmation } from './commands/delete_account';
import { regenerateCommand } from './commands/regenerate';

export const bot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

// Apply API throttling (global rate limit: 30 req/sec - default)
const throttler = apiThrottler();
bot.api.config.use(throttler);

// Apply auto-retry for network issues
bot.api.config.use(autoRetry());
// Apply per-user rate limiting (3 messages per second)
bot.use(limit({
    timeFrame: 1000,
    limit: 3,
    onLimitExceeded: async (ctx) => {
      await ctx.reply('Please slow down!');
    },
  })
);

// Apply auth middleware for all handlers
bot.use(authMiddleware);

// Command handlers
bot.command('start', startCommand);
bot.command('review', reviewCommand);
bot.command('ask', askCommand);
bot.command('invite', inviteCommand);
bot.command('queue', queueCommand);
bot.command('settings', settingsCommand);
bot.command('export', exportCommand);
bot.command('delete_account', deleteAccountCommand);
bot.command('regenerate', regenerateCommand);

// Help command
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📚 CIB Commands\n\n` +
      `/start - Register or show welcome message\n` +
      `/review - Start a review session\n` +
      `/ask <query> - Search your queue with AI\n` +
      `/invite - Generate invite link\n` +
      `/queue - View your pending items\n` +
      `/regenerate [index] - Regenerate AI summary for an item\n` +
      `/settings - Configure preferences\n` +
      `/export - Export your data\n` +
      `/delete_account - Delete your account\n\n` +
      `Send me URLs or screenshots to queue them!`
  );
});

// URL and photo handlers (must come after commands)
bot.on('message:text', handleUrlMessage);
bot.on('message:photo', handlePhotoMessage);

bot.callbackQuery(/^session:/, handleCallback);
bot.callbackQuery(/^confirm_delete_/, handleDeleteConfirmation);
bot.callbackQuery(/^cancel_delete_/, handleDeleteConfirmation);

// Global error handler
bot.catch((err) => {
  console.error('Bot error:', err);
});

export async function startBot() {
  try {
    await bot.start();
    console.log('Bot started successfully!');
  } catch (error) {
    console.warn('Bot failed to start (expected with placeholder token):', error instanceof Error ? error.message : error);
    console.warn('API server will continue running. Set a valid TELEGRAM_BOT_TOKEN to enable the bot.');
  }
}

export async function stopBot() {
  try {
    await bot.stop();
    console.log('Bot stopped.');
  } catch {
    // Bot may not have started
  }
}
