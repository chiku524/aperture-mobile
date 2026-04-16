import type { HealthResponseBody, PullResponseBody, PushRequestBody, PushResponseBody, SyncRecord } from './types';

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return `${b}/${p}`;
}

export class SyncClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async health(): Promise<HealthResponseBody> {
    const res = await fetch(joinUrl(this.baseUrl, '/health'));
    if (!res.ok) {
      throw new Error(`Health check failed: ${res.status}`);
    }
    return (await res.json()) as HealthResponseBody;
  }

  async push(body: PushRequestBody): Promise<PushResponseBody> {
    const res = await fetch(joinUrl(this.baseUrl, '/v1/sync/push'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Push failed (${res.status}): ${t}`);
    }
    return (await res.json()) as PushResponseBody;
  }

  async pull(cursor: string | null): Promise<PullResponseBody> {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const res = await fetch(joinUrl(this.baseUrl, `/v1/sync/pull${q}`), {
      headers: { Authorization: `Bearer ${this.token}` },
    });
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
