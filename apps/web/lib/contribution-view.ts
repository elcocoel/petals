// A person's contribution to the shared map, a collective construction: who's helping a lot or a little. Three
// plain counts, as the server's credit/v1 already computes them (composition.md, section 7): facts the person
// added to the map first, facts they confirmed (matched independently), and accounts that built on their work
// (points/v1, 004-workspace): core's Credit, totals { first, confirmed, built_on }. Pure.

import type { Credit } from '@petal/core';
import { dateLabel, shortId } from './flower-view.ts';
import { subjectOf } from './profile-view.ts';

export const contributionWords = {
  title: 'Contribution',
  first: 'facts you added to the map first',
  confirmed: 'facts you confirmed',
  builtOn: 'accounts that built on your work',
  /** Over the list of what they published. */
  layers: 'What you published',
  none: 'Nothing yet. What you publish to the map, and what others build on, counts here.',
  reading: 'Reading…',
  unread: 'Your contribution can’t be read right now.',
} as const;

/** The same, as anyone reads it on a person's public page (/u/<account>). */
export const publicContributionWords = {
  title: 'Contribution',
  first: 'facts added to the map first',
  confirmed: 'facts confirmed',
  builtOn: 'accounts that built on this work',
  layers: 'What they published',
  none: 'Nothing published to the map yet.',
  reading: 'Reading…',
  unread: 'This contribution can’t be read right now.',
} as const;

/** The words a contribution is told in: the person's own, or as anyone reads it. */
export type ContributionWords = { [K in keyof typeof contributionWords]: string };

const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

/**
 * The author a public contribution is read for (GET /api/v1/credit/:account): a publication names its author as
 * the wallet that signed it, a NEAR account as it is, an Ethereum or Solana one in CAIP-10.
 */
export function creditAuthor(chain: 'near' | 'eip155' | 'solana', account: string): string {
  if (chain === 'eip155') return `eip155:1:${account.toLowerCase()}`;
  if (chain === 'solana') return `${SOLANA_MAINNET}:${account}`;
  return account;
}

export interface ContributionView {
  counts: { key: string; value: number; label: string }[];
  /** The layers they published, newest first: what it's about, and when. */
  layers: {
    key: string;
    title: string;
    about: { shown: string; full: string; chain: string };
    when: string | null;
  }[];
  /** Nothing counted yet. */
  empty: boolean;
}

/** An account named inside a title, `eip155:100:0x…` or `solana:…:…`: shortened as every address on the site is. */
const REF = /\b(?:[a-z0-9]+:){1,2}(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|[0-9a-f]{64})\b/g;
const readable = (title: string) => title.replace(REF, (_, id: string) => shortId(id));

export function contributionView(
  record: Credit,
  words: ContributionWords = contributionWords,
): ContributionView {
  const { first, confirmed, built_on } = record.totals;
  return {
    counts: [
      { key: 'first', value: first, label: words.first },
      { key: 'confirmed', value: confirmed, label: words.confirmed },
      { key: 'built-on', value: built_on, label: words.builtOn },
    ],
    layers: [...record.layers]
      .sort((a, b) => ((a.published_at ?? '') < (b.published_at ?? '') ? 1 : -1))
      .map((l) => {
        const about = subjectOf(l.map);
        return {
          key: l.sha256,
          title: l.title ? readable(l.title) : about.shown,
          about,
          when: l.published_at ? dateLabel(l.published_at) : null,
        };
      }),
    empty: first + confirmed + built_on === 0 && record.layers.length === 0,
  };
}
