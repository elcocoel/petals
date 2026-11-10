// The map's space (specs/006-the-map, M-D): one camera over every flower, and each flower's own view worked
// out from it, so a flower on the map is drawn and read exactly as it is alone. Pure.
import type { View } from '../flower/camera.ts';
import { DETAIL } from '../flower/detail.ts';
import type { Model } from '../flower/model.ts';
import { SHAPE } from '../flower/ring.ts';
import type { Place } from './places.ts';

/**
 * A flower's own view, from the map's camera: the flower's world (its 800 units, centred on SHAPE's
 * middle) scaled by its size and set at its place.
 */
export function flowerView(cam: View, p: Pick<Place, 'x' | 'y' | 's'>): View {
  const k = cam.k * p.s;
  return {
    k,
    x: cam.x + cam.k * (p.x - p.s * SHAPE.cx),
    y: cam.y + cam.k * (p.y - p.s * SHAPE.cy),
    width: cam.width,
    height: cam.height,
  };
}

/** A flower's radius on screen: what every row of detail.ts reads as `flowerRadius`. */
export const screenRadius = (cam: View, p: Pick<Place, 's'>): number => SHAPE.R * cam.k * p.s;

/** Where a flower's middle is on screen. */
export const screenCentre = (cam: View, p: Pick<Place, 'x' | 'y'>) => ({
  x: cam.x + cam.k * p.x,
  y: cam.y + cam.k * p.y,
});

/**
 * How far a flower's petals really reach at rest, as a share of SHAPE.R: a flower of short petals reaches
 * less than its room, and its name and its connections should meet its petals, not its room.
 */
export function reachOf(m: Pick<Model, 'ring'>): number {
  const { ring } = m;
  let most = SHAPE.r0;
  for (let i = 0; i < ring.n; i++) {
    const h = ring.h[i] as number;
    const x = ((ring.ax[i] as number) + (ring.bx[i] as number)) / 2 + (ring.nx[i] as number) * h;
    const y = ((ring.ay[i] as number) + (ring.by[i] as number)) / 2 + (ring.ny[i] as number) * h;
    most = Math.max(most, Math.hypot(x - SHAPE.cx, y - SHAPE.cy));
  }
  return most / SHAPE.R;
}

/** Is any of the flower, and its name under it, in the window? */
export function onScreen(cam: View, p: Pick<Place, 'x' | 'y' | 's'>, margin = 24): boolean {
  const c = screenCentre(cam, p);
  const r = screenRadius(cam, p) + margin + 24;
  return c.x + r > 0 && c.x - r < cam.width && c.y + r > 0 && c.y - r < cam.height;
}

/**
 * A flower takes over from its silhouette a little before its own petals fade in, and gives it back a
 * little lower, so a hand resting at the threshold doesn't make it flicker. Between the two, the live
 * flower draws its own silhouette, which is the same shape.
 */
export const LIVE_FROM = DETAIL.petals.fadeIn[0] - 4;
export const LIVE_UNTIL = LIVE_FROM - 8;
/** At most this many live flowers at once, biggest on screen first. */
export const LIVE_MOST = 6;

/** Which flowers are live now, given which were. */
export function liveSet(
  cam: View,
  flowers: readonly Pick<Place, 'x' | 'y' | 's'>[],
  were: ReadonlySet<number>,
): Set<number> {
  const want: { i: number; r: number }[] = [];
  flowers.forEach((p, i) => {
    if (!onScreen(cam, p, 0)) return;
    const r = screenRadius(cam, p);
    if (r >= LIVE_FROM || (were.has(i) && r >= LIVE_UNTIL)) want.push({ i, r });
  });
  want.sort((a, b) => b.r - a.r || a.i - b.i);
  return new Set(want.slice(0, LIVE_MOST).map((w) => w.i));
}

/** The flower whose petals are under a point on screen, nearest middle first, or -1. */
export function flowerAt(
  cam: View,
  flowers: readonly Pick<Place, 'x' | 'y' | 's'>[],
  reach: readonly number[],
  x: number,
  y: number,
): number {
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  flowers.forEach((p, i) => {
    const c = screenCentre(cam, p);
    const d = Math.hypot(x - c.x, y - c.y);
    if (d <= screenRadius(cam, p) * (reach[i] ?? 1) && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** The scale at which a flower of this size fills the window as it does alone (camera.ts fitView). */
export const fitScale = (s: number, width: number, height: number, fit: number): number =>
  (Math.min(width, height) * fit) / (SHAPE.R * s);

/**
 * Entering an organisation: a flower whose radius on screen reaches this share of the window's short side
 * is the one you're looking at, and everything else fades. It lets go a good deal lower, so a hand
 * resting near the threshold doesn't flicker between the two. A flower alone fills FIT (0.415).
 */
export const ENTER_AT = 0.38;
export const LEAVE_AT = 0.24;

/**
 * Where a ray from a point, along (ux, uy), meets the window shrunk by `inset` on every side, and on the
 * left by `left` (what sits down the window's left side).
 */
export function edgePoint(
  x: number,
  y: number,
  ux: number,
  uy: number,
  width: number,
  height: number,
  inset: number,
  left = inset,
): { x: number; y: number } {
  const lo = { x: Math.max(inset, left), y: inset };
  const hi = { x: width - inset, y: height - inset };
  let t = Number.POSITIVE_INFINITY;
  if (ux > 1e-9) t = Math.min(t, (hi.x - x) / ux);
  if (ux < -1e-9) t = Math.min(t, (lo.x - x) / ux);
  if (uy > 1e-9) t = Math.min(t, (hi.y - y) / uy);
  if (uy < -1e-9) t = Math.min(t, (lo.y - y) / uy);
  if (!Number.isFinite(t) || t < 0) t = 0;
  return { x: x + ux * t, y: y + uy * t };
}

/**
 * How far a flower's petals reach toward a direction, in its own units: the tallest petal whose tip lies
 * within one petal's angle of it, or the polygon where none does. An arrow out starts there.
 */
export function reachToward(m: Pick<Model, 'ring'>, ux: number, uy: number): number {
  const { ring } = m;
  const want = Math.atan2(uy, ux);
  const half = Math.PI / Math.max(1, ring.n);
  let most = SHAPE.r0;
  for (let i = 0; i < ring.n; i++) {
    const h = ring.h[i] as number;
    const x = ((ring.ax[i] as number) + (ring.bx[i] as number)) / 2 + (ring.nx[i] as number) * h;
    const y = ((ring.ay[i] as number) + (ring.by[i] as number)) / 2 + (ring.ny[i] as number) * h;
    const a = Math.atan2(y - SHAPE.cy, x - SHAPE.cx);
    const off = Math.abs(Math.atan2(Math.sin(a - want), Math.cos(a - want)));
    if (off <= half * 1.5) most = Math.max(most, Math.hypot(x - SHAPE.cx, y - SHAPE.cy));
  }
  return most;
}

/** How far a point is from a segment, on screen. */
export function toSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
