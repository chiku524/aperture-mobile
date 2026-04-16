/**
 * Minimal reference server for Aperture Mobile sync (§6 in docs/PLANNING.md).
 * Run: npm install && npm start — listens on PORT (default 8787).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8787;
const DATA_PATH = path.join(__dirname, 'data', 'store.json');

function readStore() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.records) return parsed;
  } catch {
    /* empty */
  }
  return { records: {}, cursorWatermark: '0' };
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function recordKey(rec) {
  return `${rec.table}:${rec.id}`;
}

const app = express();
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, version: 'aperture-sync-server-1' });
});

app.post('/v1/sync/push', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'missing_bearer_token' });
    return;
  }

  const body = req.body || {};
  const records = Array.isArray(body.records) ? body.records : [];
  const store = readStore();
  let maxTs = Number(store.cursorWatermark) || 0;

  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;
    if (!rec.table || rec.id == null || rec.updated_at == null) continue;
    const key = recordKey(rec);
    store.records[key] = {
      table: String(rec.table),
      id: String(rec.id),
      updated_at: Number(rec.updated_at),
      payload: rec.payload && typeof rec.payload === 'object' ? rec.payload : {},
    };
    maxTs = Math.max(maxTs, Number(rec.updated_at) || 0);
  }

  store.cursorWatermark = String(maxTs);
  writeStore(store);
  res.json({ accepted: records.length, nextCursor: store.cursorWatermark });
});

app.get('/v1/sync/pull', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'missing_bearer_token' });
    return;
  }

  const rawCursor = req.query.cursor;
  const cursor =
    rawCursor == null || rawCursor === '' ? 0 : Number(Array.isArray(rawCursor) ? rawCursor[0] : rawCursor);

  const store = readStore();
  const list = Object.values(store.records).filter((r) => (Number(r.updated_at) || 0) > cursor);
  list.sort((a, b) => (Number(a.updated_at) || 0) - (Number(b.updated_at) || 0));

  const next =
    list.length > 0 ? String(Math.max(...list.map((r) => Number(r.updated_at) || 0))) : store.cursorWatermark;

  res.json({ records: list, nextCursor: next });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Aperture sync server on http://127.0.0.1:${PORT}`);
});
