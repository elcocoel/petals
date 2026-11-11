// A flower's voting blocs (#94; Elco, 11 Nov: "this will allow us, with the added element of time periods to
// allow models to map voting blocks"), as the legend's Highlight row says them: each bloc by how many vote
// alike, its pairs quiet beside it, the period the votes come from, and what voting alike doesn't prove
// (inferred, never proof of coordination). Pure. The words are drafts.
import type { Blocs } from '@petal/core';
import { dayOf } from './map-claims.ts';

/** Which votes the blocs come from: the server's own period (its recent votes), or all of them. */
export type BlocSpan = 'recent' | 'all';
export const BLOC_SPANS: readonly BlocSpan[] = ['all', 'recent'];

/** What the read asks for: nothing for the server's own period; from the start for all of them. */
export const spanAsk = (span: BlocSpan): { from?: string } | undefined =>
  span === 'all' ? { from: '1970-01-01T00:00:00.000Z' } : undefined;

/** One bloc as a choice in the Highlight row. */
export interface BlocChoice {
  id: string;
  label: string;
  /** how many pairs vote alike in it, quiet at the row's end */
  trail: string;
  /** its members, the petals the map highlights */
  members: readonly string[];
}

/** Drafts (Elco changes them later). */
export const blocWords = {
  none: 'None',
  alike: (n: number) => `${n} that vote alike`,
  pairs: (n: number) => (n === 1 ? '1 pair' : `${n} pairs`),
  from: (from: string, to: string) => `On votes from ${from} to ${to}`,
  since: (from: string) => `On votes since ${from}`,
  until: (to: string) => `On votes until ${to}`,
  all: 'On all their votes',
  caveat: 'Voting alike, not proof they act together',
  spans: { recent: 'Recent votes', all: 'All their votes' } as Record<BlocSpan, string>,
  noneHere: 'None vote alike in these votes',
} as const;

/** The flower's blocs, the largest first, as the row's choices. */
export const blocChoices = (b: Blocs): BlocChoice[] =>
  b.blocs.map((x) => ({
    id: x.id,
    label: blocWords.alike(x.members.length),
    trail: blocWords.pairs(x.pairs),
    members: x.members,
  }));

/** The period the votes come from, in words (from inclusive, to exclusive, by when each was submitted). */
export function periodWords(b: Pick<Blocs, 'period'>): string {
  // all their votes asks from the start (spanAsk), so that from says nothing
  const start = b.period.from?.startsWith('1970-') ?? false;
  const from = b.period.from && !start ? dayOf(b.period.from) : null;
  const to = b.period.to ? dayOf(b.period.to) : null;
  if (from && to) return blocWords.from(from, to);
  if (from) return blocWords.since(from);
  if (to) return blocWords.until(to);
  return blocWords.all;
}
