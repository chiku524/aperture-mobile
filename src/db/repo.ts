import type { SQLiteDatabase } from 'expo-sqlite';

export type Strictness = 'soft' | 'hard';
export type SessionStatus = 'active' | 'completed' | 'abandoned';

export type SessionRow = {
  id: string;
  intent: string;
  parking_note: string;
  duration_sec: number;
  strictness: Strictness;
  started_at: number;
  ended_at: number | null;
  planned_end_at: number;
  status: SessionStatus;
};

export type SessionEventRow = {
  id: number;
  session_id: string;
  type: string;
  at: number;
  payload: string;
};

export type DigestRow = {
  id: string;
  session_id: string;
  summary: string;
  risks: string;
  next_step: string;
  created_at: number;
};

export type SessionMetricsRow = {
  session_id: string;
  app_foreground_ms: number;
  background_transitions: number;
  steps_delta: number;
  distance_estimate_m: number;
  steps_source: string;
  updated_at: number;
};

/** Session row joined with optional cognitive metrics for the ledger. */
export type SessionLedgerRow = SessionRow & {
  app_foreground_ms: number | null;
  background_transitions: number | null;
  steps_delta: number | null;
  distance_estimate_m: number | null;
  steps_source: string | null;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function insertSession(
  db: SQLiteDatabase,
  input: {
    intent: string;
    parking_note: string;
    duration_sec: number;
    strictness: Strictness;
  },
): Promise<SessionRow> {
  const id = newId('ses');
  const now = Date.now();
  const planned_end_at = now + input.duration_sec * 1000;
  await db.runAsync(
    `INSERT INTO sessions (id, intent, parking_note, duration_sec, strictness, started_at, ended_at, planned_end_at, status)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'active')`,
    id,
    input.intent,
    input.parking_note,
    input.duration_sec,
    input.strictness,
    now,
    planned_end_at,
  );
  await insertEvent(db, id, 'start', now, { duration_sec: input.duration_sec });
  return {
    id,
    intent: input.intent,
    parking_note: input.parking_note,
    duration_sec: input.duration_sec,
    strictness: input.strictness,
    started_at: now,
    ended_at: null,
    planned_end_at,
    status: 'active',
  };
}

export async function insertEvent(
  db: SQLiteDatabase,
  sessionId: string,
  type: string,
  at: number,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO session_events (session_id, type, at, payload) VALUES (?, ?, ?, ?)`,
    sessionId,
    type,
    at,
    JSON.stringify(payload),
  );
}

export async function getSession(db: SQLiteDatabase, id: string): Promise<SessionRow | null> {
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT id, intent, parking_note, duration_sec, strictness, started_at, ended_at, planned_end_at, status FROM sessions WHERE id = ?`,
    id,
  );
  return row ?? null;
}

export async function completeSession(db: SQLiteDatabase, sessionId: string, at: number): Promise<void> {
  await db.runAsync(`UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?`, at, sessionId);
  await insertEvent(db, sessionId, 'end', at, {});
}

export async function abandonSession(db: SQLiteDatabase, sessionId: string, at: number): Promise<void> {
  await db.runAsync(`UPDATE sessions SET status = 'abandoned', ended_at = ? WHERE id = ?`, at, sessionId);
  await insertEvent(db, sessionId, 'abandon', at, {});
}

export async function listSessions(db: SQLiteDatabase, limit = 100): Promise<SessionRow[]> {
  return db.getAllAsync<SessionRow>(
    `SELECT id, intent, parking_note, duration_sec, strictness, started_at, ended_at, planned_end_at, status
     FROM sessions ORDER BY started_at DESC LIMIT ?`,
    limit,
  );
}

export async function listSessionsForLedger(db: SQLiteDatabase, limit = 200): Promise<SessionLedgerRow[]> {
  return db.getAllAsync<SessionLedgerRow>(
    `SELECT s.id, s.intent, s.parking_note, s.duration_sec, s.strictness, s.started_at, s.ended_at, s.planned_end_at, s.status,
            m.app_foreground_ms, m.background_transitions, m.steps_delta, m.distance_estimate_m, m.steps_source
     FROM sessions s
     LEFT JOIN session_metrics m ON m.session_id = s.id
     ORDER BY s.started_at DESC
     LIMIT ?`,
    limit,
  );
}

