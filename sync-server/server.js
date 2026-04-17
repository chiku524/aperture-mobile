/**
 * Self-hosted sync + platform OpenAI guidance + in-app purchase credit grants (StoreKit / Play Billing).
 * Env: see env.example
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { SignJWT, importPKCS8 } = require('jose');
const { google } = require('googleapis');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT) || 8787;
const DATA_PATH = path.join(__dirname, 'data', 'store.json');
const ACCOUNTS_PATH = path.join(__dirname, 'data', 'accounts.json');

const SYSTEM = `You are a concise focus coach inside the "Aperture" app, which helps people run bounded deep-work blocks with a clear intent and receipt.
Rules:
- Output ONLY plain text: 5–7 short bullet lines (each starts with "• "). No title line. No markdown fences.
- Be practical: how to enter the block, define "done", handle interruptions, use the parking lot, and one line on how to close the block cleanly.
- Total under 130 words. No medical, clinical, or diagnostic language. No shame or moralizing.
- If the user's intent is vague, still give useful generic structure and one clarifying question as the last bullet prefixed with "• ? "
`;

function hashAccountKey(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function readAccounts() {
  try {
    const raw = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j === 'object' && j.accounts && typeof j.accounts === 'object') {
      if (!j.iap_seen || typeof j.iap_seen !== 'object') {
        j.iap_seen =
          j.webhook_events && typeof j.webhook_events === 'object' ? { ...j.webhook_events } : {};
      }
      return j;
    }
  } catch {
    /* empty */
  }
  return { accounts: {}, iap_seen: {} };
}

function writeAccounts(data) {
  fs.mkdirSync(path.dirname(ACCOUNTS_PATH), { recursive: true });
  fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getCredits(accountKey) {
  const data = readAccounts();
  return Number(data.accounts[accountKey]?.credits) || 0;
}

function deductOneCredit(accountKey) {
  const data = readAccounts();
  const cur = Number(data.accounts[accountKey]?.credits) || 0;
  if (cur < 1) return false;
  data.accounts[accountKey] = { credits: cur - 1 };
  writeAccounts(data);
  return true;
}

function addCredits(accountKey, delta) {
  const data = readAccounts();
  const cur = Number(data.accounts[accountKey]?.credits) || 0;
  data.accounts[accountKey] = { credits: Math.max(0, cur + delta) };
  writeAccounts(data);
  return data.accounts[accountKey].credits;
}

function iapSeenKey(platform, uniqueId) {
  return `${platform}:${uniqueId}`;
}

function hasSeenIap(platform, uniqueId) {
  const data = readAccounts();
  return Boolean(data.iap_seen[iapSeenKey(platform, uniqueId)]);
}

function markIapSeen(platform, uniqueId) {
  const data = readAccounts();
  data.iap_seen[iapSeenKey(platform, uniqueId)] = Date.now();
  writeAccounts(data);
}

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

function openAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim());
}

function appleIapConfigured() {
  return Boolean(
    process.env.APP_STORE_ISSUER_ID &&
      process.env.APP_STORE_KEY_ID &&
      process.env.APP_STORE_PRIVATE_KEY &&
      String(process.env.APP_STORE_PRIVATE_KEY).trim(),
  );
}

function googleIapConfigured() {
  return Boolean(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON &&
      String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON).trim() &&
      process.env.ANDROID_PACKAGE_NAME &&
      String(process.env.ANDROID_PACKAGE_NAME).trim(),
  );
}

function productCreditsMap() {
  try {
    const raw = process.env.IAP_PRODUCT_CREDITS_JSON;
    if (raw && String(raw).trim()) {
      const j = JSON.parse(String(raw));
      if (j && typeof j === 'object') return j;
    }
  } catch {
    /* fall through */
  }
  return {
    'com.aperture.mobile.credits_10': 10,
    'com.aperture.mobile.credits_25': 25,
    'com.aperture.mobile.credits_60': 60,
  };
}

