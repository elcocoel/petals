// A map's voting blocs (board #94; LOOK, 11 Nov: the site reads them over HTTP): its DAO's proposals as kept,
// the pairs and blocs core finds over a period, and every member as the petal id it has in the map's newest
// reading, so a flower can colour its blocs. A voter with no petal there keeps its account as the claim names it.
import {
  type Blocs,
  type BlocsAsk,
  blocClaims,
  type Proposals,
  validateProposals,
  votingBlocs,
} from '@petal/core';
import { privateStore } from './drafts.ts';
import { mapsOf, mapViews } from './map.ts';
import { keepMappingClaims } from './mapping-claims.ts';
import { loadSnapshot } from './tools/shared.ts';
import type { ToolContext } from './types.ts';

/** Who finds the blocs: Petals' own tool. */
export const BLOCS_BY = 'tool:petals-blocs@1';

/** A map's proposals as kept, or null. */
export async function keptProposals(ctx: ToolContext, id: string): Promise<Proposals | null> {
  const row = await privateStore(ctx.config).proposals.get(id);
  if (!row) return null;
  const p = validateProposals(JSON.parse(row.body));
  return p.ok ? p.value : null;
}

/** A map's blocs over the period asked, its members as its newest reading's petal ids; null: no proposals. */
export async function mapBlocs(ctx: ToolContext, id: string, ask: BlocsAsk): Promise<Blocs | null> {
  const p = await keptProposals(ctx, id);
  if (!p) return null;
  const blocs = votingBlocs(p, ask);
  const card = mapsOf(await mapViews(ctx, undefined, { hidden: true })).find((m) => m.id === id);
  const newest = card?.readings[0]?.snapshot;
  if (!newest) return blocs;
  // a petal's id is its account in CAIP-10, or in older readings its bare address on the map's chain
  const chain = id.slice(0, id.lastIndexOf(':'));
  const key = (a: string) => (a.startsWith('eip155:') ? a.toLowerCase() : a);
  const petal = new Map<string, string>();
  for (const x of (await loadSnapshot(ctx, newest)).participants)
    petal.set(key(x.id.includes(':') ? x.id : `${chain}:${x.id}`), x.id);
  const as = (a: string) => petal.get(key(a)) ?? a;
  return {
    ...blocs,
    pairs: blocs.pairs.map((x) => ({ ...x, a: as(x.a), b: as(x.b) })),
    blocs: blocs.blocs.map((b) => ({ ...b, members: b.members.map(as) })),
  };
}

export interface BlocRun extends BlocsAsk {
  /** only the maps whose address holds this */
  only?: string;
  /** false: find and say, keep nothing */
  save?: boolean;
  log?: (line: string) => void;
}

/**
 * Every DAO map's blocs over one period, kept as Petals' mapping's claims (scripts/map-blocs.ts; META, 11 Nov:
 * run by hand per period, never on a timer). A pair found again is the same claim only when nothing about it
 * changed; each run's claims say their period and thresholds.
 */
export async function blocMaps(
  ctx: ToolContext,
  o: BlocRun = {},
): Promise<{ maps: number; pairs: number; blocs: number; kept: number }> {
  const { only, save, log = () => {}, ...ask } = o;
  const out = { maps: 0, pairs: 0, blocs: 0, kept: 0 };
  const at = ctx.now().toISOString();
  for (const row of await privateStore(ctx.config).proposals.list()) {
    if (only && !row.about.includes(only)) continue;
    const p = validateProposals(JSON.parse(row.body));
    if (!p.ok) continue;
    out.maps++;
    const b = votingBlocs(p.value, ask);
    out.pairs += b.pairs.length;
    out.blocs += b.blocs.length;
    log(
      `${row.about}: ${b.proposals.in_period} proposals in the period, ${b.pairs.length} pairs, ${b.blocs.length} blocs${b.blocs[0] ? ` (largest ${b.blocs[0].members.length})` : ''}`,
    );
    if (save === false || !b.pairs.length) continue;
    out.kept += await keepMappingClaims(ctx, 'blocs', blocClaims(b, { by: BLOCS_BY, at }));
  }
  return out;
}
