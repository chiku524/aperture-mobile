export type AiSource = 'byo' | 'platform';

export function parseAiSource(raw: string | null): AiSource {
  return raw === 'platform' ? 'platform' : 'byo';
}
