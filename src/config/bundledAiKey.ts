/**
 * OpenAI-compatible API key from the Metro bundle (Expo `EXPO_PUBLIC_*` env).
 * Prefer entering the key in Settings when possible so it is not embedded in release builds.
 */
export function getBundledOpenAiApiKey(): string {
  const k = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  return typeof k === 'string' ? k.trim() : '';
}

/** Saved Settings value wins over bundled env (explicit device configuration). */
export function resolveEffectiveAiApiKey(storedKey: string | null | undefined): string {
  const s = storedKey?.trim() ?? '';
  if (s) return s;
  return getBundledOpenAiApiKey();
}
