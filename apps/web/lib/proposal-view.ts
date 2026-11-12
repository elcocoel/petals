// A proposal pressed on the map, said in the map's Information box (Elco, 12 Nov, walk 3, Ref Finance: "when I
// click the proposal there's no way for me to know what this proposal is about so maybe there's a link to wherever
// it was made maybe there is a summary"): its title, what kind it is, how it ended and when, who proposed it and
// for whom, how its voters voted, its own words where they say more than its title (proposals/v3's summary, as its
// source says it, never a model's), and its link, said for what it is: where it was made, or an address its text
// names (a Sputnik proposal has no page of its own). Pure. The words are drafts.
import type { Proposal } from '@petal/core';
import { dateLabel } from './flower-view.ts';

export interface ProposalView {
  title: string;
  /** its kind, how it ended as the DAO says it, and when it was made */
  facts: string;
  /** who proposed it, and for whom, when it names someone */
  who: string | null;
  /** how its voters voted, by how many */
  votes: string;
  /** its own words, where they say more than its title */
  words: string | null;
  link: { url: string; label: string } | null;
}

export const proposalWords = {
  title: 'Proposal',
  by: (who: string) => `By ${who}`,
  for: (who: string) => `for ${who}`,
  noVotes: 'No votes',
  for_: (n: number) => `${n} for`,
  against: (n: number) => `${n} against`,
  abstain: (n: number) => `${n} abstained`,
  other: (n: number) => `${n} chose otherwise`,
  made: 'Where it was made',
  named: 'A link its text names',
} as const;

/** The words a proposal's title doesn't already say, or null. */
function moreThan(title: string, text: string | null | undefined): string | null {
  const t = text?.trim();
  if (!t || t === title.trim()) return null;
  return t;
}

export function proposalView(p: Proposal): ProposalView {
  const tally = { for: 0, against: 0, abstain: 0, other: 0 };
  for (const v of p.votes) {
    if (v.vote === 'for' || v.vote === 'against' || v.vote === 'abstain') tally[v.vote] += 1;
    else tally.other += 1;
  }
  const votes = [
    tally.for ? proposalWords.for_(tally.for) : null,
    tally.against ? proposalWords.against(tally.against) : null,
    tally.abstain ? proposalWords.abstain(tally.abstain) : null,
    tally.other ? proposalWords.other(tally.other) : null,
  ].filter(Boolean);
  return {
    title: p.title,
    facts: [p.kind, p.as_said, dateLabel(p.at)].filter(Boolean).join(' · '),
    who:
      [
        p.proposer ? proposalWords.by(p.proposer) : null,
        p.recipient && p.recipient !== p.proposer ? proposalWords.for(p.recipient) : null,
      ]
        .filter(Boolean)
        .join(' ') || null,
    votes: votes.length > 0 ? votes.join(' · ') : proposalWords.noVotes,
    words: moreThan(p.title, p.summary),
    link: p.link
      ? {
          url: p.link.url,
          label: p.link.kind === 'where it was made' ? proposalWords.made : proposalWords.named,
        }
      : null,
  };
}
