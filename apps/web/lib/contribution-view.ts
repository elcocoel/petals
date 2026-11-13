// A person's contribution to the shared map (wave 8; Elco, 13 Nov: "its people contribute to a collective
// construction and we wanna know who's helping a lot or a little and provide an useful measure of 'what doing
// good' looks like"; "let's not make this more complicated than it has to be"). Three plain counts, as
// SYSTEMS's credit/v1 already computes them (composition.md, section 7): facts the person added to the map
// first, facts they confirmed (matched independently), and accounts that built on their work (points/v1, Elco's
// points for mapping, 004-workspace): core's Credit, totals { first, confirmed, built_on }. Pure. LOBBY's drafts.

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

export function contributionView(record: Credit): ContributionView {
  const { first, confirmed, built_on } = record.totals;
  return {
    counts: [
      { key: 'first', value: first, label: contributionWords.first },
      { key: 'confirmed', value: confirmed, label: contributionWords.confirmed },
      { key: 'built-on', value: built_on, label: contributionWords.builtOn },
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
