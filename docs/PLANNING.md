# Aperture Mobile — planning document

This document captures the product intent, MVP scope, and technical decisions for **Aperture Mobile**: a cross‑platform companion focused on **focus**, **cognitive load**, and **operator-owned records**, aligned with the **Aperture Steward** personal agent ([personal-sovereignty-agent](https://github.com/chiku524/aperture-steward) / cognitive-load steward).

---

## 0. Repository location

The app is developed under the **`vibe-code`** workspace on this machine:

- **Directory:** `C:\Users\chiku\Desktop\vibe-code\aperture-mobile`
- **Parent:** `C:\Users\chiku\Desktop\vibe-code`

Do not create a duplicate project outside `vibe-code`; treat this path as the canonical checkout for implementation work.

---

## 1. Problem and stance

- **Problem:** Phones optimize for engagement and interruption. “Focus apps” often block time but rarely help users **close attention loops** or keep **legible receipts** of what happened cognitively.
- **Stance (inherited from Aperture Steward):**
  - Attention is **finite**; the product **protects depth** by default.
  - Prefer **crisp intent**, **bounded sessions**, and **explicit outcomes** over endless reactive churn.
  - **Operator-owned data:** local-first storage, exportable artifacts, optional self-hosted sync—no silent third-party cloud in the MVP.

---

## 2. Target users

Broad personas, same core loop:

| Persona | Example use |
|--------|-------------|
| Students | Reading / problem blocks with a clear “definition of done” |
| Knowledge workers | Maker blocks; meeting prep with a time box |
| Parents / caregivers | Short protected windows with humane exceptions (future OS hooks) |
| Creators | Separate “capture” vs “execute”; single-threaded execution during aperture |

---

## 3. Cognitive framing (product, not medical)

The app borrows **ergonomic** concepts (not clinical claims):

- **Working memory budget:** one primary intent visible; optional tiny “parking lot” for intrusions.
- **Task-switching tax:** session log records **pauses** and **reason tags** to surface patterns over time.
- **Attention residue:** receipt step asks for a **small next physical action** to reduce open loops after the session.

---

## 4. MVP feature set

### 4.1 Five screens

1. **Intent** — Primary outcome (“what does done mean?”), optional parking-lot line, duration preset, **strictness** (soft / hard, informational for now), **Start**.
2. **Aperture** — Full-screen active session: countdown, primary intent, parking lot, **Pause** (reason tag) / **End**.
3. **Receipt** — Summary of the session, editable **digest** fields (summary, risks/unknowns, next step), **Save & finish**.
4. **Ledger** — History of sessions; **Export** (JSON bundle via OS share sheet).
5. **Settings** — Self-hosted **base URL**, **bearer token**, **Test connection**, **Push sync** / **Pull sync** (manual), optional **Wi‑Fi only** toggle (enforced lightly via `expo-network` in a follow-up; stubbed in MVP).

### 4.2 Three core flows

| Flow | Description |
|------|-------------|
| **A — Local only** | Intent → Aperture → Receipt → SQLite + append-only **events**; no account. |
| **B — Optional sync** | User configures URL + token → `GET /health` → manual **Push** / **Pull** with merge-by-id. |
| **C — Export** | From Ledger, export JSON for backups or external tooling (e.g. steward pipelines). |

### 4.3 Non-goals (MVP)

- **Not** a guaranteed OS-wide app blocker on all devices (requires platform-specific entitlements / MDM / Digital Wellbeing APIs).
- **Not** E2E encrypted blobs in v1 (see §6); transport TLS + token only on reference server.
- **Not** continuous background sync or analytics.

---

## 5. Data model (client SQLite)

- **`sessions`** — `id`, `intent`, `parking_note`, `duration_sec`, `strictness`, `started_at`, `ended_at`, `planned_end_at`, `status` (`active` \| `completed` \| `abandoned`).
- **`session_events`** — append-only: `id`, `session_id`, `type` (`start` \| `pause` \| `resume` \| `tick` optional \| `end`), `at`, `payload` (JSON string, e.g. pause reason).
- **`digests`** — `id`, `session_id`, `summary`, `risks`, `next_step`, `created_at`.
- **`settings`** — key/value string store for sync URL, token, flags.

**Conflict / sync strategy (MVP):** immutable session rows; events append-only; digests **last-write-wins** per `id`. Server stores merged JSON rows; client push sends changed entities, pull merges by primary key.

---

## 6. Self-hosted sync API (reference)

Base path: user-provided origin, e.g. `https://aperture.example.com`.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | none | `{ ok, version }` |
| `POST` | `/v1/sync/push` | `Authorization: Bearer <token>` | Body: `{ cursor?, records: SyncRecord[] }` → `{ accepted, nextCursor }` |
| `GET` | `/v1/sync/pull?cursor=` | Bearer | Returns `{ records, nextCursor }` |

`SyncRecord` shape: `{ table, id, updated_at, payload }` where `payload` is the row object.

**Privacy posture (MVP):** TLS + bearer token; reference server persists JSON (suitable for a VPS you control). Upgrade path: client-side encrypted payloads + opaque indexes.

---

## 7. Tech stack

- **Expo SDK 54** (React Native) — cross-platform iOS / Android / web dev preview.
- **expo-sqlite** — offline-first storage.
- **@react-navigation/native** — stack + tabs; **Aperture** / **Receipt** as stack modals above **Main** tabs.
- **Reference sync server** — Node + Express + JSON file store (no native modules) under `sync-server/`.

---

## 8. Roadmap (post-MVP)

- OS integrations: iOS Focus Filters / Shortcuts; Android focus modes where available.
- `expo-network` — enforce Wi‑Fi-only sync.
- Encrypted sync blobs + key management.
- Deep link or share extension to send text into parking lot.
- Optional bridge to **Aperture Steward** for “record decision digest” parity.

---

## 9. Repository layout

```
aperture-mobile/
  App.tsx                 # DB init gate + NavigationContainer + theme
  index.ts                # Registers root; imports react-native-gesture-handler first
  src/
    constants/            # settings key names
    db/                   # SQLite init + queries
    navigation/           # Root stack + main tabs + param types
    screens/              # Intent, Aperture, Receipt, Ledger, Settings
    sync/                 # HTTP client, push bundle builder, pull merge helpers
    theme.ts              # Shared colors / spacing
  docs/
    PLANNING.md           # This file
  sync-server/            # Optional reference Node server (Express + JSON file store)
```

---

## 10. Definition of done (MVP build)

| Area | Status | Notes |
|------|--------|--------|
| Offline sessions (SQLite WAL, foreign keys) | Done | `src/db/database.ts`, `src/db/repo.ts` |
| Five screens + navigation (stack + tabs) | Done | `App.tsx`, `src/navigation/RootNavigator.tsx`, `src/screens/*` |
| Intent → Aperture → Receipt flow | Done | Pause extends `planned_end_at` via `extendPlannedEnd` |
| Ledger + JSON export via share sheet | Done | Uses `expo-file-system/legacy` for `cacheDirectory` / `writeAsStringAsync` (Expo SDK 54) |
| Settings: URL, token, health, push, pull | Done | Pull applies records in a transaction |
| Reference sync server | Done | `sync-server/server.js` — run `cd sync-server && npm install && npm start` (default port **8787**) |

**Non-goals** for this MVP remain as in §4.3 (no OS-wide blocking, no E2E payload encryption, no background sync).

---

## 11. Implementation log

| Date | Milestone |
|------|-----------|
| 2026-04-16 | Wired `App.tsx` to `initDatabase`, dark navigation theme, gesture handler entry. Implemented all five screens, `RootNavigator` (Main tabs + Aperture/Receipt stack), sync helpers (`buildPushRecords`, `applySyncRecord`), repo helpers (`getActiveSession`, `extendPlannedEnd`), and the reference `sync-server`. |

When extending the app, update this table with a one-line note so planning stays aligned with the tree.
