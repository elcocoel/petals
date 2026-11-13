// A flower gliding from the reading it drew to a new one, as layers from different people make a map fuller (the
// map drawn from the layers on, petals moving, no jump). Each petal goes from where it was drawn to where the new
// reading puts it, matched by who it is: its angle, its width and its height ease together. A wallet the new
// reading brings grows out of the seam it opens in; one it no longer has closes into its seam, drawn as a fading
// ghost. Where nothing reorders, neighbours keep touching all the way.
import { closeRing, newRing, placeAt, type Ring } from './ring.ts';

/** How long a flower takes to glide to a new reading, in seconds: as long as the map's arrangement does. */
export const GLIDE = 0.8;

/** A flower as it was last drawn: each petal by who it is, its angles and height, and its fill. */
export interface Drawn {
  ids: readonly string[];
  start: Float64Array;
  end: Float64Array;
  h: Float64Array;
  fills: readonly string[];
  /** its reading's rest shape, so a reading that draws the same never glides */
  width: Float64Array;
  height: Float64Array;
  /** how the ring was turned and slid, so the new one starts there too */
  rotation: number;
  ox: number;
  oy: number;
  /** a glide it was still in when it was taken down, so the same reading coming again carries on with it */
  glide: Glide | null;
}

export interface Glide {
  /** seconds since it began */
  t: number;
  /** where each of the new reading's petals starts from, by its new index: angle, width (radians) and height */
  a0: Float64Array;
  w0: Float64Array;
  h0: Float64Array;
  /** the petals it no longer has: where each was, and the new petal whose start it closes to (-1: the ring's end) */
  gone: { a0: number; w0: number; h0: number; next: number }[];
  /** the gone ones, drawn: one wedge each */
  ghosts: Ring;
  /** their fills, as they were */
  ghostFills: readonly string[];
  /** how much of the glide is done, eased: what the ghosts' fading reads */
  e: number;
  /** where each petal is going, this frame, before the glide moves it there */
  a1: Float64Array;
  w1: Float64Array;
  h1: Float64Array;
}

/** The flower as drawn now, kept for the next reading to glide from. */
export function drawnOf(
  ring: Ring,
  ids: readonly string[],
  fills: readonly string[],
  rest: { width: Float64Array; height: Float64Array },
  glide: Glide | null = null,
): Drawn {
  const n = ids.length;
  return {
    ids,
    start: ring.start.slice(0, n),
    end: ring.end.slice(0, n),
    h: ring.h.slice(0, n),
    fills,
    width: rest.width.slice(),
    height: rest.height.slice(),
    rotation: ring.rotation,
    ox: ring.ox,
    oy: ring.oy,
    glide,
  };
}

const same = (a: Float64Array, b: Float64Array): boolean =>
  a.length === b.length && a.every((x, i) => Math.abs(x - (b[i] as number)) < 1e-9);

/**
 * The glide from what was drawn to a reading of these petals, with this rest shape. When the reading draws the same
 * petals the same way: the glide it was still in, carried on where it was (on live the server's reading lands half way
 * through the browser's own, the same; it glided on, it didn't jump), or null, so nothing moves.
 */
export function glideBetween(
  was: Drawn,
  ids: readonly string[],
  rest: { width: Float64Array; height: Float64Array },
): Glide | null {
  const sameIds = was.ids.length === ids.length && was.ids.every((id, i) => id === ids[i]);
  if (sameIds && same(was.width, rest.width) && same(was.height, rest.height)) return was.glide;
  const n = ids.length;
  const oldAt = new Map(was.ids.map((id, k) => [id, k]));
  const newAt = new Map(ids.map((id, j) => [id, j]));
  const a0 = new Float64Array(n);
  const w0 = new Float64Array(n);
  const h0 = new Float64Array(n);
  // the seam a new petal opens in: the end, as drawn, of the last petal before it that was there
  let seam = 0;
  for (let j = 0; j < n; j++) {
    const k = oldAt.get(ids[j] as string);
    if (k === undefined) {
      a0[j] = seam;
      continue;
    }
    a0[j] = was.start[k] as number;
    w0[j] = (was.end[k] as number) - (was.start[k] as number);
    h0[j] = was.h[k] as number;
    seam = was.end[k] as number;
  }
  const gone: Glide['gone'] = [];
  const ghostFills: string[] = [];
  for (let k = 0; k < was.ids.length; k++) {
    if (newAt.has(was.ids[k] as string)) continue;
    // it closes toward the next petal, as drawn, that stays
    let next = -1;
    for (let q = k + 1; q < was.ids.length && next < 0; q++)
      next = newAt.get(was.ids[q] as string) ?? -1;
    gone.push({
      a0: was.start[k] as number,
      w0: (was.end[k] as number) - (was.start[k] as number),
      h0: was.h[k] as number,
      next,
    });
    ghostFills.push(was.fills[k] ?? '');
  }
  return {
    t: 0,
    a0,
    w0,
    h0,
    gone,
    ghosts: newRing(gone.length),
    ghostFills,
    e: 0,
    a1: new Float64Array(n),
    w1: new Float64Array(n),
    h1: new Float64Array(n),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Slow in, slow out. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * One frame of the glide, over a ring just laid where the new reading puts each petal: moves each petal from where
 * it was toward there, and the gone ones toward their seams. False once it's done, the ring then as laid.
 */
export function stepGlide(g: Glide, ring: Ring, dt: number): boolean {
  g.t += dt;
  const e = ease(Math.min(1, g.t / GLIDE));
  g.e = e;
  const { n, rotation } = ring;
  for (let i = 0; i < n; i++) {
    g.a1[i] = ring.start[i] as number;
    g.w1[i] = (ring.end[i] as number) - (ring.start[i] as number);
    g.h1[i] = ring.h[i] as number;
  }
  if (e < 1) {
    for (let i = 0; i < n; i++) {
      placeAt(
        ring,
        i,
        lerp(g.a0[i] as number, g.a1[i] as number, e),
        lerp(g.w0[i] as number, g.w1[i] as number, e),
        rotation,
        lerp(g.h0[i] as number, g.h1[i] as number, e),
      );
    }
    closeRing(ring);
  }
  const end = n > 0 ? (g.a1[n - 1] as number) + (g.w1[n - 1] as number) : 0;
  g.ghosts.rotation = rotation;
  g.gone.forEach((q, i) => {
    const to = q.next >= 0 ? (g.a1[q.next] as number) : end;
    placeAt(g.ghosts, i, lerp(q.a0, to, e), q.w0 * (1 - e), rotation, q.h0 * (1 - e));
  });
  return e < 1;
}
