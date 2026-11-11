// Proposals on the ring, and each wallet's vote (#93). Elco, 11 Nov: "They are dots or lines arcs on the outer ring
// on top of the petal, when a proposal is hovered little dots show up on the inside showing yes and no votes,
// absent votes show nothing." So: a thin ring just outside the petals is a stretch of time, clockwise from twelve,
// its start to its end; each proposal is an arc on it, from when it was put up to when it was decided (or when its
// voting closed, where the DAO doesn't record a decision; to the ring's end while it's open); and a
// proposal pointed at puts a dot just inside the polygon under each voter's petal, in the colour the reading gives
// its vote. No vote, no dot. Takes SYSTEMS's proposals/v1 as it comes. For /lab first. Pure.
import { n3, type Ring, SHAPE } from './ring.ts';

const TAU = Math.PI * 2;

/** One vote, as proposals/v1 says it. An account that didn't vote isn't there. */
export interface Vote {
  account: string;
  vote: 'for' | 'against' | 'abstain';
}

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
}

/**
 * Each proposal's arc on the ring: its time from `from` to `to` as angles clockwise from twelve, from `at` to
 * `decided_at`, else `closes_at`, else the ring's end. A proposal outside the stretch has none.
 */
export function arcsOf(proposals: readonly Proposal[], from: string, to: string): Arc[] {
  const t0 = Date.parse(from);
  const t1 = Date.parse(to);
  const span = t1 - t0 || 1;
  const angle = (t: number) => (Math.max(0, Math.min(span, t - t0)) / span) * TAU;
  return proposals.flatMap((p) => {
    const start = Date.parse(p.at);
    const closes = p.decided_at ?? p.closes_at ?? null;
    const end = closes ? Date.parse(closes) : t1;
    if (end < t0 || start > t1) return [];
    const a0 = angle(start);
    const a1 = Math.max(angle(end), a0 + ARC_LEAST);
    return [{ id: p.id, a0, a1 }];
  });
}

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
