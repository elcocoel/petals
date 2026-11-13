// Voting blocs over a period: from a DAO's proposals,
// each pair of accounts that voted on enough of the same proposals, voted alike on enough of them, and agreed
// beyond what each proposal's own split explains (kappa: a majority agreeing with itself is no bloc),
// and the blocs such pairs link. Agreement, never proof of coordination: each pair is an inferred claim (moves_with,
// grounds synchronised_behaviour) with its proposals as evidence and its method and thresholds in its words.
// A vote of null (a ballot of choices) isn't for or against, so it isn't counted.
import { makeClaim } from './claims/index.ts';
import { canonicalJson, sha256Hex } from './hash.ts';
import type { Proposals } from './proposals.ts';
import type { Claim, ClaimDraft } from './types/index.ts';

export const BLOCS_METHOD = 'blocs/agreement@2';
/** The method's defaults: stated in every claim and settable per call. */
export const BLOCS_DEFAULTS = { min_shared: 5, min_agreement: 0.8, min_kappa: 0.5 } as const;

export interface BlocsAsk {
  /** the period, by when each proposal was submitted: from (inclusive) and to (exclusive), ISO times */
  from?: string | null;
  to?: string | null;
  /** the fewest proposals in common for a pair to count */
  min_shared?: number;
  /** the least share of those they voted alike on */
  min_agreement?: number;
  /** the least agreement beyond chance: (agreement - expected) / (1 - expected) */
  min_kappa?: number;
}

export interface BlocPair {
  a: string;
  b: string;
  /** proposals in the period both voted on, for, against or abstain */
  shared: number;
  /** of those, how many they voted alike on */
  agreed: number;
  /** agreed / shared */
  agreement: number;
  /** how far it agreed beyond what each shared proposal's split explains, from -1 to 1 (Cohen's kappa) */
  kappa: number;
  /** the shared proposals, by ref */
  proposals: string[];
}

export interface Blocs {
  about: string;
  period: { from: string | null; to: string | null };
  method: {
    name: typeof BLOCS_METHOD;
    min_shared: number;
    min_agreement: number;
    min_kappa: number;
  };
  /** how many proposals the period holds, and how many of them anyone voted on */
  proposals: { in_period: number; voted: number };
  /** every pair that meets both thresholds, the most agreed first */
  pairs: BlocPair[];
  /** accounts linked by those pairs, the largest first; id: bloc:<12 hex of its members> */
  blocs: { id: string; members: string[]; pairs: number }[];
}

/** An account as a claim names it: on the DAO's own chain (near:mainnet:…, eip155:100:0x…). */
function accountOf(contract: string, account: string): string {
  if (account.includes(':')) return account;
  const chain = contract.slice(0, contract.lastIndexOf(':'));
  return `${chain}:${chain.startsWith('eip155:') ? account.toLowerCase() : account}`;
}

