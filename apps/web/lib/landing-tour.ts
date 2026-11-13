// The landing map's moves: each one of the map's own shows (LandscapeCanvas `show`: a DAO, a wallet, the line
// between two DAOs, a proposal), held a while, then the next, round and round, on real maps, wallets and a real
// proposal. A move can later carry an explainer card. Pure.
import type { MapShow } from '../landscape/LandscapeCanvas.tsx';

export interface TourMove {
  show: MapShow;
  /** how long it holds before the next, in seconds */
  hold: number;
}

const REF = 'near:mainnet:ref-finance.sputnik-dao.near';
const REF_BOARD = 'near:mainnet:ref-community-board.sputnik-dao.near';
const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const TRUMP = `${SOLANA}:6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN`;
const RENDER = `${SOLANA}:rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof`;
const RAIDGUILD = 'eip155:100:0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6';

/** The moves, in order: into a DAO, a proposal and its voters, two DAOs that share wallets, one wallet across them. */
export const LANDING_TOUR: readonly TourMove[] = [
  { show: { map: REF }, hold: 5 },
  // 257: "To transfer 100,000 REF as liquidity on pembrock", passed, its 15 voters lit
  { show: { proposal: { map: REF, id: '257' } }, hold: 6 },
  // 13 wallets in both
  { show: { line: [REF, REF_BOARD] }, hold: 5 },
  // in three of NEAR's DAOs
  { show: { wallet: 'alejandro.near', chain: 'near:mainnet' }, hold: 5 },
  { show: { map: TRUMP }, hold: 5 },
  // 157 wallets in both
  { show: { line: [TRUMP, RENDER] }, hold: 5 },
  { show: { map: RAIDGUILD }, hold: 5 },
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