function creditsForProduct(productId) {
  const m = productCreditsMap();
  const n = Number(m[String(productId)]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function decodeJwsPayload(jws) {
  const parts = String(jws).split('.');
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

let appleJwtCache = { token: null, exp: 0 };

async function getAppleApiJwt() {
  const now = Math.floor(Date.now() / 1000);
  if (appleJwtCache.token && appleJwtCache.exp > now + 60) {
    return appleJwtCache.token;
  }
  const issuerId = String(process.env.APP_STORE_ISSUER_ID || '').trim();
  const keyId = String(process.env.APP_STORE_KEY_ID || '').trim();
  const rawKey = String(process.env.APP_STORE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!issuerId || !keyId || !rawKey) return null;
  const privateKey = await importPKCS8(rawKey, 'ES256');
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .setAudience('appstoreconnect-v1')
    .sign(privateKey);
  appleJwtCache = { token, exp: now + 900 };
  return token;
}

async function fetchAppleTransactionJson(transactionId) {
  const jwt = await getAppleApiJwt();
  if (!jwt) {
    const err = new Error('apple_not_configured');
    err.code = 'apple_not_configured';
    throw err;
  }
  for (const sandbox of [false, true]) {
    const base = sandbox
      ? 'https://api.storekit-sandbox.itunes.apple.com'
      : 'https://api.storekit.itunes.apple.com';
    const res = await fetch(`${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status === 404) continue;
    if (!res.ok) {
      const t = await res.text();
      const err = new Error(`apple_tx_failed:${res.status}:${t}`);
      err.code = 'apple_tx_failed';
      throw err;
    }
    return (await res.json());
  }
  const err = new Error('apple_tx_not_found');
  err.code = 'apple_tx_not_found';
  throw err;
}

async function verifyAndGrantApple(accountKey, productId, transactionId) {
  const credits = creditsForProduct(productId);
  if (credits <= 0) {
    const err = new Error('unknown_product');
    err.code = 'unknown_product';
    throw err;
  }
  const body = await fetchAppleTransactionJson(transactionId);
  const jws = body && body.signedTransactionInfo;
  if (!jws || typeof jws !== 'string') {
    const err = new Error('apple_bad_response');
    err.code = 'apple_bad_response';
    throw err;
  }
  const payload = decodeJwsPayload(jws);
  if (!payload || String(payload.productId) !== String(productId)) {
    const err = new Error('apple_product_mismatch');
    err.code = 'apple_product_mismatch';
    throw err;
  }
  const bundleOk = !process.env.IOS_BUNDLE_ID || String(payload.bundleId || '') === String(process.env.IOS_BUNDLE_ID);
  if (!bundleOk) {
    const err = new Error('apple_bundle_mismatch');
    err.code = 'apple_bundle_mismatch';
    throw err;
  }
  const tid = String(payload.transactionId || transactionId);
  if (hasSeenIap('ios', tid)) {
    return { balance: getCredits(accountKey), credits_added: 0, duplicate: true };
  }
  const balance = addCredits(accountKey, credits);
  markIapSeen('ios', tid);
  return { balance, credits_added: credits, duplicate: false };
}

async function verifyAndGrantGoogle(accountKey, productId, purchaseToken, packageName) {
  const expectedPkg = String(process.env.ANDROID_PACKAGE_NAME || '').trim();
  if (expectedPkg && packageName !== expectedPkg) {
    const err = new Error('package_mismatch');
    err.code = 'package_mismatch';
    throw err;
  }
  const credits = creditsForProduct(productId);
  if (credits <= 0) {
    const err = new Error('unknown_product');
    err.code = 'unknown_product';
    throw err;
  }
  const creds = JSON.parse(String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const authClient = await auth.getClient();
  const androidpublisher = google.androidpublisher({ version: 'v3', auth: authClient });
  const getRes = await androidpublisher.purchases.products.get({
    packageName,
    productId,
    token: purchaseToken,
  });
  const data = getRes.data;
  if (Number(data.purchaseState) !== 0) {
    const err = new Error('google_not_purchased');
    err.code = 'google_not_purchased';
    throw err;
  }
  const orderId = String(data.orderId || purchaseToken);
  if (hasSeenIap('android', orderId)) {
    try {
      await androidpublisher.purchases.products.consume({ packageName, productId, token: purchaseToken });
    } catch {
      /* already consumed */
    }
    return { balance: getCredits(accountKey), credits_added: 0, duplicate: true };
  }
  const balance = addCredits(accountKey, credits);
  markIapSeen('android', orderId);
  try {
    await androidpublisher.purchases.products.consume({ packageName, productId, token: purchaseToken });
  } catch (e) {
    const err = new Error(`google_consume_failed:${e instanceof Error ? e.message : 'unknown'}`);
    err.code = 'google_consume_failed';
    throw err;
  }
  return { balance, credits_added: credits, duplicate: false };
}

function buildUserMessage(body) {
  const intent = String(body.intent || '').trim();
  const parkRaw = String(body.parking_lot || '').trim();
  const park = parkRaw ? `Parking lot note: ${parkRaw}` : 'Parking lot: (empty)';
  const dur = Number(body.duration_minutes) || 25;
  const strict = String(body.strictness || 'soft');
  return [
    `Primary intent: ${intent}`,
    park,
    `Duration: ${dur} minutes`,
    `Strictness label: ${strict} (informational)`,
    'Give your bullet list for how to approach this block.',
  ].join('\n');
}

function normalizeModelOutput(raw) {
  return String(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const stripped = l.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '');
      return `• ${stripped}`;
    })
    .join('\n');
}

async function callOpenAiChat(userMessage) {
  const apiKey = String(process.env.OPENAI_API_KEY).trim();
  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      max_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userMessage },
      ],
    }),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Unexpected OpenAI response (${res.status})`);
  }
  if (!res.ok) {
    const msg = json && json.error && json.error.message ? json.error.message : res.statusText;
    throw new Error(msg || `OpenAI request failed (${res.status})`);
  }
  const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) throw new Error('Empty response from the model.');
  return normalizeModelOutput(trimmed);
}

const app = express();
app.use(express.json({ limit: '20mb' }));

function bearer(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: 'aperture-sync-server-3',
    billing: {
      platformGuidance: openAiConfigured(),
      iap: {
        apple: appleIapConfigured(),
        google: googleIapConfigured(),
      },
    },
  });
});

