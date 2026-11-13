// calls/v1 (12 Nov), so people find paid work in DAOs and DAOs find talent: one open call, every field as its
// source says it. The schema is
// schema/calls-v1.schema.json; this is its type and its check.
import { createAjv, schemaId } from './schema/ajv.ts';
import type { Result, ValidationIssue } from './types/index.ts';

export const CALLS_VERSION = 'calls/v1';

export type CallKind =
  | 'rfp'
  | 'grants'
  | 'bounty'
  | 'hackathon'
  | 'accelerator'
  | 'fund'
  | 'vote'
  | 'other';

export interface Call {
  petal: 'calls/v1';
  /** the source's own id as <source>:<id>, else the link */
  id: string;
  kind: CallKind;
  title: string;
  summary: string | null;
  offered_by: { name: string; about: string | null };
  /** in the call's own words and currency */
  budget: string | null;
  opens: string | null;
  closes: string | null;
  /** as its source says it, kept beside its deadline */
  status: string | null;
  link: string;
  source: { name: string; ref: string; read_at: string };
  how: 'sourced' | 'inferred';
  evidence?: string | null;
}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** The call, typed, or every reason it isn't one. */
export function validateCall(x: unknown): Result<Call> {
  compiled ??= createAjv().getSchema(schemaId('calls'));
  if (!compiled) throw new Error('calls schema not registered');
  if (compiled(x)) return { ok: true, value: x as Call };
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