export async function upsertSessionMetrics(
  db: SQLiteDatabase,
  input: Omit<SessionMetricsRow, 'updated_at'>,
): Promise<void> {
  const updated_at = Date.now();
  await db.runAsync(
    `INSERT INTO session_metrics (session_id, app_foreground_ms, background_transitions, steps_delta, distance_estimate_m, steps_source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       app_foreground_ms = excluded.app_foreground_ms,
       background_transitions = excluded.background_transitions,
       steps_delta = excluded.steps_delta,
       distance_estimate_m = excluded.distance_estimate_m,
       steps_source = excluded.steps_source,
       updated_at = excluded.updated_at`,
    input.session_id,
    input.app_foreground_ms,
    input.background_transitions,
    input.steps_delta,
    input.distance_estimate_m,
    input.steps_source,
    updated_at,
  );
}

/** Best-effort draft: updates foreground counters only; preserves steps/distance on conflict. */
export async function patchSessionMetricsDraft(
  db: SQLiteDatabase,
  sessionId: string,
  foregroundMs: number,
  backgroundTransitions: number,
): Promise<void> {
  const updated_at = Date.now();
  await db.runAsync(
    `INSERT INTO session_metrics (session_id, app_foreground_ms, background_transitions, steps_delta, distance_estimate_m, steps_source, updated_at)
     VALUES (?, ?, ?, 0, 0, 'pending', ?)
     ON CONFLICT(session_id) DO UPDATE SET
       app_foreground_ms = excluded.app_foreground_ms,
       background_transitions = excluded.background_transitions,
       updated_at = excluded.updated_at`,
    sessionId,
    foregroundMs,
    backgroundTransitions,
    updated_at,
  );
}

export async function insertDigest(
  db: SQLiteDatabase,
  sessionId: string,
  body: { summary: string; risks: string; next_step: string },
): Promise<DigestRow> {
  const id = newId('dig');
  const created_at = Date.now();
  await db.runAsync(
    `INSERT INTO digests (id, session_id, summary, risks, next_step, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    sessionId,
    body.summary,
    body.risks,
    body.next_step,
    created_at,
  );
  await insertEvent(db, sessionId, 'digest_saved', created_at, { digest_id: id });
  return {
    id,
    session_id: sessionId,
    summary: body.summary,
    risks: body.risks,
    next_step: body.next_step,
    created_at,
  };
}

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function exportAllData(db: SQLiteDatabase): Promise<{
  exported_at: string;
  sessions: SessionRow[];
  session_events: SessionEventRow[];
  digests: DigestRow[];
  session_metrics: SessionMetricsRow[];
}> {
  const sessions = await db.getAllAsync<SessionRow>(
    `SELECT id, intent, parking_note, duration_sec, strictness, started_at, ended_at, planned_end_at, status FROM sessions`,
  );
  const session_events = await db.getAllAsync<SessionEventRow>(
    `SELECT id, session_id, type, at, payload FROM session_events ORDER BY id ASC`,
  );
  const digests = await db.getAllAsync<DigestRow>(
    `SELECT id, session_id, summary, risks, next_step, created_at FROM digests`,
  );
  const session_metrics = await db.getAllAsync<SessionMetricsRow>(
    `SELECT session_id, app_foreground_ms, background_transitions, steps_delta, distance_estimate_m, steps_source, updated_at FROM session_metrics`,
  );
  return {
    exported_at: new Date().toISOString(),
    sessions,
    session_events,
    digests,
    session_metrics,
  };
}

export async function countEventsByType(
  db: SQLiteDatabase,
  sessionId: string,
  type: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM session_events WHERE session_id = ? AND type = ?`,
    sessionId,
    type,
  );
  return row?.c ?? 0;
}

export async function getActiveSession(db: SQLiteDatabase): Promise<SessionRow | null> {
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT id, intent, parking_note, duration_sec, strictness, started_at, ended_at, planned_end_at, status
     FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`,
  );
  return row ?? null;
}

/** Extends the planned end time when resuming from pause (wall-clock pause duration). */
export async function extendPlannedEnd(db: SQLiteDatabase, sessionId: string, extraMs: number): Promise<void> {
  await db.runAsync(
    `UPDATE sessions SET planned_end_at = planned_end_at + ? WHERE id = ?`,
    extraMs,
    sessionId,
  );
}
