import type { Ctx } from '../context.js';
import { captureError } from '../admin/errors.js';
import { LlmUnavailable } from '../providers/llm.js';

/**
 * Writes a model outage to the portal's error log (grouped, so a hundred failed turns are one line with a count).
 * Only the vendor's own message is recorded, never anything a person said. Before this, a key that was accepted but
 * could not pay for its model made every conversation go silent while the portal looked healthy.
 */
export function reportLlmFailure(ctx: Ctx, where: string, e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  captureError(ctx, { source: 'api', route: `llm/${where}`, code: err instanceof LlmUnavailable ? 'llm_unavailable' : 'llm_failed', message: err.message });
}
