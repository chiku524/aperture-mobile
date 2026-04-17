import type { HealthResponseBody, PullResponseBody, PushRequestBody, PushResponseBody, SyncRecord } from './types';

const HEALTH_TIMEOUT_MS = 15_000;
const PUSH_TIMEOUT_MS = 60_000;
const PULL_TIMEOUT_MS = 60_000;

export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

export class SyncClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async health(): Promise<HealthResponseBody> {
    const res = await fetchWithTimeout(joinUrl(this.baseUrl, '/health'), undefined, HEALTH_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(`Health check failed: ${res.status}`);
    }
    return (await res.json()) as HealthResponseBody;
  }

  async push(body: PushRequestBody): Promise<PushResponseBody> {
    const res = await fetchWithTimeout(
      joinUrl(this.baseUrl, '/v1/sync/push'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      },
      PUSH_TIMEOUT_MS,
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Push failed (${res.status}): ${t}`);
    }
    return (await res.json()) as PushResponseBody;
  }

  async pull(cursor: string | null): Promise<PullResponseBody> {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const res = await fetchWithTimeout(
      joinUrl(this.baseUrl, `/v1/sync/pull${q}`),
      { headers: { Authorization: `Bearer ${this.token}` } },
      PULL_TIMEOUT_MS,
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Pull failed (${res.status}): ${t}`);
    }
    return (await res.json()) as PullResponseBody;
  }
}

export function sessionRowToRecord(row: Record<string, unknown>): SyncRecord {
  return {
    table: 'sessions',
    id: String(row.id),
    updated_at: Number(row.ended_at ?? row.started_at),
    payload: row,
  };
}

export function digestRowToRecord(row: Record<string, unknown>): SyncRecord {
  return {
    table: 'digests',
    id: String(row.id),
    updated_at: Number(row.created_at),
    payload: row,
  };
}

export function eventRowToRecord(row: Record<string, unknown>): SyncRecord {
  return {
    table: 'session_events',
    id: String(row.id),
    updated_at: Number(row.at),
    payload: row,
  };
}

export function sessionMetricsRowToRecord(row: Record<string, unknown>): SyncRecord {
  return {
    table: 'session_metrics',
    id: String(row.session_id),
    updated_at: Number(row.updated_at),
    payload: row,
  };
}
