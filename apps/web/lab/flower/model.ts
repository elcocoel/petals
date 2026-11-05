// A reading, ready to be drawn: its rest geometry and the order things get their say. Pure.
import type { Reading, ReadingPetal } from '@petal/core/types';
import { type Rest, restOf, SHAPE, type Shape } from './ring.ts';
import { noteText, textWidth } from './words.ts';

/** All a drawing needs from a reading. */
export type FlowerReading = Pick<Reading, 'title' | 'petals'>;

export interface Model extends Rest, Shape {
  title: string;
  titleWidth: number;
  petals: ReadingPetal[];
  n: number;
  notes: string[];
  noteWidths: Float64Array;
  /** The same notes with the name in full, for the one being pointed at. */
  fullNotes: string[];
  /** Who gets a note first: the tail, then by rank. The tail is a big claim in small print. */
  order: Int32Array;
  /** The rank a note's priority counts as. */
  rankOf: Float64Array;
  meanSide: number;
}

export function modelOf(reading: FlowerReading): Model {
  const petals = reading.petals;
  const rest = restOf(petals);
  const n = petals.length;
  const notes = petals.map((p) => noteText(p));
  const order = Int32Array.from(
    petals.map((_, i) => i).sort((a, b) => priority(petals[a]) - priority(petals[b])),
  );
  const rankOf = new Float64Array(n);
  order.forEach((i, at) => {
    rankOf[i] = at + 1;
  });
  let side = 0;
  for (let i = 0; i < n; i++) side += rest.ring.len[i] as number;
  return {
    ...SHAPE,
    ...rest,
    title: reading.title,
    titleWidth: textWidth(reading.title),
    petals,
    n,
    notes,
    noteWidths: Float64Array.from(notes, (s) => textWidth(s)),
    fullNotes: petals.map((p) => noteText(p, true)),
    order,
    rankOf,
    meanSide: side / (n || 1),
  };
}

const priority = (p: ReadingPetal | undefined): number => (p?.tail ? 1.5 : (p?.rank ?? 0));

export interface Picked {
  index: number;
  /** The pointer's angle about the centre, clockwise from twelve, at rest. */
  angle: number;
  /** 0 to 1: how much the pointer is near the flower at all. */
  reach: number;
  /** Where along the side, 0 to 1. */
  along: number;
  /** How far up the bar, in world units, clamped to the bar. */
  up: number;
}

const TAU = Math.PI * 2;

/** The petal a world point is over, by wedge, at rest. Every angle belongs to someone. */
export function pick(
  m: Model,
  wx: number,
  wy: number,
  reach: (r: number) => number,
): Picked | null {
  const dx = wx - m.cx;
  const dy = wy - m.cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  const near = reach(r);
  if (near <= 0) return null;
  let angle = Math.atan2(dx, -dy);
  if (angle < 0) angle += TAU;
  const { start, nx, ny, ax, ay } = m.ring;
  let lo = 0;
  let hi = m.n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((start[mid] as number) <= angle) lo = mid;
    else hi = mid - 1;
  }
  const s0 = start[lo] as number;
  const s1 = start[lo + 1] as number;
  const n0 = nx[lo] as number;
  const n1 = ny[lo] as number;
  const up = (wx - (ax[lo] as number)) * n0 + (wy - (ay[lo] as number)) * n1;
  return {
    index: lo,
    angle,
    reach: near,
    along: (angle - s0) / (s1 - s0 || 1),
    up: Math.max(0, Math.min(m.height[lo] as number, up)),
  };
}
