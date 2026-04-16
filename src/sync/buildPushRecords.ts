import type { SQLiteDatabase } from 'expo-sqlite';

import { exportAllData } from '../db/repo';

import { digestRowToRecord, eventRowToRecord, sessionRowToRecord } from './syncClient';
import type { SyncRecord } from './types';

export async function buildPushRecords(db: SQLiteDatabase): Promise<SyncRecord[]> {
  const data = await exportAllData(db);
  const out: SyncRecord[] = [];
  for (const s of data.sessions) {
    out.push(sessionRowToRecord(s as unknown as Record<string, unknown>));
  }
  for (const e of data.session_events) {
    out.push(eventRowToRecord(e as unknown as Record<string, unknown>));
  }
  for (const d of data.digests) {
    out.push(digestRowToRecord(d as unknown as Record<string, unknown>));
  }
  return out;
}
