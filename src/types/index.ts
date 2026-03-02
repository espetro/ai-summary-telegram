export type ReviewAction = 'done' | 'skip' | 'remove' | 'open' | 'reschedule';

export interface SessionState {
  sessionId: string;
  userId: string;
  itemIds: string[];
  currentIndex: number;
  startedAt: Date;
}

export interface IngestJobPayload {
  itemId: string;
}

export interface NotifyJobPayload {
  userId: string;
}

export interface DigestJobPayload {
  userId: string;
}

export interface NudgeJobPayload {
  userId: string;
  sessionId: string;
  itemIds: string[];
  urgency?: 'low' | 'normal' | 'high';
}
