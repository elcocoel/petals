// The bench's data (specs/006-the-map, plan): the night's saved views and the relations index's groups and
// pairs, joined. A view's spec names its snapshot, and a group's latest observation names the same
// snapshot, so a flower finds its group, and two flowers share a road when their groups share accounts.
// Pure: the scripts and the bench's loader both use it.
import { sha256Hex } from '@petal/core';
import type { Reading } from '@petal/core/types';
import type { Link, Seed } from './places.ts';

export const NIGHT_FIXTURE = 'fixtures/landscape/night-2026-11-09.json.gz';
export const PLACES_FILE = 'apps/web/lab/map/places.json';
export const LOGOS_DIR = 'fixtures/landscape/logos';

/** One saved view from the run's index, with the reading the server gave for it. */
export interface NightView {
  /** The view's spec hash, as in its /d/ link: the flower's id on the map. */
  sha: string;
  /** The run's own name for it, and the rest of its row in the run's index. */
  name: string;
  chain: string;
  address: string;
  reader: string;
  count: string;
  status: string;
  as_of: string;
  snapshot: string;
  /** the map it's on, its reading's address, when the live map says (GET /api/v1/map) */
  map?: string;
  /** the pieces of data its reading has, by name, when the live map says (core's piecesOf; SYSTEMS, wave 3) */
  pieces?: readonly string[];
  reading: Pick<Reading, 'title' | 'petals'>;
}

export interface NightGroup {
  id: string;
  chain: string;
  snapshot_sha256: string;
  members_total: number;
  title: string;
}

export interface NightPair {
  a: string;
  b: string;
  shared: number;
  weight: number;
  /** Seen on one chain (observed), or guessed across chains from the same EVM address (inferred). */
  match: { status: string; method?: string };
}

export interface Night {
  made: string;
  source: string;
  run: string;
  views: NightView[];
  groups: NightGroup[];
  pairs: NightPair[];
}

/** The run's index names chains in words; the map's continents go by chain id, as the index does. */
const CHAIN_IDS: Record<string, string> = {
  ethereum: 'eip155:1',
  gnosis: 'eip155:100',
  arbitrum: 'eip155:42161',
  base: 'eip155:8453',
  solana: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'near:mainnet': 'near:mainnet',
};

/** Each view's group, by the snapshot both name. */
export function groupOf(night: Night): Map<string, NightGroup> {
  const bySnapshot = new Map(night.groups.map((g) => [g.snapshot_sha256, g]));
  const out = new Map<string, NightGroup>();
  for (const v of night.views) {
    const g = bySnapshot.get(v.snapshot);
    if (g) out.set(v.sha, g);
  }
  return out;
}

/** What placing needs to know of each flower: its chain and how many members it reads. */
export function seedsOf(night: Night): Seed[] {
  const groups = groupOf(night);
  return night.views.map((v) => {
    const g = groups.get(v.sha);
    const members =
      g?.members_total ?? (Number(v.count.replace(/,/g, '')) || v.reading.petals.length);
    return { id: v.sha, chain: g?.chain ?? CHAIN_IDS[v.chain] ?? v.chain, members };
  });
}

/**
 * The index's pairs of groups, as pairs of the flowers that draw them. Only pairs seen on one chain: a
 * match guessed across chains is a different claim, and the map doesn't draw it yet.
 */
export function linksOf(night: Night): Link[] {
  const viewOf = new Map<string, string>();
  for (const [sha, g] of groupOf(night)) viewOf.set(g.id, sha);
  const links: Link[] = [];
  for (const p of night.pairs) {
    if (p.match.status !== 'observed') continue;
    const a = viewOf.get(p.a);
    const b = viewOf.get(p.b);
    if (a && b) links.push({ a, b, shared: p.shared, weight: p.weight });
  }
  return links;
}

/** Trust Wallet's folder for a chain, as the run's index names it, or null where it lists no tokens. */
export function trustWalletChain(chain: string): string | null {
  if (chain.startsWith('solana')) return 'solana';
  return (
    (
      { ethereum: 'ethereum', gnosis: 'xdai', arbitrum: 'arbitrum', base: 'base' } as Record<
        string,
        string
      >
    )[chain] ?? null
  );
}

/**
 * A token's logo file in LOGOS_DIR, or null where the chain has no logos: named by a hash of its chain and
 * address, so no token's address ends up in a file name (one Solana mint starts with a word the
 * publication boundary refuses in names).
 */
export function logoFile(chain: string, address: string): string | null {
  const folder = trustWalletChain(chain);
  if (!folder || !address) return null;
  const key = `${folder}:${folder === 'solana' ? address : address.toLowerCase()}`;
  return `${sha256Hex(key).slice(0, 24)}.png`;
}
