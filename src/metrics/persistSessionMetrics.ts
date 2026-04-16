import type { SQLiteDatabase } from 'expo-sqlite';

import { SETTINGS_METRICS_APP_TIME, SETTINGS_METRICS_MOTION } from '../constants/settingsKeys';
import { getSetting, upsertSessionMetrics, type SessionRow } from '../db/repo';

import {
  clearSessionMetricsRuntime,
  computeStepsForSession,
  ESTIMATED_STRIDE_M,
  takeForegroundTotalsForPersist,
} from './sessionMetricsRuntime';

async function readMetricToggles(db: SQLiteDatabase): Promise<{ motion: boolean; foreground: boolean }> {
  const motion = (await getSetting(db, SETTINGS_METRICS_MOTION)) !== '0';
  const foreground = (await getSetting(db, SETTINGS_METRICS_APP_TIME)) !== '0';
  return { motion, foreground };
}

/**
 * Writes `session_metrics` for a session and clears in-memory trackers.
 * Order: foreground snapshot → step query/watch snapshot → SQLite → clear runtime.
 */
export async function persistSessionMetrics(db: SQLiteDatabase, session: SessionRow): Promise<void> {
  const toggles = await readMetricToggles(db);
  const { ms, transitions } = takeForegroundTotalsForPersist(toggles.foreground);
  const { steps, source } = await computeStepsForSession(session.started_at, toggles.motion);
  const distance = steps * ESTIMATED_STRIDE_M;

  await upsertSessionMetrics(db, {
    session_id: session.id,
    app_foreground_ms: ms,
    background_transitions: transitions,
    steps_delta: steps,
    distance_estimate_m: distance,
    steps_source: source,
  });

  clearSessionMetricsRuntime();
}
