// proposals/v1 (board #93; Elco, 11 Nov: proposals on the flower's ring, and on hover each wallet's yes and no,
// absent showing nothing): a DAO's proposals and how each account voted, read from its own chain, kept by the
// map's address. An account that didn't vote isn't in a proposal's votes: absent, never a guess.
import { createAjv, schemaId } from './schema/ajv.ts';
import type { Result, ValidationIssue } from './types/index.ts';

/** proposals/v3 since 12 Nov: v2 with each proposal's summary and a link to read it. v1 and v2 still read. */
export const PROPOSALS_VERSION = 'proposals/v3';

export type Vote = 'for' | 'against' | 'abstain';
export type Outcome =
  | 'passed'
  | 'rejected'
  | 'removed'
  | 'expired'
  | 'in progress'
  | 'failed'
  | 'moved'
  | 'cancelled'
  /** v2: voting closed and its source doesn't say the result (Snapshot) */
  | 'closed';

export interface ProposalVote {
  account: string;
  /** v2: null when the ballot's choices don't fit for, against or abstain */
  vote: Vote | null;
  /** v2: what it chose, as said, each with its weight in decimal text */
  choices?: { choice: string; weight: string | null }[];
  /** v2: its voting power as its source says it, in decimal text */
  power?: string;
  /** the DAO's own word: Approve, Reject, Remove, true, false */
  as_said: string;
  at: string | null;
}
/** v3: a link to read a proposal: its own page on its source, or an address its own text names. */
export interface ProposalLink {
  url: string;
  kind: 'where it was made' | 'named in its text';
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
  /** v2: who it pays or names, or null */
  recipient?: string | null;
  /** v2: its options' labels, where a ballot chooses among them */
  options?: string[];
  /** v3: its own text, whole, as its source says it, or null */
  summary?: string | null;
  /** v3: where to read it, and whether that's where it was made or an address its text names */
  link?: ProposalLink | null;
  votes: ProposalVote[];
}
export interface Proposals {
  petal: 'proposals/v1' | 'proposals/v2' | typeof PROPOSALS_VERSION;
  about: string;
  source: { kind: string; contract: string; ref: string; at: string };
  proposals: Proposal[];
  read_at: string;
}

const compiled = new Map<string, ReturnType<ReturnType<typeof createAjv>['getSchema']>>();

const PROPOSALS_SCHEMA: Record<string, 'proposals' | 'proposalsV2' | 'proposalsV3'> = {
  'proposals/v1': 'proposals',
  'proposals/v2': 'proposalsV2',
  'proposals/v3': 'proposalsV3',
};

/** The proposals, typed, or every reason they aren't proposals (v1, v2 or v3, by their petal). */
export function validateProposals(x: unknown): Result<Proposals> {
  const petal = (x as { petal?: unknown } | null)?.petal;
  const name = (typeof petal === 'string' && PROPOSALS_SCHEMA[petal]) || 'proposalsV2';
  if (!compiled.has(name)) compiled.set(name, createAjv().getSchema(schemaId(name)));
  const v = compiled.get(name);
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
  // Astro's proposals end their text with '$$$$' and a link: the title is the text before it
  const t = splitAstro(text ?? '').text.replace(/<br\s*\/?>/gi, '\n');
  const line = /(?:^|\n)\s*[*#-]*\s*Title\s*:\s*(.+)/i.exec(t)?.[1];
  const first = (line ?? t.split('\n').find((l) => l.trim()) ?? '').replace(/[*#_`]/g, '').trim();
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first;
}

/** A proposal's text as Astro wrote it, 'text$$$$link': the text, and the link when one follows. */
export function splitAstro(text: string): { text: string; link: string | null } {
  const i = text.indexOf('$$$$');
  if (i < 0) return { text, link: null };
  const after = text.slice(i + 4).trim();
  return { text: text.slice(0, i), link: /^https?:\/\/\S+$/.test(after) ? after : null };
}

/** The first web address a proposal's own text names, or null. */
export function firstAddress(text: string): string | null {
  const m = /https?:\/\/[^\s)<>\]"'`]+/.exec(text);
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null;
}
