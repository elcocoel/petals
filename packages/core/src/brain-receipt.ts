// brain-receipt/v1: one serving of the brain's text by a door, the Harness's brain_access_log field for field.
import { createAjv, schemaId } from './schema/ajv.ts';
import type { Result, ValidationIssue } from './types/index.ts';

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** The receipt, or every reason it isn't one. */
export function validateBrainReceipt(x: unknown): Result<Record<string, unknown>> {
  compiled ??= createAjv().getSchema(schemaId('brainReceipt'));
  if (!compiled) throw new Error('brain-receipt schema not registered');
  if (compiled(x)) return { ok: true, value: x as Record<string, unknown> };
  return {
    ok: false,
    errors: (compiled.errors ?? []).map(
      (e): ValidationIssue => ({
        path: e.instancePath,
        rule: 'schema',
        message: e.message ?? 'invalid',
      }),
    ),
  };
}
