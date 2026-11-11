// Voting blocs over a period (board #94; Elco, 11 Nov: "a super important feature"): from a DAO's proposals,
// each pair of accounts that voted on enough of the same proposals and voted alike on enough of them, and the
// blocs such pairs link. Agreement, never proof of coordination: each pair is an inferred claim (moves_with,
// grounds synchronised_behaviour) with its proposals as evidence and its method and thresholds in its words.
// A vote of null (a ballot of choices) isn't for or against, so it isn't counted.
import { makeClaim } from './claims/index.ts';
import { canonicalJson, sha256Hex } from './hash.ts';
import type { Proposals } from './proposals.ts';
import type { Claim, ClaimDraft } from './types/index.ts';

export const BLOCS_METHOD = 'blocs/agreement@1';
/** The method's defaults (META, 11 Nov: stated in every claim, settable per call, Elco can change them). */
export const BLOCS_DEFAULTS = { min_shared: 5, min_agreement: 0.8 } as const;

export interface BlocsAsk {
  /** the period, by when each proposal was submitted: from (inclusive) and to (exclusive), ISO times */
  from?: string | null;
  to?: string | null;
  /** the fewest proposals in common for a pair to count */
  min_shared?: number;
  /** the least share of those they voted alike on */
  min_agreement?: number;
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
  /** the shared proposals, by ref */
  proposals: string[];
}

export interface Blocs {
  about: string;
  period: { from: string | null; to: string | null };
  method: { name: typeof BLOCS_METHOD; min_shared: number; min_agreement: number };
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
  const from = ask.from ?? null;
  const to = ask.to ?? null;
  const inPeriod = p.proposals.filter((x) => (!from || x.at >= from) && (!to || x.at < to));
  const tally = new Map<string, { shared: number; agreed: number; proposals: string[] }>();
  let voted = 0;
  for (const x of inPeriod) {
    const votes = x.votes
      .filter((v) => v.vote !== null)
      .map((v) => ({ account: accountOf(p.source.contract, v.account), vote: v.vote }))
      .sort((m, n) => (m.account < n.account ? -1 : 1));
    if (votes.length) voted++;
    for (let i = 0; i < votes.length; i++)
      for (let j = i + 1; j < votes.length; j++) {
        const [m, n] = [votes[i], votes[j]] as [(typeof votes)[0], (typeof votes)[0]];
        if (m.account === n.account) continue;
        const key = `${m.account} ${n.account}`;
        const t = tally.get(key) ?? { shared: 0, agreed: 0, proposals: [] };
        t.shared++;
        if (m.vote === n.vote) t.agreed++;
        t.proposals.push(x.ref);
        tally.set(key, t);
      }
  }
  const pairs: BlocPair[] = [];
  for (const [key, t] of tally) {
    const agreement = t.agreed / t.shared;
    if (t.shared < min_shared || agreement < min_agreement) continue;
    const [a, b] = key.split(' ') as [string, string];
    pairs.push({ a, b, ...t, agreement: Number(agreement.toFixed(4)) });
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
    method: { name: BLOCS_METHOD, min_shared, min_agreement },
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
            note: `Voted alike on ${pair.agreed} of the ${pair.shared} proposals both voted on, ${period} (${b.method.name}: at least ${b.method.min_shared} in common, ${Math.round(b.method.min_agreement * 100)}% alike). Agreement, not proof of coordination.`,
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
