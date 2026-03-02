import type { BotContext } from '../../types/bot';
import { db } from '../../db';
import { invites } from '../../db/schema';
import crypto from 'crypto';

export async function inviteCommand(ctx: BotContext) {
  if (!ctx.user) {
    return;
  }

  // Generate invite token
  const token = crypto.randomBytes(32).toString('hex');

  // Set expiry to 48 hours from now
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  // Insert invite
  await db.insert(invites).values({
    token,
    createdBy: ctx.user.id,
    expiresAt,
  });

  // Generate bot link with start parameter
  const botLink = `https://t.me/${ctx.me?.username || 'cib_bot'}?start=${token}`;

  await ctx.reply(
    `🎉 Invite link generated!\n\n` +
      `Link: ${botLink}\n\n` +
      `⏰ Expires in 48 hours\n` +
      `✅ Single use only\n\n` +
      `Share this link with someone to invite them to CIB!`
  );
}
