import type { SQLiteDatabase } from 'expo-sqlite';

import { SETTINGS_AI_CREDITS } from '../constants/settingsKeys';
import { getSetting, setSetting } from '../db/repo';

/** Credits spent per successful intent guidance request (OpenAI-compatible chat call). */
export const GUIDANCE_CREDIT_COST = 1;

function parseBalance(raw: string | null): number {
  if (raw == null || raw.trim() === '') return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function getGuidanceCreditBalance(db: SQLiteDatabase): Promise<number> {
  return parseBalance(await getSetting(db, SETTINGS_AI_CREDITS));
}

export async function addGuidanceCredits(db: SQLiteDatabase, delta: number): Promise<number> {
  if (!Number.isFinite(delta) || delta < 0 || !Number.isInteger(delta)) {
    throw new Error('Credit amount must be a non-negative whole number.');
  }
  const cur = await getGuidanceCreditBalance(db);
  const next = cur + delta;
  await setSetting(db, SETTINGS_AI_CREDITS, String(next));
  return next;
}

export async function assertGuidanceCreditsAvailable(db: SQLiteDatabase, cost: number): Promise<void> {
  if (cost < 1 || !Number.isInteger(cost)) {
    throw new Error('Invalid credit cost.');
  }
  const bal = await getGuidanceCreditBalance(db);
  if (bal < cost) {
    throw new Error(
      `Not enough guidance credits (need ${cost}, have ${bal}). Add credits under Settings → Optional AI guidance.`,
    );
  }
}

/** Call only after a successful model response. */
export async function consumeGuidanceCredits(db: SQLiteDatabase, cost: number): Promise<number> {
  await assertGuidanceCreditsAvailable(db, cost);
  const bal = await getGuidanceCreditBalance(db);
  const next = bal - cost;
  await setSetting(db, SETTINGS_AI_CREDITS, String(next));
  return next;
}
