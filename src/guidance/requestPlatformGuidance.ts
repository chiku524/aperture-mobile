import type { Strictness } from '../db/repo';
import { joinUrl } from '../sync/syncClient';

export type PlatformGuidanceInput = {
  syncBaseUrl: string;
  syncToken: string;
  intent: string;
  parkingLot: string;
  durationMinutes: number;
  strictness: Strictness;
};

type GuidanceOk = { text: string };
type GuidanceErr = { error: string; message?: string; credits?: number };

/**
 * Intent suggestions via the self-hosted sync server (operator OpenAI key + server-side credits).
 */
export async function requestPlatformGuidance(input: PlatformGuidanceInput): Promise<string> {
  const base = input.syncBaseUrl.trim().replace(/\/+$/, '');
  const token = input.syncToken.trim();
  if (!base || !token) {
    throw new Error('Set sync base URL and bearer token in Settings.');
  }
  const url = joinUrl(base, '/v1/ai/intent-guidance');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      intent: input.intent.trim(),
      parking_lot: input.parkingLot.trim(),
      duration_minutes: input.durationMinutes,
      strictness: input.strictness,
    }),
  });
  let json: GuidanceOk & GuidanceErr;
  try {
    json = (await res.json()) as GuidanceOk & GuidanceErr;
  } catch {
    throw new Error(`Unexpected response (${res.status}).`);
  }
  if (!res.ok) {
    if (res.status === 402) {
      const c = json.credits;
      const suffix = typeof c === 'number' ? ` You have ${c} credits.` : '';
      throw new Error((json.message || 'Not enough credits.') + suffix);
    }
    throw new Error(json.message || json.error || `Request failed (${res.status})`);
  }
  if (typeof json.text !== 'string' || !json.text.trim()) {
    throw new Error('Empty response from server.');
  }
  return json.text.trim();
}
