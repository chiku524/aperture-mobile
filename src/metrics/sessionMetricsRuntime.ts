import type { EventSubscription } from 'expo-modules-core';
import { Pedometer } from 'expo-sensors';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { getDatabase } from '../db/database';
import { patchSessionMetricsDraft } from '../db/repo';

/** Average adult stride (meters) for rough distance from steps — ergonomic estimate only. */
export const ESTIMATED_STRIDE_M = 0.76;

export type StepsSource = 'disabled' | 'denied' | 'unavailable' | 'ios_query' | 'android_watch' | 'none';

const DRAFT_FLUSH_MS = 30_000;

let trackedSessionId: string | null = null;
let foregroundMs = 0;
let backgroundTransitions = 0;
let enteredForegroundAt: number | null = null;
let appListener: ReturnType<typeof AppState.addEventListener> | null = null;
let stepSubscription: EventSubscription | null = null;
let androidStepsMax = 0;
let recordFgForDraft = false;
let draftInterval: ReturnType<typeof setInterval> | null = null;

function stopPeriodicDraftPersist(): void {
  if (draftInterval != null) {
    clearInterval(draftInterval);
    draftInterval = null;
  }
}

async function flushDraftToSqlite(): Promise<void> {
  if (trackedSessionId == null || !recordFgForDraft) return;
  try {
    const db = await getDatabase();
    const { ms, transitions } = takeForegroundTotalsForPersist(recordFgForDraft);
    await patchSessionMetricsDraft(db, trackedSessionId, ms, transitions);
  } catch {
    /* best-effort */
  }
}

function startPeriodicDraftPersist(): void {
  stopPeriodicDraftPersist();
  if (!recordFgForDraft || trackedSessionId == null) return;
  draftInterval = setInterval(() => {
    void flushDraftToSqlite();
  }, DRAFT_FLUSH_MS);
}

function onAppStateChange(next: AppStateStatus): void {
  if (trackedSessionId == null) return;
  const now = Date.now();
  if (next === 'active') {
    if (enteredForegroundAt == null) {
      enteredForegroundAt = now;
    }
  } else if (enteredForegroundAt != null) {
    foregroundMs += now - enteredForegroundAt;
    enteredForegroundAt = null;
    backgroundTransitions += 1;
  }
}

function stopAndroidStepWatch(): void {
  stepSubscription?.remove();
  stepSubscription = null;
  androidStepsMax = 0;
}

async function startAndroidStepWatch(): Promise<void> {
  if (Platform.OS !== 'android') return;
  stopAndroidStepWatch();
  try {
    const perm = await Pedometer.requestPermissionsAsync();
    if (perm.status !== 'granted') return;
    if (!(await Pedometer.isAvailableAsync())) return;
    stepSubscription = Pedometer.watchStepCount((ev) => {
      androidStepsMax = Math.max(androidStepsMax, ev.steps);
    });
  } catch {
    stopAndroidStepWatch();
  }
}

function ensureForegroundTracking(): void {
  if (appListener != null) return;
  if (AppState.currentState === 'active') {
    enteredForegroundAt = Date.now();
  }
  appListener = AppState.addEventListener('change', onAppStateChange);
}

function stopForegroundTracking(): void {
  appListener?.remove();
  appListener = null;
}

/**
 * Begins (or continues) capture for a focus session. Safe across Aperture → Receipt navigation.
 * Call `clearSessionMetricsRuntime` when the session is fully closed (saved, discarded, or abandoned).
 */
export function attachSessionMetrics(sessionId: string, opts: { recordForeground: boolean; recordMotion: boolean }): void {
  if (trackedSessionId !== sessionId) {
    clearSessionMetricsRuntime();
    trackedSessionId = sessionId;
    foregroundMs = 0;
    backgroundTransitions = 0;
    enteredForegroundAt = null;
  }

  if (opts.recordForeground) {
    ensureForegroundTracking();
    if (AppState.currentState === 'active' && enteredForegroundAt == null) {
      enteredForegroundAt = Date.now();
    }
  }

  if (opts.recordMotion && Platform.OS === 'android') {
    void startAndroidStepWatch();
  }

  recordFgForDraft = opts.recordForeground;
  startPeriodicDraftPersist();
}

/** Fold any in-progress foreground interval into totals (e.g. before persisting). */
export function flushForegroundSlice(): void {
  const now = Date.now();
  if (enteredForegroundAt != null) {
    foregroundMs += now - enteredForegroundAt;
    enteredForegroundAt = AppState.currentState === 'active' ? now : null;
  }
}

/** Snapshot foreground counters for SQLite (call before `computeStepsForSession` on Android). */
export function takeForegroundTotalsForPersist(foregroundEnabled: boolean): { ms: number; transitions: number } {
  flushForegroundSlice();
  if (!foregroundEnabled) {
    return { ms: 0, transitions: 0 };
  }
  return { ms: foregroundMs, transitions: backgroundTransitions };
}

export function getLiveForegroundMs(): number {
  const extra = enteredForegroundAt != null ? Date.now() - enteredForegroundAt : 0;
  return foregroundMs + extra;
}

export function getLiveAndroidSteps(): number {
  return androidStepsMax;
}

export function getTrackedSessionId(): string | null {
  return trackedSessionId;
}

export function clearSessionMetricsRuntime(): void {
  stopPeriodicDraftPersist();
  const now = Date.now();
  if (enteredForegroundAt != null) {
    foregroundMs += now - enteredForegroundAt;
  }
  enteredForegroundAt = null;
  stopForegroundTracking();
  stopAndroidStepWatch();
  trackedSessionId = null;
  foregroundMs = 0;
  backgroundTransitions = 0;
  recordFgForDraft = false;
}

export async function computeStepsForSession(
  sessionStartedAt: number,
  motionEnabled: boolean,
): Promise<{ steps: number; source: StepsSource }> {
  if (!motionEnabled || Platform.OS === 'web') {
    return { steps: 0, source: 'disabled' };
  }

  if (Platform.OS === 'ios') {
    try {
      const perm = await Pedometer.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        return { steps: 0, source: 'denied' };
      }
      if (!(await Pedometer.isAvailableAsync())) {
        return { steps: 0, source: 'unavailable' };
      }
      const start = new Date(sessionStartedAt);
      const end = new Date();
      const { steps } = await Pedometer.getStepCountAsync(start, end);
      return { steps: Math.max(0, Math.round(steps)), source: 'ios_query' };
    } catch {
      return { steps: 0, source: 'unavailable' };
    }
  }

  if (Platform.OS === 'android') {
    return { steps: Math.max(0, Math.round(androidStepsMax)), source: 'android_watch' };
  }

  return { steps: 0, source: 'none' };
}
