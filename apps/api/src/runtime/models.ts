// The models the portal lets you choose between. Add a line here when a new one is released; settings are validated
// against this list, so a typo can never switch the app to a model that doesn't exist.
export interface ModelInfo { id: string; label: string; note: string }

export const MODELS: ModelInfo[] = [
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'most capable, slowest and costliest' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'deep reasoning, good for analysis' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'balanced: quality and speed for live replies' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'fastest and cheapest, good for the safety check' },
];

/** The catalogue plus any model the server was started with, so an existing environment value is never rejected. */
export function modelOptions(...current: string[]): { value: string; label: string }[] {
  const known = new Set(MODELS.map(m => m.id));
  return [
    ...MODELS.map(m => ({ value: m.id, label: `${m.label} · ${m.note}` })),
    ...[...new Set(current)].filter(c => c && !known.has(c)).map(c => ({ value: c, label: `${c} · set by the server` })),
  ];
}
