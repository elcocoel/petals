// Proposals on the ring, and each wallet's vote (#93). Elco, 11 Nov: "They are dots or lines arcs on the outer ring
// on top of the petal, when a proposal is hovered little dots show up on the inside showing yes and no votes,
// absent votes show nothing." So: a thin ring just outside the petals is a stretch of time, clockwise from twelve,
// its start to its end; each proposal is an arc on it, from when it was put up to when it was decided (or when its
// voting closed, where the DAO doesn't record a decision; to the ring's end while it's open); and a
// proposal pointed at puts a dot just inside the polygon under each voter's petal, in the colour the reading gives
// its vote. No vote, no dot. Takes SYSTEMS's proposals/v1 as it comes. For /lab first. Pure.
import { n3, type Ring, SHAPE } from './ring.ts';

const TAU = Math.PI * 2;

/**
 * One vote, as proposals/v1 says it. An account that didn't vote isn't there. proposals/v2: null where its choices
 * aren't for, against or abstain (weighted, quadratic, ranked choice): it voted, but neither.
 */
export interface Vote {
  account: string;
  vote: 'for' | 'against' | 'abstain' | null;
}

/** A vote's colour key: null (proposals/v2's other choices) is drawn as abstain is, voted but neither. */
export type VoteColour = Exclude<Vote['vote'], null>;

/** One proposal, as proposals/v1 says it (what the ring needs of it). */
export interface Proposal {
  id: string;
  title: string;
  /** when it was put up */
  at: string;
  /** when it was decided, or null where the DAO doesn't say */
  decided_at: string | null;
  /** when voting closes under the DAO's policy (Sputnik records no decision time) */
  closes_at?: string | null;
  outcome: string;
  /** who put it up, when the DAO says */
  proposer?: string | null;
  votes: Vote[];
}

/** How far out the ring sits, as a share of R past the polygon: just beyond the longest petal. */
export const VOTE_RING = 1.04;

/** The narrowest an arc is drawn, in radians, so a proposal decided the day it was put up still shows. */
export const ARC_LEAST = 0.012;

export interface Arc {
  id: string;
  a0: number;
  a1: number;
  /** Proposals open at once stack outward: 0 is the ring itself, 1 the first lane past it, and so on. */
  lane: number;
}

/** How far apart the lanes of proposals open at once sit, in world units. */
export const LANE_GAP = 5;

/**
 * Each proposal's arc on the ring: its time from `from` to `to` as angles clockwise from twelve, from `at` to
 * `decided_at`, else `closes_at`, else the ring's end. A proposal outside the stretch has none.
 */
