import type { SQLiteDatabase } from 'expo-sqlite';

import type { SyncRecord, SyncTableName } from './types';

function isSyncTableName(t: string): t is SyncTableName {
  return (
    t === 'sessions' || t === 'session_events' || t === 'digests' || t === 'session_metrics'
  );
}

function assertNever(x: never): never {
  throw new Error(`Unexpected sync table: ${String(x)}`);
}

export async function applySyncRecord(db: SQLiteDatabase, record: SyncRecord): Promise<void> {
  if (!isSyncTableName(record.table)) {
    throw new Error(`Unknown sync table: ${record.table}`);
  }
  const p = record.payload;
  switch (record.table) {
    case 'sessions': {
      const status =
        p.status === 'completed' || p.status === 'abandoned' || p.status === 'active' ? p.status : 'active';
      await db.runAsync(
        `INSERT OR REPLACE INTO sessions (id, intent, parking_note, duration_sec, strictness, started_at, ended_at, planned_end_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        String(p.id),
        String(p.intent ?? ''),
        String(p.parking_note ?? ''),
        Number(p.duration_sec ?? 0),
        p.strictness === 'hard' ? 'hard' : 'soft',
        Number(p.started_at ?? 0),
        p.ended_at == null ? null : Number(p.ended_at),
        Number(p.planned_end_at ?? 0),
        status,
      );
      return;
    }
    case 'session_events': {
      const evId = Number(record.id);
      if (!Number.isFinite(evId)) {
        throw new Error('session_events sync id must be numeric');
      }
      const payloadStr =
        typeof p.payload === 'string' ? p.payload : JSON.stringify((p as { payload?: unknown }).payload ?? {});
      await db.runAsync(
        `INSERT OR REPLACE INTO session_events (id, session_id, type, at, payload) VALUES (?, ?, ?, ?, ?)`,
        evId,
        String(p.session_id ?? ''),
        String(p.type ?? ''),
        Number(p.at ?? 0),
        payloadStr,
      );
      return;
    }
    case 'digests':
      await db.runAsync(
        `INSERT OR REPLACE INTO digests (id, session_id, summary, risks, next_step, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        String(p.id ?? record.id),
        String(p.session_id ?? ''),
        String(p.summary ?? ''),
        String(p.risks ?? ''),
        String(p.next_step ?? ''),
        Number(p.created_at ?? 0),
      );
      return;
    case 'session_metrics':
      await db.runAsync(
        `INSERT OR REPLACE INTO session_metrics (session_id, app_foreground_ms, background_transitions, steps_delta, distance_estimate_m, steps_source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        String(p.session_id ?? record.id),
        Number(p.app_foreground_ms ?? 0),
        Number(p.background_transitions ?? 0),
        Number(p.steps_delta ?? 0),
        Number(p.distance_estimate_m ?? 0),
        String(p.steps_source ?? 'none'),
        Number(p.updated_at ?? 0),
      );
      return;
    default:
      assertNever(record.table);
  }
}
