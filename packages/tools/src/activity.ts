// Each petal's activity in its map's proposals (core's activityPieces, the flower's dimension of time), for every
// renderer: the map's views and render_flower. A map's
// proposals are parsed once for each time they were read, so drawing the map stays as cheap as it was.
import {
  activityPieces,
  mapOf,
  type Proposals,
  type SeamPiece,
  validateProposals,
} from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { privateStore } from './drafts.ts';
import type { ToolContext } from './types.ts';

/** Parsed proposals by `<about>@<read_at>`: a read never changes, so each is parsed once per process. */
const parsed = new Map<string, Proposals | null>();

/** When each map's proposals were read, by its address: what a drawing's activity is made from. */
export async function proposalStamps(ctx: ToolContext): Promise<Map<string, string>> {
  const rows = await privateStore(ctx.config).proposals.stamps();
  return new Map(rows.map((r) => [r.about, r.read_at]));
}

/** This reading's petals' activity in its map's proposals, as read when `stamps` was taken; none without any. */
export async function activityOf(
  ctx: ToolContext,
  s: Snapshot,
  stamps?: ReadonlyMap<string, string>,
): Promise<SeamPiece[]> {
  const about = mapOf(s);
  const at = (stamps ?? (await proposalStamps(ctx))).get(about);
  if (!at) return [];
  const key = `${about}@${at}`;
  if (!parsed.has(key)) {
    const row = await privateStore(ctx.config).proposals.get(about);
    const p = row ? validateProposals(JSON.parse(row.body)) : null;
    parsed.set(key, p?.ok ? p.value : null);
  }
  return activityPieces(s, parsed.get(key) ?? null);
}
