// A flower from very far away (#84; coordinator/one-source.md, "Levels", the nano petal). Elco, 11 Nov: "at a
// very far away zoom we can have a focus on helping you identify which organization it is not the data itself
// ... an abbreviated version of the graph where all the cells kind of combine to a more simplified wave like
// circular shape that is actually coming from the data that doesn't try to be as precise and would actually
// respond to whatever the settings the user are on ... you don't have to see the separation between each
// individual wallet". So: one ring with a soft wavy outer edge, made from the petals' own heights (which the
// person's view decides), smoothed round the circle so neighbours merge, and a hole where the organisation's
// mark sits. For /lab first (/lab/map?far=wave): nothing on /map draws it until Elco has seen it. Pure.
import type { Rest, Shape } from './ring.ts';
import { n3 } from './ring.ts';

const TAU = Math.PI * 2;

export interface FarWave {
  /** how many points go round the edge */
  points: number;
  /** how wide the smoothing reaches round the circle, in radians: wider merges more neighbours */
  spread: number;
  /**
   * How much the tallest petals keep their say: 1 averages heights, so one tall petal among small ones sinks;
   * higher keeps a peak where the flower has one.
   */
  keep: number;
}

/** The lean: 120 points, a spread of about a twelfth of the circle, so the ring reads round; peaks softened. */
export const FAR_WAVE: FarWave = { points: 120, spread: 0.5, keep: 2 };

/**
 * The wave's outer edge: for each angle round the flower (clockwise from twelve, as the petals go), how far
 * beyond the polygon the edge is, in world units. A smoothed power mean of the petals' heights, each weighted
 * by how near its middle is to that angle.
 */
export function waveHeights(
  rest: Pick<Rest, 'mid' | 'height'>,
  wave: FarWave = FAR_WAVE,
): Float64Array {
  const { mid, height } = rest;
  const n = mid.length;
  const out = new Float64Array(wave.points);
  const s2 = 2 * wave.spread * wave.spread;
  for (let j = 0; j < wave.points; j++) {
    const a = (j / wave.points) * TAU;
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < n; i++) {
      let d = Math.abs(a - (mid[i] as number)) % TAU;
      if (d > Math.PI) d = TAU - d;
      const w = Math.exp((-d * d) / s2);
      sum += w * (height[i] as number) ** wave.keep;
      weight += w;
    }
    out[j] = weight > 0 ? (sum / weight) ** (1 / wave.keep) : 0;
  }
  return out;
}

/**
 * The wave as one closed path with a hole: its soft outer edge through the heights, as a smooth curve, and the
 * polygon's circle inside it, drawn with the even-odd rule so the hole stays open for the mark.
 */
export function farPath(
  rest: Pick<Rest, 'mid' | 'height'>,
  shape: Pick<Shape, 'cx' | 'cy' | 'r0'>,
  wave: FarWave = FAR_WAVE,
): string {
  const hs = waveHeights(rest, wave);
  const m = hs.length;
  const { cx, cy, r0 } = shape;
  const pts = Array.from(hs, (h, j) => {
    const a = (j / m) * TAU;
    const r = r0 + h;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
  });
  // Catmull-Rom through the points, as cubic Béziers: smooth, and through every point
  const at = (j: number) => pts[((j % m) + m) % m] as readonly [number, number];
  let d = `M${n3(at(0)[0])} ${n3(at(0)[1])}`;
  for (let j = 0; j < m; j++) {
    const p0 = at(j - 1);
    const p1 = at(j);
    const p2 = at(j + 1);
    const p3 = at(j + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${n3(c1x)} ${n3(c1y)} ${n3(c2x)} ${n3(c2y)} ${n3(p2[0])} ${n3(p2[1])}`;
  }
  d += 'Z';
  // the hole: the polygon's circle, two arcs
  d += `M${n3(cx)} ${n3(cy - r0)}A${n3(r0)} ${n3(r0)} 0 1 0 ${n3(cx)} ${n3(cy + r0)}A${n3(r0)} ${n3(r0)} 0 1 0 ${n3(cx)} ${n3(cy - r0)}Z`;
  return d;
}

/** How far the wave reaches at its highest, as a share of R, as reachOf says for the petals. */
export const waveReach = (
  rest: Pick<Rest, 'mid' | 'height'>,
  shape: Pick<Shape, 'r0' | 'R'>,
  wave: FarWave = FAR_WAVE,
): number => (shape.r0 + Math.max(0, ...waveHeights(rest, wave))) / shape.R;
