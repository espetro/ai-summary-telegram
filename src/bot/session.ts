import type { SessionState } from '../types';

const activeSessions = new Map<string, SessionState>();

export function startSession(userId: string, itemIds: string[]): SessionState {
  const session: SessionState = {
    sessionId: crypto.randomUUID(),
    userId,
    itemIds,
    currentIndex: 0,
    startedAt: new Date(),
  };

  activeSessions.set(userId, session);
  return session;
}

export function endSession(userId: string): void {
  activeSessions.delete(userId);
}

export function nextItem(userId: string): string | null {
  const session = activeSessions.get(userId);
  if (!session) {
    return null;
  }

  session.currentIndex++;
  if (session.currentIndex >= session.itemIds.length) {
    return null;
  }

  return session.itemIds[session.currentIndex] ?? null;
}

export function getCurrentItem(userId: string): string | null {
  const session = activeSessions.get(userId);
  if (!session) {
    return null;
  }

  if (session.currentIndex >= session.itemIds.length) {
    return null;
  }

  return session.itemIds[session.currentIndex] ?? null;
}

export function getSession(userId: string): SessionState | undefined {
  return activeSessions.get(userId);
}
