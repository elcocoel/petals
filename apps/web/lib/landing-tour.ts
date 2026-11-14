// The landing map's moves: each one of the map's own shows (LandscapeCanvas `show`: a DAO, a wallet, the line
// between two DAOs, a proposal), held a while, then the next, round and round, on real maps, wallets and a real
// proposal. Each move says what it shows in a small card over the map (the gallery's cards in lib/landing-copy.ts),
// with the numbers the map itself has. Pure.
import type { MapShow } from '../landscape/LandscapeCanvas.tsx';

/** Which of the gallery's cards a move says. */
export type TourCard =
  | 'ref'
  | 'proposal'
  | 'refShared'
  | 'wallet'
  | 'trump'
  | 'trumpShared'
  | 'raidguild';

export interface TourMove {
  show: MapShow;
  /** how long it holds before the next, in seconds */
  hold: number;
  card: TourCard;
}

const REF = 'near:mainnet:ref-finance.sputnik-dao.near';
const REF_BOARD = 'near:mainnet:ref-community-board.sputnik-dao.near';
const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const TRUMP = `${SOLANA}:6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN`;
const RENDER = `${SOLANA}:rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof`;
const RAIDGUILD = 'eip155:100:0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6';

/** The moves, in order: into a DAO, a proposal and its voters, two DAOs that share wallets, one wallet across them. */
export const LANDING_TOUR: readonly TourMove[] = [
  { show: { map: REF }, hold: 5, card: 'ref' },
  // 257: "To transfer 100,000 REF as liquidity on pembrock", passed, its 15 voters lit
  { show: { proposal: { map: REF, id: '257' } }, hold: 6, card: 'proposal' },
  { show: { line: [REF, REF_BOARD] }, hold: 5, card: 'refShared' },
  // in three of NEAR's DAOs
  { show: { wallet: 'alejandro.near', chain: 'near:mainnet' }, hold: 5, card: 'wallet' },
  { show: { map: TRUMP }, hold: 5, card: 'trump' },
  { show: { line: [TRUMP, RENDER] }, hold: 5, card: 'trumpShared' },
  { show: { map: RAIDGUILD }, hold: 5, card: 'raidguild' },
];

/** The maps a move needs. */
const mapsOf = (show: MapShow): string[] =>
  'map' in show
    ? [show.map]
    : 'proposal' in show
      ? [show.proposal.map]
      : 'line' in show
        ? [...show.line]
        : [];

/** The moves this map can make: those whose maps are on it. */
export function tourOn(
  maps: ReadonlySet<string>,
  moves: readonly TourMove[] = LANDING_TOUR,
): TourMove[] {
  return moves.filter((m) => mapsOf(m.show).every((id) => maps.has(id)));
}

/** What a card's numbers are read from: the map's flowers, by the map each stands for, and the lines between them. */
export interface TourData {
  flowers: readonly { map: string | null; reading: { petals: readonly { share: number }[] } }[];
  roads: readonly { a: number; b: number; shared: number }[];
}

/**
 * A move's card, in words: `{shared}` is how many wallets the line's two DAOs share, `{top}` the biggest share in
 * the shown flower, both as the map has them now. Null when the map doesn't have the number.
 */
export function cardOf(
  move: TourMove,
  words: Readonly<Record<TourCard, string>>,
  data: TourData,
): string | null {
  const at = (id: string) => data.flowers.findIndex((f) => f.map === id);
  let said = words[move.card];
  if (said.includes('{shared}')) {
    if (!('line' in move.show)) return null;
    const [a, b] = move.show.line.map(at);
    const road = data.roads.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
    if (!road) return null;
    said = said.replace('{shared}', road.shared.toLocaleString('en-US'));
  }
  if (said.includes('{top}')) {
    if (!('map' in move.show)) return null;
    const shares = data.flowers[at(move.show.map)]?.reading.petals.map((p) => p.share) ?? [];
    if (shares.length === 0) return null;
    said = said.replace('{top}', `${Math.round(Math.max(...shares) * 100)}%`);
  }
  return said;
}
