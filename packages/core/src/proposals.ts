// proposals/v1 (board #93; Elco, 11 Nov: proposals on the flower's ring, and on hover each wallet's yes and no,
// absent showing nothing): a DAO's proposals and how each account voted, read from its own chain, kept by the
// map's address. An account that didn't vote isn't in a proposal's votes: absent, never a guess.
import { createAjv, schemaId } from './schema/ajv.ts';
import type { Result, ValidationIssue } from './types/index.ts';

export const PROPOSALS_VERSION = 'proposals/v1';

export type Vote = 'for' | 'against' | 'abstain';
export type Outcome =
  | 'passed'
  | 'rejected'
  | 'removed'
  | 'expired'
  | 'in progress'
  | 'failed'
  | 'moved'
  | 'cancelled';

export interface ProposalVote {
  account: string;
  vote: Vote;
  /** the DAO's own word: Approve, Reject, Remove, true, false */
  as_said: string;
  at: string | null;
}
export interface Proposal {
  id: string;
  title: string;
  kind: string | null;
  proposer: string | null;
  at: string;
  closes_at: string | null;
  decided_at: string | null;
  outcome: Outcome;
  as_said: string;
  ref: string;
  votes: ProposalVote[];
}
export interface Proposals {
  petal: typeof PROPOSALS_VERSION;
  about: string;
  source: { kind: string; contract: string; ref: string; at: string };
  proposals: Proposal[];
  read_at: string;
}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** The proposals, typed, or every reason they aren't proposals/v1. */
export function validateProposals(x: unknown): Result<Proposals> {
  if (!compiled) compiled = createAjv().getSchema(schemaId('proposals'));
  const v = compiled;
  if (!v) throw new Error('proposals schema not registered');
  if (v(x)) return { ok: true, value: x as Proposals };
  return {
    ok: false,
    errors: (v.errors ?? []).slice(0, 50).map(
      (e): ValidationIssue => ({
        path: e.instancePath,
        rule: 'schema',
        message: e.message ?? 'invalid',
      }),
    ),
  };
}

/** A proposal's title from its own text: a "Title:" line, else its first words. */
export function titleOf(text: string): string {
  const t = (text ?? '').replace(/<br\s*\/?>/gi, '\n');
  const line = /(?:^|\n)\s*[*#-]*\s*Title\s*:\s*(.+)/i.exec(t)?.[1];
  const first = (line ?? t.split('\n').find((l) => l.trim()) ?? '').replace(/[*#_`]/g, '').trim();
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first;
}
