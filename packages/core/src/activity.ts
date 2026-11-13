// Time as data (last active, most active, and a grade for the petals that never voted): each petal's activity in
// its map's proposals, as pieces
// of data beside the reading's own, as valuePieces' dollars are. Over the proposals read (the card's period):
//
//   votes_cast    count     how many of them the account voted on
//   last_active   date      when it last voted; where a source keeps no vote's time (Sputnik), the time of the
//                           proposal it last voted on, inferred, and its label says so
//   voted         category  'voted' or 'never voted', for every petal of the reading
//
// What isn't here: a map with no proposals read gets none of the three, and transfers aren't kept per wallet (a
// reading holds balances), so there's no last transfer. Pure.
import { canonicalJson, sha256Hex } from './hash.ts';
import type { Proposals } from './proposals.ts';
import type { SeamPiece } from './seam.ts';
import type { Snapshot } from './types/index.ts';

export const VOTED = 'voted';
export const NEVER_VOTED = 'never voted';

/** The day of an instant: the span the labels name. */
const day = (t: string) => t.slice(0, 10);

/** Each petal's activity in these proposals; none without proposals. */
export function activityPieces(s: Snapshot, p: Proposals | null): SeamPiece[] {
  if (!p || p.proposals.length === 0) return [];
  // a petal's id is its account in CAIP-10, or in older readings its bare address on the reading's chain; a vote
  // names its account either way
  const chain = s.network.chain;
  const key = (a: string) => {
    const full = a.includes(':') ? a : `${chain}:${a}`;
    return full.startsWith('eip155:') ? full.toLowerCase() : full;
  };
  const petal = new Map(s.participants.map((x) => [key(x.id), x.id]));
  const cast = new Map<string, number>();
  const last = new Map<string, string>();
  let untimed = 0;
  const times: string[] = [];
  for (const proposal of p.proposals) {
    times.push(proposal.at);
    for (const v of proposal.votes) {
      const id = petal.get(key(v.account));
      if (id === undefined) continue;
      cast.set(id, (cast.get(id) ?? 0) + 1);
      const at = v.at ?? proposal.at;
      if (!v.at) untimed++;
      const was = last.get(id);
      if (!was || Date.parse(at) > Date.parse(was)) last.set(id, at);
    }
  }
  times.sort((a, b) => Date.parse(a) - Date.parse(b));
  const span = `${day(times[0] as string)} to ${day(times.at(-1) as string)}`;
  const layer = sha256Hex(canonicalJson({ activity: p.petal, about: p.about, read_at: p.read_at }));
  const base = { layer, as_of: p.read_at };
  const pieces: SeamPiece[] = [
    {
      ...base,
      name: 'votes_cast',
      kind: 'count',
      unit: 'votes',
      label: `votes cast on its proposals from ${span}`,
      standing: 'verified',
      values: s.participants.map((x) => ({
        participant: x.id,
        value: String(cast.get(x.id) ?? 0),
      })),
    },
    {
      ...base,
      name: 'voted',
      kind: 'category',
      unit: 'voted',
      label: `voted on its proposals from ${span}, or never`,
      standing: 'verified',
      values: s.participants.map((x) => ({
        participant: x.id,
        value: cast.has(x.id) ? VOTED : NEVER_VOTED,
      })),
    },
  ];
  if (last.size)
    pieces.push({
      ...base,
      name: 'last_active',
      kind: 'date',
      unit: 'date',
      label: untimed
        ? `its last vote, from ${span}; where its source keeps no vote's time, the time of the proposal it voted on`
        : `its last vote, from ${span}`,
      standing: untimed ? 'inferred' : 'verified',
      values: [...last].map(([participant, at]) => ({ participant, value: at })),
    });
  return pieces;
}
