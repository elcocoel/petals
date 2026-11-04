// Errors the input layer raises. Tools turn them into ToolError (tools.md, Shared rules): an
// InputError carries the tool error code, a hint, and for source failures which source failed.
import type { ToolError, ToolErrorCode } from '@petal/core/types';

/** One endpoint that failed during a call, and why. */
export interface SourceFailure {
  /** endpoint id, e.g. drpc, fastnear, shitzu */
  endpoint: string;
  url: string;
  reason: string;
}

export class InputError extends Error {
  readonly code: ToolErrorCode;
  readonly hint?: string;
  readonly retry_after_s?: number;
  /** the endpoints that failed, for source_failed and rate_limited */
  readonly failures?: SourceFailure[];

  constructor(
    code: ToolErrorCode,
    message: string,
    extra: { hint?: string; retry_after_s?: number; failures?: SourceFailure[] } = {},
  ) {
    super(message);
    this.name = 'InputError';
    this.code = code;
    if (extra.hint !== undefined) this.hint = extra.hint;
    if (extra.retry_after_s !== undefined) this.retry_after_s = extra.retry_after_s;
    if (extra.failures !== undefined) this.failures = extra.failures;
  }

  toToolError(): ToolError {
    const error: ToolError['error'] = { code: this.code, message: this.message };
    if (this.hint !== undefined) error.hint = this.hint;
    if (this.retry_after_s !== undefined) error.retry_after_s = this.retry_after_s;
    return { error };
  }
}

export const isInputError = (e: unknown): e is InputError => e instanceof InputError;
