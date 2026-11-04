// Errors from @petal/near carry a tools.md error code, so @petal/tools can turn any of them into a
// ToolError ({ error: { code, message, hint } }) without parsing messages.
import type { ToolErrorCode } from '@petal/core/types';

export class NearError extends Error {
  readonly code: ToolErrorCode;
  readonly hint?: string;
  readonly retry_after_s?: number;
  /** set when a transaction was sent: the write may still land (map writes) */
  readonly tx_hash?: string;

  constructor(
    code: ToolErrorCode,
    message: string,
    extra: { hint?: string; retry_after_s?: number; tx_hash?: string; cause?: unknown } = {},
  ) {
    super(message, extra.cause === undefined ? undefined : { cause: extra.cause });
    this.name = 'NearError';
    this.code = code;
    if (extra.hint !== undefined) this.hint = extra.hint;
    if (extra.retry_after_s !== undefined) this.retry_after_s = extra.retry_after_s;
    if (extra.tx_hash !== undefined) this.tx_hash = extra.tx_hash;
  }
}

/** A short, key-free description of anything thrown. */
export function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
