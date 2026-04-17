export const SETTINGS_SYNC_BASE_URL = 'sync_base_url';
export const SETTINGS_SYNC_TOKEN = 'sync_token';

/** Epoch ms string set after a successful manual push or pull sync (local bookkeeping). */
export const SETTINGS_LAST_SYNC_AT = 'last_sync_at';

/** `'1'` to record time with this app in the foreground during a session (not OS-wide screen time). */
export const SETTINGS_METRICS_APP_TIME = 'metrics_record_app_time';
/** `'1'` to request motion permission and record steps / approximate distance where supported. */
export const SETTINGS_METRICS_MOTION = 'metrics_record_motion';

/** `'1'` to allow push/pull only when not on a cellular data connection (see `expo-network`). */
export const SETTINGS_WIFI_ONLY_SYNC = 'wifi_only_sync';

/** `'1'` to run a background pull merge when the app returns to the foreground (throttled; respects Wi‑Fi only). */
export const SETTINGS_SYNC_PULL_ON_FOREGROUND = 'sync_pull_on_foreground';

/** OpenAI-compatible API root, e.g. `https://api.openai.com/v1` or a Groq/Azure endpoint ending in `/v1`. */
export const SETTINGS_AI_API_BASE = 'ai_api_base';
/** Bearer token for the guidance API (stored like sync token; use a restricted key when possible). */
export const SETTINGS_AI_API_KEY = 'ai_api_key';
/** Chat model id (e.g. `gpt-4o-mini`). */
export const SETTINGS_AI_MODEL = 'ai_model';

/** Non-negative integer string: credits consumed per successful guidance request. */
export const SETTINGS_AI_CREDITS = 'ai_guidance_credits';

/** `'byo'` = device API key + local credits; `'platform'` = same server as sync, StoreKit/Play credits, operator OpenAI key. */
export const SETTINGS_AI_SOURCE = 'ai_source';
