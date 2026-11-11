// Errors are returned, never thrown across a door (tools.md, Shared rules).
import { NotImplementedError } from '@petal/core';
import type { ToolError, ToolErrorCode } from '@petal/core/types';

export const ERROR_CODES: readonly ToolErrorCode[] = [
  'bad_input',
  'not_found',
  'cannot_read',
  'source_failed',
  'rate_limited',
  'invalid_spec',
  'unauthorised',
  'invite_required',
  'budget_exhausted',
  'payment_required',
  'not_on_this_site',
  'internal',
];

/** HTTP status per error code (http-api.md, Rules). */
export const HTTP_STATUS: Record<
  ToolErrorCode,
  400 | 401 | 402 | 403 | 404 | 422 | 429 | 500 | 503
> = {
  bad_input: 400,
  unauthorised: 401,
  invite_required: 403,
  not_found: 404,
  cannot_read: 422,
  invalid_spec: 422,
  rate_limited: 429,
  budget_exhausted: 429,
  payment_required: 402,
  not_on_this_site: 403,
  // 503, not 502: Cloudflare, in front of the live server, swaps an origin's 502 or 504 for its own page,
  // and the person would read that instead of these words (onchain-walk, 11 Nov).
  source_failed: 503,
  internal: 500,
};

export function toolError(
  code: ToolErrorCode,
  message: string,
  hint?: string,
  retry_after_s?: number,
): ToolError {
  const error: ToolError['error'] = { code, message };
  if (hint !== undefined) error.hint = hint;
  if (retry_after_s !== undefined) error.retry_after_s = retry_after_s;
  return { error };
}

export function isToolError(x: unknown): x is ToolError {
  if (typeof x !== 'object' || x === null || !('error' in x)) return false;
  const e = (x as { error: unknown }).error;
  return (
    typeof e === 'object' &&
    e !== null &&
    ERROR_CODES.includes((e as { code: ToolErrorCode }).code) &&
    typeof (e as { message: unknown }).message === 'string'
  );
}

/**
 * An error thrown inside a tool, as a ToolError. A thrown error that carries a known `code`
 * (and optionally `hint`, `retry_after_s`) keeps it; a stub that is not built yet is `internal`;
 * anything else gets `fallback`.
 */
export function fromThrown(err: unknown, fallback: ToolErrorCode = 'internal'): ToolError {
  if (isToolError(err)) return err;
  if (err instanceof NotImplementedError) {
    return toolError(
      'internal',
      `not built yet: ${err.message.replace(/^not_implemented: /, '')}`,
      'This part of Petals is still being built (milestone M1).',
    );
  }
  const e = (err ?? {}) as { code?: unknown; message?: unknown; hint?: unknown };
  const message = err instanceof Error ? err.message : String(e.message ?? err);
  const code = ERROR_CODES.includes(e.code as ToolErrorCode) ? (e.code as ToolErrorCode) : fallback;
  const retry = (e as { retry_after_s?: unknown }).retry_after_s;
  const out = toolError(
    code,
    message || code,
    typeof e.hint === 'string' ? e.hint : undefined,
    typeof retry === 'number' ? retry : undefined,
  );
  const ended = (e as { ended?: unknown }).ended;
  if (ended === 'stopped' || ended === 'handed_over') out.error.ended = ended;
  return out;
}

/** An Error carrying a tool error code, for code that throws inside a tool. */
export class ToolFailure extends Error {
  readonly code: ToolErrorCode;
  readonly hint?: string;
  readonly retry_after_s?: number;
  /** a worker's job that ended for it (swarm.md step 3) */
  ended?: 'stopped' | 'handed_over';
  constructor(code: ToolErrorCode, message: string, hint?: string, retryAfterS?: number) {
    super(message);
    this.name = 'ToolFailure';
    this.code = code;
    if (hint !== undefined) this.hint = hint;
    if (retryAfterS !== undefined) this.retry_after_s = retryAfterS;
  }
}