export function votingBlocs(p: Proposals, ask: BlocsAsk = {}): Blocs {
  const min_shared = ask.min_shared ?? BLOCS_DEFAULTS.min_shared;
  const min_agreement = ask.min_agreement ?? BLOCS_DEFAULTS.min_agreement;
  const min_kappa = ask.min_kappa ?? BLOCS_DEFAULTS.min_kappa;
  const from = ask.from ?? null;
  const to = ask.to ?? null;
  const inPeriod = p.proposals.filter((x) => (!from || x.at >= from) && (!to || x.at < to));
  const tally = new Map<
    string,
    { shared: number; agreed: number; expected: number; proposals: string[] }
  >();
  let voted = 0;
  for (const x of inPeriod) {
    const votes = x.votes
      .filter((v) => v.vote !== null)
      .map((v) => ({ account: accountOf(p.source.contract, v.account), vote: v.vote }))
      .sort((m, n) => (m.account < n.account ? -1 : 1));
    if (votes.length) voted++;
    // how likely two of its voters vote alike by its split alone: the sum of each choice's share squared
    const count = new Map<string, number>();
    for (const v of votes) count.set(String(v.vote), (count.get(String(v.vote)) ?? 0) + 1);
    const chance = [...count.values()].reduce((sum, c) => sum + (c / votes.length) ** 2, 0);
    for (let i = 0; i < votes.length; i++)
      for (let j = i + 1; j < votes.length; j++) {
        const [m, n] = [votes[i], votes[j]] as [(typeof votes)[0], (typeof votes)[0]];
        if (m.account === n.account) continue;
        const key = `${m.account} ${n.account}`;
        const t = tally.get(key) ?? { shared: 0, agreed: 0, expected: 0, proposals: [] };
        t.shared++;
        if (m.vote === n.vote) t.agreed++;
        t.expected += chance;
        t.proposals.push(x.ref);
        tally.set(key, t);
      }
  }
  const pairs: BlocPair[] = [];
  for (const [key, { expected, ...t }] of tally) {
    const agreement = t.agreed / t.shared;
    const chance = expected / t.shared;
    // where every shared vote was unanimous, agreeing says nothing about the pair
    const kappa = chance >= 1 ? 0 : Math.max(-1, (agreement - chance) / (1 - chance));
    if (t.shared < min_shared || agreement < min_agreement || kappa < min_kappa) continue;
    const [a, b] = key.split(' ') as [string, string];
    pairs.push({
      a,
      b,
      ...t,
      agreement: Number(agreement.toFixed(4)),
      kappa: Number(kappa.toFixed(4)),
    });
  }
  pairs.sort((m, n) => n.agreement - m.agreement || n.shared - m.shared || (m.a < n.a ? -1 : 1));
  // blocs: the accounts the pairs link
  const parent = new Map<string, string>();
  const root = (x: string): string => {
    const up = parent.get(x) ?? x;
    if (up === x) return x;
    const r = root(up);
    parent.set(x, r);
    return r;
  };
  for (const { a, b } of pairs) parent.set(root(a), root(b));
  const groups = new Map<string, { members: Set<string>; pairs: number }>();
  for (const { a, b } of pairs) {
    const g = groups.get(root(a)) ?? { members: new Set<string>(), pairs: 0 };
    g.members.add(a).add(b);
    g.pairs++;
    groups.set(root(a), g);
  }
  const blocs = [...groups.values()]
    .map((g) => {
      const members = [...g.members].sort();
      return { id: `bloc:${sha256Hex(members.join(' ')).slice(0, 12)}`, members, pairs: g.pairs };
    })
    .sort((m, n) => n.members.length - m.members.length || (m.members[0] < n.members[0] ? -1 : 1));
  return {
    about: p.about,
    period: { from, to },
    method: { name: BLOCS_METHOD, min_shared, min_agreement, min_kappa },
    proposals: { in_period: inPeriod.length, voted },
    pairs,
    blocs,
  };
}

const when = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

/** Each pair as an inferred claim: they act in step, with its proposals and its method in words. */
export function blocClaims(b: Blocs, o: { by: string; at: string }): Claim[] {
  const period =
    b.period.from || b.period.to
      ? `from ${when(b.period.from) ?? 'the first proposal'} to ${when(b.period.to) ?? 'the last'}`
      : 'over every proposal read';
  return b.pairs.map((pair) =>
    makeClaim(
      {
        subject: pair.a,
        verb: 'moves_with',
        object: pair.b,
        kind: 'inferred',
        // the method with a hash of its thresholds and period, so a claim says exactly how it was made
        method: `${b.method.name}#${sha256Hex(canonicalJson({ ...b.method, period: b.period })).slice(0, 12)}`,
        qualifiers: { grounds: 'synchronised_behaviour' },
        issued_at: o.at,
        by: o.by,
        evidence: [
          {
            type: 'note',
            note: `Voted alike on ${pair.agreed} of the ${pair.shared} proposals both voted on, ${period}, ${pair.kappa} beyond what each proposal's split explains (${b.method.name}: at least ${b.method.min_shared} in common, ${Math.round(b.method.min_agreement * 100)}% alike, kappa at least ${b.method.min_kappa}). Agreement, not proof of coordination.`,
            found_by: o.by,
            found_at: o.at,
          },
          ...pair.proposals.map((ref) => ({
            type: 'proposal' as const,
            proposal: ref,
            found_by: o.by,
            found_at: o.at,
          })),
        ],
      } as ClaimDraft,
      'claim/v4',
    ),
  );
}
