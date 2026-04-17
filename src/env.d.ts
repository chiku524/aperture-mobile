declare namespace NodeJS {
  interface ProcessEnv {
    /** Inlined by Metro when present in `.env` at `expo start` / EAS build time. */
    EXPO_PUBLIC_OPENAI_API_KEY?: string;
  }
}
