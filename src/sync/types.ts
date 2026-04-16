export type SyncTableName = 'sessions' | 'session_events' | 'digests' | 'session_metrics';

export type SyncRecord = {
  table: SyncTableName;
  id: string;
  updated_at: number;
  payload: Record<string, unknown>;
};

export type PushRequestBody = {
  cursor?: string | null;
  records: SyncRecord[];
};

export type PushResponseBody = {
  accepted: number;
  nextCursor: string;
};

export type PullResponseBody = {
  records: SyncRecord[];
  nextCursor: string | null;
};

export type HealthResponseBody = {
  ok: boolean;
  version: string;
};
