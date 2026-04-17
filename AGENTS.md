## Learned User Preferences

- Place new projects for this product under `Desktop/vibe-code` unless the user names a different directory.
- Keep planning written in the repo (for example `docs/PLANNING.md`) and implement against that documented plan.
- When the app runs more than one process locally, expose one command to start them together (for example `npm run dev` for Expo and the sync server).
- After native-dependency or config changes that affect binaries, remind to rebuild the dev client or native app as needed.
- For mobile-first features, steer testing toward Expo Go, emulators/simulators, or physical devices rather than relying on a web or Vercel deployment alone.

## Learned Workspace Facts

- `aperture-mobile` is an Expo (TypeScript) app with a `sync-server` subpackage for optional self-hosted sync; local development usually runs both via the root `dev` script.
- Billing is app-store native: the mobile app uses `expo-iap` for StoreKit / Google Play purchases, and the `sync-server` verifies purchases at `/v1/billing/iap/verify`.
- Product direction aligns with a focus-first, cognitive-session model (intent, session, receipt, ledger) related in concept to the user’s `personal-sovereignty-agent` / Aperture Steward work.
