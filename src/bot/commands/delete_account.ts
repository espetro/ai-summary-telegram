import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { users, items, chunks, credentials, reviewSessions } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { InlineKeyboard } from 'grammy';

// Store pending deletions (userId -> timestamp)
const pendingDeletions = new Map<string, number>();

const DELETE_CONFIRMATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export async function deleteAccountCommand(ctx: BotContext) {
  if (!ctx.user) {
    return;
  }

  const userId = ctx.user.id;
  const now = Date.now();

  // Check if there's a pending deletion
  const pendingTimestamp = pendingDeletions.get(userId);

  if (!pendingTimestamp) {
    // No pending deletion, start confirmation flow
    pendingDeletions.set(userId, now);

    const keyboard = new InlineKeyboard()
      .text('Yes, delete my account', `confirm_delete_${userId}`)
      .text('Cancel', `cancel_delete_${userId}`);

    await ctx.reply(
      '⚠️ Are you sure you want to delete your account?\n\n' +
        'This action will:\n' +
        '• Delete all your items and data\n' +
        '• Delete all your review sessions\n' +
        '• Delete all your credentials\n' +
        '• This action cannot be undone!\n\n' +
        'You have 5 minutes to confirm.',
      { reply_markup: keyboard }
    );

    // Schedule cleanup of pending deletion
    setTimeout(() => {
      pendingDeletions.delete(userId);
    }, DELETE_CONFIRMATION_TIMEOUT);

    return;
  }

  // Check if the pending deletion has expired
  if (now - pendingTimestamp > DELETE_CONFIRMATION_TIMEOUT) {
    pendingDeletions.delete(userId);

    await ctx.reply('⏰ Confirmation timeout. Please start the deletion process again.');
    return;
  }

  // User has already been asked to confirm, show keyboard again
  const keyboard = new InlineKeyboard()
    .text('Yes, delete my account', `confirm_delete_${userId}`)
    .text('Cancel', `cancel_delete_${userId}`);

  await ctx.reply(
    '⚠️ Please confirm or cancel the account deletion.\n\n' +
      `Time remaining: ${Math.ceil((DELETE_CONFIRMATION_TIMEOUT - (now - pendingTimestamp)) / 1000)} seconds`,
    { reply_markup: keyboard }
  );
}

export async function handleDeleteConfirmation(ctx: BotContext) {
  if (!ctx.callbackQuery?.data || !ctx.user) {
    return;
  }

  const callbackData = ctx.callbackQuery.data;
  const userId = ctx.user.id;

  if (callbackData.startsWith('confirm_delete_')) {
    // Parse user ID from callback data
    const targetUserId = callbackData.replace('confirm_delete_', '');

    // Verify the user is confirming their own deletion
    if (targetUserId !== userId) {
      await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
      return;
    }

    try {
      // Hard delete all user data (cascade through foreign keys)
      // Delete credentials first
      await db.delete(credentials).where(eq(credentials.userId, userId));

      // Delete review sessions
      await db.delete(reviewSessions).where(eq(reviewSessions.userId, userId));

      // Delete chunks (through items)
      const userItems = await db.select({ id: items.id }).from(items).where(eq(items.userId, userId));
      for (const item of userItems) {
        await db.delete(chunks).where(eq(chunks.itemId, item.id));
      }

      // Delete items
      await db.delete(items).where(eq(items.userId, userId));

      // Delete user
      await db.delete(users).where(eq(users.id, userId));

      // Clear pending deletion
      pendingDeletions.delete(userId);

      await ctx.reply(
        '✅ Your account has been permanently deleted.\n\n' + 'Thank you for using CIB!'
      );
    } catch (error) {
      console.error('Error deleting account:', error);
      await ctx.reply('❌ Failed to delete account. Please try again later.');
    }
  } else if (callbackData.startsWith('cancel_delete_')) {
    const targetUserId = callbackData.replace('cancel_delete_', '');

    if (targetUserId !== userId) {
      await ctx.answerCallbackQuery({ text: 'Invalid request', show_alert: true });
      return;
    }

    // Clear pending deletion
    pendingDeletions.delete(userId);

    await ctx.reply('✅ Account deletion cancelled.');
  }

  await ctx.answerCallbackQuery();
}
