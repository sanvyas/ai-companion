import { z } from 'zod';
import { ConversationMode, Emotion, RiskLevel, Theme, Uuid } from './common.js';

export const CreateConversationBody = z.object({ mode: ConversationMode, continueFrom: Uuid.optional() });
export const ConversationCreated = z.object({
  id: Uuid,
  mode: ConversationMode,
  /** No WebRTC yet: voice runs over the same WebSocket. */
  rtcToken: z.null(),
  voice: z.object({ serverStt: z.boolean(), serverTts: z.boolean() }),
});

export const ProposedMemory = z.object({
  theme: Theme,
  text: z.string().max(120),
  sensitive: z.boolean(),
});

export const CheckinResult = z.object({
  sleep: z.string(),
  food: z.string(),
  people: z.string(),
  okayThing: z.string(),
  mood: z.number().int().min(0).max(4).nullable(),
  intentions: z.array(z.string()).max(2),
});

export const EndConversationResponse = z.object({
  summary: z.string(),
  proposedMemories: z.array(ProposedMemory),
  checkinResult: CheckinResult.nullable(),
});

export const ConversationItem = z.object({
  id: Uuid,
  mode: ConversationMode,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  summary: z.string().nullable(),
});

export const EndFeedback = z.object({ feeling: z.enum(['better', 'same', 'worse']).optional() });

// ---- WebSocket protocol (/conversations/:id/stream) --------------------------------------------
export const ClientMsg = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string() }),
  z.object({ type: z.literal('turn'), text: z.string().trim().min(1).max(4000), clientId: z.string().max(64).optional(), source: z.enum(['typed', 'dictated', 'voice']).default('typed') }),
  z.object({ type: z.literal('silence'), seconds: z.number().int().min(1).max(3600) }),
  z.object({ type: z.literal('interrupt') }), // barge-in: stop generating
  z.object({ type: z.literal('end') }),
  z.object({ type: z.literal('ping') }),
]);

export const ServerMsg = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), conversationId: Uuid, mode: ConversationMode, companion: z.object({ name: z.string(), look: z.string(), voice: z.string() }), voice: z.object({ serverStt: z.boolean(), serverTts: z.boolean() }), opening: z.string().nullable() }),
  z.object({ type: z.literal('ack'), clientId: z.string().optional(), riskLevel: RiskLevel }),
  z.object({ type: z.literal('thinking') }),
  z.object({ type: z.literal('sentence'), text: z.string(), emotion: Emotion.optional(), index: z.number().int() }),
  z.object({ type: z.literal('done'), messageId: Uuid.nullable(), riskLevel: RiskLevel, text: z.string() }),
  /** Level 2: show the inline care card. */
  z.object({ type: z.literal('care_card') }),
  /** Level 3: the crisis screen takes over. `script` is fixed and reviewed, never model output. */
  z.object({ type: z.literal('crisis'), script: z.string() }),
  /** The user said they are under 18: account paused, show youth resources. */
  z.object({ type: z.literal('minor') }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
  z.object({ type: z.literal('pong') }),
]);

export type ClientMsg = z.infer<typeof ClientMsg>;
export type ServerMsg = z.infer<typeof ServerMsg>;
export type ProposedMemory = z.infer<typeof ProposedMemory>;
export type CheckinResult = z.infer<typeof CheckinResult>;
export type ConversationItem = z.infer<typeof ConversationItem>;
