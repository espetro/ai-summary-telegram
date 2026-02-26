export type ReviewAction = 'done' | 'skip' | 'remove' | 'open' | 'reschedule';

export interface SessionState {
  sessionId: string;
  userId: string;
  itemIds: string[];
  currentIndex: number;
  startedAt: Date;
}

export interface IngestJobPayload {
  type: 'ingest';
  source: string;
  options?: {
    chunkSize?: number;
    format?: 'markdown' | 'json' | 'html';
  };
}

export interface NotifyJobPayload {
  type: 'notify';
  recipients: string[];
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface DigestJobPayload {
  type: 'digest';
  items: string[];
  recipient: string;
  summary?: string;
  detail?: 'brief' | 'detailed' | 'full';
}

export interface NudgeJobPayload {
  type: 'nudge';
  targetId: string;
  targetItemIds: string[];
  urgency?: 'low' | 'normal' | 'high';
  context?: Record<string, unknown>;
}
