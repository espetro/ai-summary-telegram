import { Context } from 'grammy';
import { users, reviewSessions } from '../db/schema';

export interface BotContext extends Context {
  user?: typeof users.$inferSelect;
  session?: typeof reviewSessions.$inferSelect;
}
  user?: typeof users.$inferSelect;
  session?: ReviewSessionState;
}

export type SessionState = typeof reviewSessions.$inferSelect;
  sessionId: string;
  userId: string;
  itemIds: string[];
  currentIndex: number;
  startedAt: Date;
}
