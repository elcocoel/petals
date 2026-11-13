// Each petal's vesting at its reading's date (core's vestingPieces; Elco, 12 Nov, wave 7: "it's vesting reader for
// anything - the model has to know how to figure out a vesting schedule and have a strategy to deal with the petal
// segmentation"), for every renderer: the map's views and render_flower. A map's vesting is parsed once for each
// time it was read, so drawing the map stays as cheap as it was.
import {
  mapOf,
  type SeamPiece,
  type Vesting,
  type VestingAt,
  validateVesting,
  vestingAt,
  vestingPieces,
} from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { privateStore } from './drafts.ts';
import type { ToolContext } from './types.ts';

/** Parsed vesting by `<about>@<read_at>`: a read never changes, so each is parsed once per process. */
const parsed = new Map<string, Vesting | null>();

/** When each map's vesting was read, by its address: what a drawing's vesting is made from. */
export async function vestingStamps(ctx: ToolContext): Promise<Map<string, string>> {
  const rows = await privateStore(ctx.config).vesting.stamps();
  return new Map(rows.map((r) => [r.about, r.read_at]));
}

/** This reading's petals' vesting, as read when `stamps` was taken; none where its map has none. */
export async function vestingOf(
  ctx: ToolContext,
  s: Snapshot,
  stamps?: ReadonlyMap<string, string>,
): Promise<SeamPiece[]> {
  const about = mapOf(s);
  const at = (stamps ?? (await vestingStamps(ctx))).get(about);
  if (!at) return [];
  const key = `${about}@${at}`;
  if (!parsed.has(key)) {
    const row = await privateStore(ctx.config).vesting.get(about);
    const v = row ? validateVesting(JSON.parse(row.body)) : null;
    parsed.set(key, v?.ok ? v.value : null);
  }
  return vestingPieces(s, parsed.get(key) ?? null);
}

/**
 * A map's kept vesting at `at`, in words an agent can say (get_map: without it, asked what's still locked, an
 * agent has only the web to read): each allocation's unlocked, next unlock and later, and their totals, by the
 * schedules alone. Null where the map's vesting wasn't read.
 */
export async function vestingNow(
  ctx: ToolContext,
  about: string,
  at: Date,
): Promise<(VestingAt & { how: string }) | null> {
  const row = await privateStore(ctx.config).vesting.get(about);
  const v = row ? validateVesting(JSON.parse(row.body)) : null;
  if (!v?.ok) return null;
  return {
    ...vestingAt(v.value, at.getTime()),
    how: 'by its schedules as read: unlocked is past its lock, not what was withdrawn; each allocation says how it is known (verified, published or inferred)',
  };
}
