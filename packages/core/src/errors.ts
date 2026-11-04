// Errors core throws for bad calls. Tools turn them into ToolError (`bad_input`, `invalid_spec`);
// callers can test `code` instead of the class.
import type { ValidationIssue } from './types/index.ts';

/** A choice or option that does not apply: names the allowed values in `allowed` and `hint`. */
export class BadInputError extends Error {
  readonly code = 'bad_input';
  readonly hint: string | undefined;
  readonly allowed: string[] | undefined;
  constructor(message: string, opts: { hint?: string; allowed?: string[] } = {}) {
    super(message);
    this.name = 'BadInputError';
    this.hint = opts.hint;
    this.allowed = opts.allowed;
  }
}

/** renderFlower refuses a spec validateSpec rejects; `errors` are validateSpec's. */
export class InvalidSpecError extends Error {
  readonly code = 'invalid_spec';
  readonly errors: ValidationIssue[];
  constructor(errors: ValidationIssue[]) {
    const first = errors[0];
    super(
      `invalid_spec: ${first ? `${first.rule} at ${first.path || '/'}: ${first.message}` : 'rejected'}` +
        (errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''),
    );
    this.name = 'InvalidSpecError';
    this.errors = errors;
  }
}
