import { joinUrl } from '../sync/syncClient';
import type { HealthResponseBody } from '../sync/types';

export type PlatformBalanceResponse = {
  credits: number;
};

export async function fetchPublicHealth(baseUrl: string): Promise<HealthResponseBody> {
  const b = baseUrl.trim().replace(/\/+$/, '');
  if (!b) {
    throw new Error('Missing server URL.');
  }
  const res = await fetch(joinUrl(b, '/health'));
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return (await res.json()) as HealthResponseBody;
}

export async function fetchPlatformCreditBalance(
  baseUrl: string,
  token: string,
): Promise<PlatformBalanceResponse> {
  const res = await fetch(joinUrl(baseUrl.trim().replace(/\/+$/, ''), '/v1/billing/balance'), {
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Balance failed (${res.status}): ${t}`);
  }
  return (await res.json()) as PlatformBalanceResponse;
}
