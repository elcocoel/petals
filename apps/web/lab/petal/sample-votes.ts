// SAMPLE ONLY: made-up proposals and votes, in SYSTEMS's proposals/v1 shape, to try the vote ring (#93) on a real
// flower until SYSTEMS's real ones land (NEAR's Marketing DAO first, then RaidGuild's Baal). The accounts are
// RaidGuild's real delegates; who voted how is invented, by a fixed seed, so it's the same every time. The bench
// says so wherever it shows them.
import type { Proposal, Vote } from '@petal/core/wedge/votes';

/** mulberry32, a fixed seed. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;

/** Nine sample proposals over the three months before the snapshot, each open a week, its votes made up. */
export function sampleProposals(
  accounts: readonly string[],
  until: string,
): {
  from: string;
  to: string;
  proposals: Proposal[];
} {
  const r = random(20261111);
  const end = Date.parse(until);
  const start = end - 91 * DAY;
  const proposals: Proposal[] = Array.from({ length: 9 }, (_, n) => {
    const at = start + (n * 10 + 2 + Math.floor(r() * 3)) * DAY;
    const closes = at + 7 * DAY;
    const votes: Vote[] = [];
    for (const account of accounts) {
      const x = r();
      // the larger delegates turn out more often, as delegates do
      const turnout = 0.55 - 0.4 * (votes.length / accounts.length);
      if (x > turnout) continue;
      const y = r();
      votes.push({ account, vote: y < 0.72 ? 'for' : y < 0.94 ? 'against' : 'abstain' });
    }
    const yes = votes.filter((v) => v.vote === 'for').length;
    const no = votes.filter((v) => v.vote === 'against').length;
    return {
      id: `sample-${n + 1}`,
      title: `Sample proposal ${n + 1}`,
      at: new Date(at).toISOString(),
      decided_at: null,
      closes_at: new Date(closes).toISOString(),
      outcome: closes > end ? 'in progress' : yes > no ? 'passed' : 'rejected',
      votes,
    };
  });
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString(), proposals };
}