app.get('/v1/billing/balance', (req, res) => {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'missing_bearer_token' });
    return;
  }
  const key = hashAccountKey(token);
  res.json({ credits: getCredits(key) });
});

app.post('/v1/billing/iap/verify', async (req, res) => {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'missing_bearer_token' });
    return;
  }
  const accountKey = hashAccountKey(token);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const platform = String(body.platform || '').toLowerCase();
  const productId = String(body.product_id || '').trim();

  if (!productId) {
    res.status(400).json({ error: 'missing_product_id' });
    return;
  }

  try {
    if (platform === 'ios') {
      if (!appleIapConfigured()) {
        res.status(503).json({ error: 'apple_iap_not_configured' });
        return;
      }
      const transactionId = String(body.apple_transaction_id || '').trim();
      if (!transactionId) {
        res.status(400).json({ error: 'missing_apple_transaction_id' });
        return;
      }
      const result = await verifyAndGrantApple(accountKey, productId, transactionId);
      res.json(result);
      return;
    }

    if (platform === 'android') {
      if (!googleIapConfigured()) {
        res.status(503).json({ error: 'google_iap_not_configured' });
        return;
      }
      const purchaseToken = String(body.google_purchase_token || '').trim();
      const packageName = String(body.google_package_name || '').trim();
      if (!purchaseToken || !packageName) {
        res.status(400).json({ error: 'missing_google_purchase_fields' });
        return;
      }
      const result = await verifyAndGrantGoogle(accountKey, productId, purchaseToken, packageName);
      res.json(result);
      return;
    }

    res.status(400).json({ error: 'invalid_platform' });
  } catch (e) {
    const code = e && e.code ? String(e.code) : 'verify_failed';
    res.status(400).json({
      error: code,
      message: e instanceof Error ? e.message : 'verify_failed',
    });
  }
});

app.post('/v1/ai/intent-guidance', async (req, res) => {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'missing_bearer_token' });
    return;
  }
  if (!openAiConfigured()) {
    res.status(503).json({ error: 'openai_not_configured', message: 'Set OPENAI_API_KEY on the server.' });
    return;
  }

  const accountKey = hashAccountKey(token);
  const bal = getCredits(accountKey);
  if (bal < 1) {
    res.status(402).json({
      error: 'insufficient_credits',
      credits: bal,
      message: 'Not enough platform credits. Purchase a pack in the app (IAP) or use Bring your own API.',
    });
    return;
  }

  const body = req.body || {};
  const intent = String(body.intent || '').trim();
  if (intent.length < 4) {
    res.status(400).json({ error: 'invalid_intent', message: 'Intent should be at least a few words.' });
    return;
  }

  const userMessage = buildUserMessage(body);
  let text;
  try {
    text = await callOpenAiChat(userMessage);
  } catch (e) {
    res.status(502).json({
      error: 'upstream_error',
      message: e instanceof Error ? e.message : 'Model request failed',
    });
    return;
  }

  if (!deductOneCredit(accountKey)) {
    res.status(409).json({ error: 'race', message: 'Could not deduct credit; try again.' });
    return;
  }

  res.json({ text });
});

app.post('/v1/sync/push', (req, res) => {
  const auth = req.headers.authorization || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!tok) {
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
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!tok) {
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
