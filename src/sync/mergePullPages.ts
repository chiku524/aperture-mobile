import type { SQLiteDatabase } from 'expo-sqlite';

import { applySyncRecord } from './applyRemoteRecords';
import type { SyncClient } from './syncClient';

/** Pulls all pages from the server and merges records into the local DB (same loop as Settings → Pull). */
export async function mergePullPages(db: SQLiteDatabase, client: SyncClient): Promise<number> {
  let cursor: string | null = null;
  let total = 0;
  for (let i = 0; i < 50; i += 1) {
    const page = await client.pull(cursor);
    await db.withTransactionAsync(async () => {
      for (const rec of page.records) {
        await applySyncRecord(db, rec);
      }
    });
    total += page.records.length;
    if (page.records.length === 0) break;
    cursor = page.nextCursor;
    if (cursor == null) break;
  }
  return total;
}
