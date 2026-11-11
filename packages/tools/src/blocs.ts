// A map's voting blocs (board #94; LOOK, 11 Nov: the site reads them over HTTP): its DAO's proposals as kept,
// the pairs and blocs core finds over a period, and every member as the petal id it has in the map's newest
// reading, so a flower can colour its blocs. A voter with no petal there keeps its account as the claim names it.
import {
  type Blocs,
  type BlocsAsk,
  type Proposals,
  validateProposals,
  votingBlocs,
} from '@petal/core';
import { privateStore } from './drafts.ts';
import { mapsOf, mapViews } from './map.ts';
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

/**
 * The vote ring's stretch (LOOK, 11 Nov: one period for the ring and the blocs): the 90 days up to the map's newest
 * proposal's close (decided_at, else closes_at, else when it was submitted, at its latest), so a quiet DAO still
 * shows its last stretch. Null with no proposals.
 */
export function lastStretch(p: Proposals, days = 90): { from: string; to: string } | null {
  const ends = p.proposals.map((x) => x.decided_at ?? x.closes_at ?? x.at).sort();
  const to = ends.at(-1);
  if (!to) return null;
  return { from: new Date(Date.parse(to) - days * 24 * 60 * 60 * 1000).toISOString(), to };
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
  log?: (line: string) => void;
}

/**
 * Every DAO map's blocs over one period, said and kept nowhere (scripts/map-blocs.ts; META, 11 Nov: keep nothing
 * as Petals' mapping's claims for now, compute them live; an agent keeps what it needs in its person's project).
 */
export async function blocMaps(
  ctx: ToolContext,
  o: BlocRun = {},
): Promise<{ maps: number; pairs: number; blocs: number }> {
  const { only, log = () => {}, ...ask } = o;
  const out = { maps: 0, pairs: 0, blocs: 0 };
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
  }
  return out;
}

/** The blocs as the site and agents read them first: each bloc's members, how many pairs; the pairs on asking. */
export function shownBlocs(b: Blocs, pairs: boolean) {
  const { pairs: all, ...rest } = b;
  return {
    ...rest,
    pair_count: all.length,
    ...(pairs ? { pairs: all.map(({ proposals: _p, ...x }) => x) } : {}),
  };
}
