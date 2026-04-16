import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

let dbSingleton: Promise<SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbSingleton) {
    dbSingleton = (async () => {
      const db = await openDatabaseAsync('aperture.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY NOT NULL,
          intent TEXT NOT NULL,
          parking_note TEXT NOT NULL DEFAULT '',
          duration_sec INTEGER NOT NULL,
          strictness TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          planned_end_at INTEGER NOT NULL,
          status TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS session_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          at INTEGER NOT NULL,
          payload TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS digests (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL,
          summary TEXT NOT NULL,
          risks TEXT NOT NULL,
          next_step TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
        CREATE TABLE IF NOT EXISTS session_metrics (
          session_id TEXT PRIMARY KEY NOT NULL,
          app_foreground_ms INTEGER NOT NULL DEFAULT 0,
          background_transitions INTEGER NOT NULL DEFAULT 0,
          steps_delta INTEGER NOT NULL DEFAULT 0,
          distance_estimate_m REAL NOT NULL DEFAULT 0,
          steps_source TEXT NOT NULL DEFAULT 'none',
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
      `);
      return db;
    })();
  }
  return dbSingleton;
}

export async function initDatabase(): Promise<SQLiteDatabase> {
  return getDatabase();
}
