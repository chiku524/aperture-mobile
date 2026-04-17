import { AppState, type AppStateStatus, Platform } from 'react-native';

import {
  SETTINGS_LAST_SYNC_AT,
  SETTINGS_SYNC_BASE_URL,
  SETTINGS_SYNC_PULL_ON_FOREGROUND,
  SETTINGS_SYNC_TOKEN,
  SETTINGS_WIFI_ONLY_SYNC,
} from '../constants/settingsKeys';
import { getDatabase } from '../db/database';
import { getSetting, setSetting } from '../db/repo';

import { mergePullPages } from './mergePullPages';
import { SyncClient } from './syncClient';
import { assertSyncAllowedOnCurrentNetwork } from './wifiGuard';

const MIN_INTERVAL_MS = 90_000;
let lastRunAt = 0;

async function runPullIfEnabled(): Promise<void> {
  if (Platform.OS === 'web') return;
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) return;
  lastRunAt = now;
  try {
    const db = await getDatabase();
    if ((await getSetting(db, SETTINGS_SYNC_PULL_ON_FOREGROUND)) !== '1') return;
    const base = ((await getSetting(db, SETTINGS_SYNC_BASE_URL)) ?? '').trim().replace(/\/+$/, '');
    const tok = ((await getSetting(db, SETTINGS_SYNC_TOKEN)) ?? '').trim();
    if (!base || !tok) return;
    const wifiOnly = (await getSetting(db, SETTINGS_WIFI_ONLY_SYNC)) === '1';
    await assertSyncAllowedOnCurrentNetwork(wifiOnly);
    const client = new SyncClient(base, tok);
    await mergePullPages(db, client);
    await setSetting(db, SETTINGS_LAST_SYNC_AT, String(Date.now()));
  } catch {
    // Silent: manual Pull in Settings remains available
  }
}

/** Subscribes to AppState and runs a throttled pull when the app becomes active and the setting is on. */
export function registerPullOnAppForeground(): () => void {
  const onChange = (state: AppStateStatus) => {
    if (state === 'active') void runPullIfEnabled();
  };
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}
