// The vote ring on the product's flowers: a map's proposals, as
// the server reads them (proposals/v1), on a thin ring just outside the petals, each an arc over the petal of the
// member who put it up; pointing at one puts a dot under each voter's petal. The ring is the last RING_DAYS of the
// map's proposals, up to when the newest one closes, until the legend's period setting. Pure.
import { GREY, KEYS, type Key } from '@petal/core/wedge/keys';
import type { Proposal, VoteColour } from '@petal/core/wedge/votes';

/** How much of a map's time the ring shows: its last 90 days of proposals. */
export const RING_DAYS = 90;
const DAY = 86_400_000;

/** What the flower's scene takes to draw the ring (scene.ts PetalLook votes). */
export interface VoteRing {
  from: string;
  to: string;
  proposals: readonly Proposal[];
  colours: Record<VoteColour, string>;
}

/** The reading's meaning for this question: for mint, against pink; abstain is context. */
export const VOTE_COLOURS: Record<VoteColour, string> = {
  for: (KEYS[0] as Key).hex,
  against: (KEYS[4] as Key).hex,
  abstain: GREY.hex,
};

/** The ring's stretch: the last `days` of the proposals, up to when the newest one closes. */
export function stretchOf(
  proposals: readonly Proposal[],
  days = RING_DAYS,
): { from: string; to: string } {
  const last = Math.max(...proposals.map((p) => Date.parse(p.decided_at ?? p.closes_at ?? p.at)));
  return { from: new Date(last - days * DAY).toISOString(), to: new Date(last).toISOString() };
}

/** A map's ring, or none where it has no proposals. */
export function voteRing(proposals: readonly Proposal[] | null, days = RING_DAYS): VoteRing | null {
  if (!proposals?.length) return null;
  return { ...stretchOf(proposals, days), proposals, colours: VOTE_COLOURS };
}