export function arcsOf(proposals: readonly Proposal[], from: string, to: string): Arc[] {
  const t0 = Date.parse(from);
  const t1 = Date.parse(to);
  const span = t1 - t0 || 1;
  const angle = (t: number) => (Math.max(0, Math.min(span, t - t0)) / span) * TAU;
  const arcs = proposals
    .flatMap((p) => {
      const start = Date.parse(p.at);
      const closes = p.decided_at ?? p.closes_at ?? null;
      const end = closes ? Date.parse(closes) : t1;
      if (end < t0 || start > t1) return [];
      const a0 = angle(start);
      const a1 = Math.max(angle(end), a0 + ARC_LEAST);
      return [{ id: p.id, a0, a1, lane: 0 }];
    })
    .sort((x, y) => x.a0 - y.a0 || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  // each arc takes the first lane that's free when it starts, so none hides another
  const ends: number[] = [];
  for (const a of arcs) {
    let lane = ends.findIndex((e) => e <= a.a0);
    if (lane < 0) lane = ends.length;
    ends[lane] = a.a1;
    a.lane = lane;
  }
  return arcs;
}

/** A lane's radius: the ring's, and LANE_GAP more for each lane out. */
export const laneRadius = (lane: number): number => SHAPE.R * VOTE_RING + lane * LANE_GAP;

/** An arc of the ring, clockwise from a0 to a1, at radius r round the flower's centre. */
export function arcPath(a0: number, a1: number, r: number = SHAPE.R * VOTE_RING): string {
  const { cx, cy } = SHAPE;
  const x0 = cx + r * Math.sin(a0);
  const y0 = cy - r * Math.cos(a0);
  const x1 = cx + r * Math.sin(a1);
  const y1 = cy - r * Math.cos(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${n3(x0)} ${n3(y0)}A${n3(r)} ${n3(r)} 0 ${large} 1 ${n3(x1)} ${n3(y1)}`;
}

/** The whole ring, as a circle's radius. */
export const ringRadius = (): number => SHAPE.R * VOTE_RING;

/**
 * Where a petal's vote dot sits: just inside the polygon, under the middle of its foot, and how big it may be
 * without crowding its neighbours.
 */
export function voteDot(ring: Ring, i: number): { x: number; y: number; r: number } {
  const mx = ((ring.ax[i] as number) + (ring.bx[i] as number)) / 2;
  const my = ((ring.ay[i] as number) + (ring.by[i] as number)) / 2;
  const len = ring.len[i] as number;
  const r = Math.max(0.4, Math.min(3, len * 0.32));
  const inset = r + 1.2;
  return { x: mx - (ring.nx[i] as number) * inset, y: my - (ring.ny[i] as number) * inset, r };
}

/** Each petal's vote on a proposal, by its id. */
export const votesOn = (p: Proposal): Map<string, Vote['vote']> =>
  new Map(p.votes.map((v) => [v.account, v.vote]));

/** How far apart a petal's proposals stack outward, in world units. */
export const STACK_GAP = 5.5;

export interface Placed {
  id: string;
  /** the proposer's petal, or -1 when the proposer isn't on this flower (or isn't known) */
  petal: number;
  /** how many of its stack come before it, oldest first */
  step: number;
}

/**
 * Where each proposal in the stretch sits (Elco, 11 Nov: "proposals are related to specific wallets - SOMEONE made
 * that proposal"): above its proposer's petal, stacked outward oldest first; a proposal whose proposer isn't a
 * petal here goes in one stack of its own. `ids` are the flower's petals in order.
 */
export function placesOf(
  proposals: readonly Proposal[],
  ids: readonly string[],
  from: string,
  to: string,
): Placed[] {
  const t0 = Date.parse(from);
  const t1 = Date.parse(to);
  const at = new Map(ids.map((id, i) => [id, i]));
  const counts = new Map<number, number>();
  return proposals
    .filter((p) => {
      const start = Date.parse(p.at);
      const close = Date.parse(p.decided_at ?? p.closes_at ?? p.at);
      return start <= t1 && close >= t0;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : 1))
    .map((p) => {
      const petal = p.proposer ? (at.get(p.proposer) ?? -1) : -1;
      const step = counts.get(petal) ?? 0;
      counts.set(petal, step + 1);
      return { id: p.id, petal, step };
    });
}

/** The angle the proposals of no petal stack at: just before twelve, where the ring starts and ends. */
export const OTHERS_AT = -0.05;

/** A stack is this many arcs high; past it, the next column starts beside it (the others' stack only). */
export const STACK_MOST = 8;
/** The others' stack: arcs this wide, in radians, in columns going back from twelve. */
const OTHERS_WIDTH = 0.05;

/**
 * A placed proposal's arc (Elco, 11 Nov: "an arch ... on top of the segment of the actual petal"): over its
 * proposer's petal's own stretch of the circle, the fine gap kept at each end, out from the ring by its step. A
 * proposal of no petal sits in the others' stack just before twelve, in columns of STACK_MOST.
 */
export function placeArc(ring: Ring, petal: number, step: number): string {
  if (petal >= 0) {
    const r = SHAPE.R * VOTE_RING + 3 + step * STACK_GAP;
    const a0 = (ring.start[petal] as number) + ring.rotation;
    const a1 = (ring.start[petal + 1] as number) + ring.rotation;
    // the line between petals, as an angle at this radius
    const pad = Math.min((a1 - a0) / 4, (ring.gut[petal] as number) / r + 0.6 / r);
    return arcPath(a0 + pad, Math.max(a0 + pad, a1 - pad), r);
  }
  const column = Math.floor(step / STACK_MOST);
  const row = step % STACK_MOST;
  const end = OTHERS_AT - column * (OTHERS_WIDTH + 0.015);
  return arcPath(end - OTHERS_WIDTH, end, SHAPE.R * VOTE_RING + 3 + row * STACK_GAP);
}
