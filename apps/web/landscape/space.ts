// The map's space (specs/006-the-map, M-D): one camera over every flower, and each flower's own view worked
// out from it, so a flower on the map is drawn and read exactly as it is alone. Pure.
import type { View } from '../flower/camera.ts';
import { DETAIL } from '../flower/detail.ts';
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

/** The flower under a point on screen, nearest middle first, or -1. */
export function flowerAt(
  cam: View,
  flowers: readonly Pick<Place, 'x' | 'y' | 's'>[],
  x: number,
  y: number,
): number {
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  flowers.forEach((p, i) => {
    const c = screenCentre(cam, p);
    const d = Math.hypot(x - c.x, y - c.y);
    if (d <= screenRadius(cam, p) && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** The scale at which a flower of this size fills the window as it does alone (camera.ts fitView). */
export const fitScale = (s: number, width: number, height: number, fit: number): number =>
  (Math.min(width, height) * fit) / (SHAPE.R * s);
