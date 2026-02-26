import { Context } from 'grammy';
import { users, reviewSessions } from '../db/schema';

export interface BotContext extends Context {
  user?: typeof users.$inferSelect;
  session?: typeof reviewSessions.$inferSelect;
}

export type SessionState = typeof reviewSessions.$inferSelect;
