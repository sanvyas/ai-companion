import type { ConversationMode, Language } from '@saathi/contracts';
import { prompt } from '../runtime/prompts.js';
import { personaOf, type Persona } from './voices.js';

// System prompts from PRD 6.1 / 6.2 / 6.3. The wording lives in runtime/promptDefs.ts and can be replaced from the
// admin portal; this file assembles it. The STABLE block is identical across a user's turns so it can be cached;
// everything that changes per turn (memories, plan, safety level) goes in the DYNAMIC block.

const LANGUAGE: Record<Language, string> = {
  en: 'English',
  hinglish: 'Hinglish: natural Hindi-English code-mixing written in Latin script, the way young Indians text and talk',
  hi: 'Hindi, written in Devanagari',
};

const VOICE: Record<Persona, string> = {
  warm: 'warm = soft and caring',
  steady: 'steady = calm, slower, grounded',
  bright: 'bright = lighter, a little more upbeat',
};

/** Reads a prompt by key. The live app uses the published versions; the portal's test bench passes a getter with a draft swapped in. */
export type PromptGetter = (key: string, vars?: Record<string, string>) => string;

export function stableSystem(p: { companionName: string; nickname: string; language: Language; voice: string }, get: PromptGetter = prompt): string {
  return get('companion.stable', { companionName: p.companionName, nickname: p.nickname.trim() || 'the user', language: LANGUAGE[p.language], voice: VOICE[personaOf(p.voice)] });
}

export interface DynamicInput {
  mode: ConversationMode;
  localTime: string;
  planItems: string[];
  moodTrend: string;
  memories: string[];
  hasSafetyPlan: boolean;
  trustedFirstName: string | null;
  riskLevel: 0 | 1 | 2;
  priorSummary: string | null;
  openingHookSpoken: string | null;
  strict?: boolean;
  firstRun?: boolean;
}

export function dynamicSystem(d: DynamicInput, get: PromptGetter = prompt): string {
  const lines: string[] = [];
  lines.push(`MODE: ${get(`mode.${d.mode}`)}`);
  lines.push(`CONTEXT\n- Local time: ${d.localTime}.\n- Today's plan: ${d.planItems.length ? d.planItems.join('; ') : 'nothing yet'}.\n- Recent mood: ${d.moodTrend}.`);
  lines.push(`- Memories you may use: ${d.memories.length ? d.memories.map(m => `"${m}"`).join('; ') : 'none'}.`);
  if (d.priorSummary) lines.push(`- Earlier in this thread: ${d.priorSummary}`);
  if (d.openingHookSpoken) lines.push(`- You already opened with: "${d.openingHookSpoken}". Do not repeat it.`);
  lines.push(`- Safety plan exists: ${d.hasSafetyPlan ? 'yes' : 'no'}. Trusted contact first name: ${d.trustedFirstName ?? 'none'}.`);
  const sb = d.riskLevel === 0 ? '' : get(`safety.level${d.riskLevel}`);
  lines.push(`SAFETY INSTRUCTIONS\n${sb || 'No safety concern right now. Stay attentive.'}`);
  if (d.firstRun) lines.push(get('context.first_run'));
  if (d.strict) lines.push(get('safety.strict'));
  return lines.join('\n\n');
}

export const classifierSystem = () => prompt('classifier');
export const outputCheckSystem = () => prompt('output_check');
export const summarySystem = () => prompt('summary');
export const memoryProposalSystem = () => prompt('memories');
export const checkinExtractSystem = () => prompt('checkin_extract');
export const planSystem = () => prompt('plan');
