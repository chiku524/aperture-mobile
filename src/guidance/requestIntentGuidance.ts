import type { Strictness } from '../db/repo';

const SYSTEM = `You are a concise focus coach inside the "Aperture" app, which helps people run bounded deep-work blocks with a clear intent and receipt.
Rules:
- Output ONLY plain text: 5–7 short bullet lines (each starts with "• "). No title line. No markdown fences.
- Be practical: how to enter the block, define "done", handle interruptions, use the parking lot, and one line on how to close the block cleanly.
- Total under 130 words. No medical, clinical, or diagnostic language. No shame or moralizing.
- If the user's intent is vague, still give useful generic structure and one clarifying question as the last bullet prefixed with "• ? "
`;

export type IntentGuidanceInput = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  intent: string;
  parkingLot: string;
  durationMinutes: number;
  strictness: Strictness;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

function resolveChatCompletionsUrl(base: string): string {
  const b = base.trim().replace(/\/+$/, '');
  if (!b) {
    throw new Error('API base URL is empty. Set it in Settings → Optional AI guidance.');
  }
  if (/\/v\d+$/i.test(b)) {
    return `${b}/chat/completions`;
  }
  return `${b}/v1/chat/completions`;
}

function buildUserMessage(input: IntentGuidanceInput): string {
  const park = input.parkingLot.trim() ? `Parking lot note: ${input.parkingLot.trim()}` : 'Parking lot: (empty)';
  return [
    `Primary intent: ${input.intent.trim()}`,
    park,
    `Duration: ${input.durationMinutes} minutes`,
    `Strictness label: ${input.strictness} (informational)`,
    'Give your bullet list for how to approach this block.',
  ].join('\n');
}

function normalizeModelOutput(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const stripped = l.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '');
      return `• ${stripped}`;
    })
    .join('\n');
}

/**
 * Calls the configured OpenAI-compatible `chat/completions` endpoint from the device.
 * The app does not proxy or log requests on your behalf.
 */
export async function requestIntentGuidance(input: IntentGuidanceInput): Promise<string> {
  const key = input.apiKey.trim();
  if (!key) {
    throw new Error('Add an API key in Settings → Optional AI guidance.');
  }
  const url = resolveChatCompletionsUrl(input.apiBaseUrl);
  const model = input.model.trim() || 'gpt-4o-mini';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      max_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserMessage(input) },
      ],
    }),
  });

  let json: ChatCompletionResponse;
  try {
    json = (await res.json()) as ChatCompletionResponse;
  } catch {
    throw new Error(`Unexpected response (${res.status}). Check the API base URL.`);
  }
  if (!res.ok) {
    const msg = json.error?.message ?? res.statusText;
    throw new Error(msg || `Request failed (${res.status})`);
  }
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Empty response from the model.');
  }
  return normalizeModelOutput(content);
}
