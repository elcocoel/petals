// A person's contribution to the shared map (wave 8; Elco, 13 Nov: "its people contribute to a collective
// construction and we wanna know who's helping a lot or a little and provide an useful measure of 'what doing
// good' looks like"; "let's not make this more complicated than it has to be"). Three plain counts, as
// SYSTEMS's credit/v1 already computes them (composition.md, section 7): facts the person added to the map
// first, facts they confirmed (matched independently), and accounts that built on their work (points/v1, Elco's
// points for mapping, 004-workspace). Pure. LOBBY's drafts.

import { dateLabel } from './flower-view.ts';
import { subjectOf } from './profile-view.ts';

/** A layer the person published, as the record lists it: only what the widget reads. */
export interface CreditLayer {
  sha256: string;
  /** The map it's about, `chain:address`. */
  map: string;
  title?: string | null;
  published_at?: string | null;
}

/** The person's credit record, as GET /api/v1/me/credit gives it: only what the widget reads. */
export interface CreditRecord {
  petal: string;
  layers: CreditLayer[];
  totals: { facts_first: number; facts_matched: number; points: number };
  hash: string;
}

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

export function contributionView(record: CreditRecord): ContributionView {
  const { facts_first, facts_matched, points } = record.totals;
  return {
    counts: [
      { key: 'first', value: facts_first, label: contributionWords.first },
      { key: 'confirmed', value: facts_matched, label: contributionWords.confirmed },
      { key: 'built-on', value: points, label: contributionWords.builtOn },
    ],
    layers: [...record.layers]
      .sort((a, b) => ((a.published_at ?? '') < (b.published_at ?? '') ? 1 : -1))
      .map((l) => {
        const about = subjectOf(l.map);
        return {
          key: l.sha256,
          title: l.title ?? about.shown,
          about,
          when: l.published_at ? dateLabel(l.published_at) : null,
        };
      }),
    empty: facts_first + facts_matched + points === 0 && record.layers.length === 0,
  };
}
