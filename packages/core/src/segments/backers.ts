// Segments `backers` (renderer.md): who backs a NEAR pool, read from the snapshot alone. The class
// of each backer is marked by the input module (fixtures/README.md, Backers): delegator and group
// rows carry `detail.backer_class`. Bands stack bottom to top in BACKER_ORDER.
import { exactValues, formatDecimal, ratio6 } from '../decimal.ts';
import { participantsById } from '../tables.ts';
import type { Participant, Segment, Snapshot } from '../types/index.ts';

export const BACKER_ORDER = ['other', 'large', 'liquid', 'lockup'] as const;
export type BackerClass = (typeof BACKER_ORDER)[number];

export const BACKER_LABELS: Record<BackerClass, string> = {
  other: 'other delegators',
  large: 'accounts with 1M+ NEAR',
  liquid: 'liquid-staking contracts',
  lockup: 'lockups (vesting)',
};

function backerClass(p: Participant | undefined): BackerClass {
  const marked = (p?.detail as { backer_class?: unknown } | undefined)?.backer_class;
  if (typeof marked === 'string' && (BACKER_ORDER as readonly string[]).includes(marked))
    return marked as BackerClass;
  // unmarked rows: fall back on what the row itself says; "large" needs whole-crawl totals
  if (p?.kind === 'staking_entity') return 'liquid';
  if ((p?.detail as { account_type?: unknown } | undefined)?.account_type === 'lockup')
    return 'lockup';
  return 'other';
}

interface PoolBackers {
  scale: number;
  byClass: Map<BackerClass, bigint>;
  total: bigint;
}

const cache = new WeakMap<Snapshot, Map<string, PoolBackers>>();

function index(s: Snapshot): Map<string, PoolBackers> {
  const hit = cache.get(s);
  if (hit) return hit;
  const rows = s.relationships.filter((r) => r.type === 'delegates_to' && r.amount !== undefined);
  const { values, scale } = exactValues(rows);
  const people = participantsById(s);
  const pools = new Map<string, PoolBackers>();
  rows.forEach((r, i) => {
    const v = values[i] ?? 0n;
    if (v <= 0n) return;
    let pool = pools.get(r.to);
    if (!pool) {
      pool = { scale, byClass: new Map(), total: 0n };
      pools.set(r.to, pool);
    }
    const k = backerClass(people.get(r.from));
    pool.byClass.set(k, (pool.byClass.get(k) ?? 0n) + v);
    pool.total += v;
  });
  cache.set(s, pools);
  return pools;
}

/** True when the snapshot has delegations to draw as backers. */
export function hasBackers(s: Snapshot): boolean {
  return index(s).size > 0;
}

/**
 * NEAR: the stake delegated to `poolId`, split into other delegators, accounts with 1M+ NEAR,
 * liquid-staking contracts and lockups (in that order, empty classes left out). `frac` is the
 * class's part of the pool's delegated stake, rounded to 6 decimals. [] when nothing is delegated.
 */
export function backerSegments(s: Snapshot, poolId: string): Segment[] {
  const pool = index(s).get(poolId);
  if (!pool) return [];
  return BACKER_ORDER.flatMap((key) => {
    const v = pool.byClass.get(key) ?? 0n;
    return v > 0n
      ? [
          {
            key,
            label: BACKER_LABELS[key],
            amount: formatDecimal(v, pool.scale),
            frac: ratio6(v, pool.total),
          },
        ]
      : [];
  });
}
