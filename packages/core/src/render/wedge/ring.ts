// The polygon and its wedges. layout() and band() aren't exported from @petal/core, so the circle's
// recipe here is a copy of packages/core/src/render/geometry.ts: the same angles and the same polygon,
// which a test holds to the golden SVGs. The petals themselves are a new drawing: where layout() stands
// parallel bars on each side, these are wedges that take up their whole angle, with straight radial
// sides, bases flush on the polygon, straight ends, and a line of constant width between neighbours.
// Heights are exactly the reading's.
// Written for 60 frames a second: arrays filled in place instead of objects, and no sub-sides. layout()
// splits a side wider than 0.9 pi, and the tail when it's wider than 0.45 rad; no flower here
// gets near that, 4x open included.
import type { ReadingPetal } from '../../types/index.ts';

/** The line between two wedges, in world units: the same width from base to tip. */
export const GUTTER = 0.6;

/** The flower fills this share of the window's short side, or of a picture's side, at rest. */
export const FIT = 0.415;

const TAU = Math.PI * 2;
/** render/v1's default size, so the numbers can be compared with the golden SVGs. */
export const SIZE = 800;

export interface Ring {
  n: number;
  /** Where each side starts, in radians clockwise from twelve, before `rotation`. n + 1 values. */
  start: Float64Array;
  /**
   * Where each wedge ends: the next one's start, except in a flower of few (FEW), whose wedges stand apart with
   * open circle between them. n values.
   */
  end: Float64Array;
  /** The radial direction at each wedge's end (the next one's start, but in a flower of few). n values. */
  vx: Float64Array;
  vy: Float64Array;
  rotation: number;
  /** The radial direction at each boundary between wedges. n + 1 values, the last is the first. */
  ux: Float64Array;
  uy: Float64Array;
  /** Cosine and sine of half the wedge's angle. */
  cw: Float64Array;
  sw: Float64Array;
  /** Half the line between this wedge and its neighbour. */
  gut: Float64Array;
  /** Each wedge's base, on the polygon, the line taken off. */
  ax: Float64Array;
  ay: Float64Array;
  bx: Float64Array;
  by: Float64Array;
  /** Outward unit normal at the side's middle angle. */
  nx: Float64Array;
  ny: Float64Array;
  /** The polygon's side, before the line. */
  len: Float64Array;
  /** The wedge's height, along the normal, from its base. */
  h: Float64Array;
  /** How much wider than itself the tip is drawn, as extra. The base stays where it is. */
  flare: Float64Array;
  /** Where the whole ring has been slid to keep an account under the pointer. */
  ox: number;
  oy: number;
}

export function newRing(n: number): Ring {
  const f = () => new Float64Array(n);
  return {
    n,
    start: new Float64Array(n + 1),
    end: f(),
    vx: f(),
    vy: f(),
    rotation: 0,
    ux: new Float64Array(n + 1),
    uy: new Float64Array(n + 1),
    cw: f(),
    sw: f(),
    gut: f(),
    ax: f(),
    ay: f(),
    bx: f(),
    by: f(),
    nx: f(),
    ny: f(),
    len: f(),
    h: f(),
    flare: f(),
    ox: 0,
    oy: 0,
  };
}

export interface Shape {
  cx: number;
  cy: number;
  R: number;
  r0: number;
  L: number;
}

/** As in layout(): R leaves 15% for labels, the polygon is 32% of R, bars fill the rest. */
export const SHAPE: Shape = (() => {
  const R = SIZE / 2 - SIZE * 0.15;
  const r0 = R * 0.32;
  return { cx: SIZE / 2, cy: SIZE / 2, R, r0, L: R - r0 };
})();

/**
 * Distance along a boundary's radial line at which a wedge reaches height h, measured to its corners, so a petal of
 * full height ends on the flower's circle however few petals share it (flowers of fewer than 10 wallets looked
 * broken: measured along the side's normal, a corner reached r0 + h / cos(half the
 * wedge), twice as far with three petals, far past the circle).
 */
const reachAt = (ring: Ring, i: number, h: number): number =>
  SHAPE.r0 + h - ((ring.gut[i] as number) * (ring.sw[i] as number)) / (ring.cw[i] as number);

/** The width of a wedge at height h, before any flare. */
export function widthBefore(ring: Ring, i: number, h: number): number {
  return (
    2 * reachAt(ring, i, h) * (ring.sw[i] as number) -
    2 * (ring.gut[i] as number) * (ring.cw[i] as number)
  );
}

/** How far the flare has pushed each side out, at height h: nothing at the base, the most at the
 * tip, and in a straight line between, so a flared wedge is still a wedge. */
function pushAt(ring: Ring, i: number, h: number): number {
  const f = ring.flare[i] as number;
  if (f <= 0) return 0;
  const top = ring.h[i] as number;
  return (f * widthBefore(ring, i, top) * h) / (2 * (top || 1));
}

/** The width of a wedge at height h, as drawn. */
export const widthAt = (ring: Ring, i: number, h: number): number =>
  widthBefore(ring, i, h) + 2 * pushAt(ring, i, h);

/** The wedge's first side at height h: a line parallel to the boundary, half a line in from it. */
export function leftAt(ring: Ring, i: number, h: number): [number, number] {
  const rho = reachAt(ring, i, h);
  const g = ring.gut[i] as number;
  const ux = ring.ux[i] as number;
  const uy = ring.uy[i] as number;
  const push = pushAt(ring, i, h);
  // the chord's direction is the normal turned a quarter clockwise
  return [
    SHAPE.cx + rho * ux - g * uy + push * (ring.ny[i] as number),
    SHAPE.cy + rho * uy + g * ux - push * (ring.nx[i] as number),
  ];
}

/** The wedge's other side at height h. */
export function rightAt(ring: Ring, i: number, h: number): [number, number] {
  const rho = reachAt(ring, i, h);
  const g = ring.gut[i] as number;
  const ux = ring.vx[i] as number;
  const uy = ring.vy[i] as number;
  const push = pushAt(ring, i, h);
  return [
    SHAPE.cx + rho * ux + g * uy - push * (ring.ny[i] as number),
    SHAPE.cy + rho * uy - g * ux + push * (ring.nx[i] as number),
  ];
}

/**
 * A flower of fewer petals than this keeps each as wide as in a flower of this many, its petals evenly round the
 * circle with open circle between, so a small group shows well: two people are two petals, not two half discs.
 */
export const FEW = 5;

/** Lays the ring out from widths (any scale, they share the circle) and heights (world units). */
/**
 * One wedge, put where it's told: from angle `a`, `w` wide (radians, before `rotation`), `height` tall. What `lay`
 * does for each petal in turn, and what a flower gliding from one reading to the next does for each petal at its
 * own angle, width and height (as layers from different people make a map fuller, the map is drawn from the
 * layers on, petals moving, no jump).
 */
export function placeAt(
  ring: Ring,
  i: number,
  a: number,
  w: number,
  rotation: number,
  height: number,
) {
  const { cx, cy, r0 } = SHAPE;
  const { start, end, ux, uy, vx, vy, cw, sw, gut, ax, ay, bx, by, nx, ny, len, h } = ring;
  start[i] = a;
  const a1 = a + w;
  const sin0 = Math.sin(a + rotation);
  const cos0 = Math.cos(a + rotation);
  const sin1 = Math.sin(a1 + rotation);
  const cos1 = Math.cos(a1 + rotation);
  end[i] = a1;
  vx[i] = sin1;
  vy[i] = -cos1;
  const mid = a + w / 2 + rotation;
  ux[i] = sin0;
  uy[i] = -cos0;
  const half = w / 2;
  const c = Math.cos(half);
  const s = Math.sin(half);
  cw[i] = c;
  sw[i] = s;
  const x0 = cx + r0 * sin0;
  const y0 = cy - r0 * cos0;
  const x1 = cx + r0 * sin1;
  const y1 = cy - r0 * cos1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.sqrt(dx * dx + dy * dy);
  // the line between wedges, capped at 22% of the side, as layout() caps its gap
  const g = Math.min(GUTTER, l * 0.22) / 2;
  gut[i] = g;
  // where a side half a line in from the boundary meets the polygon's side: g / c along it
  const along = g / c / (l || 1);
  ax[i] = x0 + dx * along;
  ay[i] = y0 + dy * along;
  bx[i] = x1 - dx * along;
  by[i] = y1 - dy * along;
  nx[i] = Math.sin(mid);
  ny[i] = -Math.cos(mid);
  len[i] = l;
  h[i] = height;
}

/** Closes a ring laid petal by petal: where the last side ends, and the first boundary again. */
export function closeRing(ring: Ring) {
  const { n, start, end, ux, uy } = ring;
  start[n] = n > 0 && n < FEW ? (start[0] as number) + TAU : n > 0 ? (end[n - 1] as number) : 0;
  ux[n] = ux[0] as number;
  uy[n] = uy[0] as number;
}

export function lay(ring: Ring, widths: Float64Array, heights: Float64Array, rotation: number) {
  const { n } = ring;
  let total = 0;
  for (let i = 0; i < n; i++) total += widths[i] as number;
  // few: each petal as wide as in a flower of FEW, at most its own slot of the circle, the slots evenly round
  const few = n > 0 && n < FEW;
  const slot = TAU / (n || 1);
  const scale = few ? TAU / FEW / (total / n || 1) : TAU / (total || 1);
  ring.rotation = rotation;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const w = few
      ? Math.min(slot * 0.9, (widths[i] as number) * scale)
      : (widths[i] as number) * scale;
    // few: each petal in the middle of its slot, the first at twelve
    if (few) a = i * slot - w / 2;
    placeAt(ring, i, a, w, rotation, heights[i] as number);
    a += w;
  }
  closeRing(ring);
}

/** Numbers for a path: three decimals, because the world is seen at up to 48x. */
export const n3 = (x: number): string => `${Math.round(x * 1000) / 1000}`;

const at = (p: [number, number]): string => `${n3(p[0])} ${n3(p[1])}`;

/** A stretch of a wedge between heights hA and hB, cut straight across at both: four corners. */
export function bandPath(ring: Ring, i: number, hA: number, hB: number): string {
  return `M${at(leftAt(ring, i, hB))}L${at(rightAt(ring, i, hB))}L${at(rightAt(ring, i, hA))}L${at(leftAt(ring, i, hA))}Z`;
}

/**
 * A whole wedge with its top following the circle (the top of a petal rounded to its arc): its straight sides
 * and fine gap as bandPath's, its end an arc round the
 * flower's centre through both tip corners, so it matches the arcs above it. For /lab first.
 */
export function roundTopPath(ring: Ring, i: number, h: number): string {
  const tl = leftAt(ring, i, h);
  const tr = rightAt(ring, i, h);
  const r = Math.hypot(tl[0] - SHAPE.cx, tl[1] - SHAPE.cy);
  return `M${at(tl)}A${n3(r)} ${n3(r)} 0 0 1 ${at(tr)}L${at(rightAt(ring, i, 0))}L${at(leftAt(ring, i, 0))}Z`;
}

/** The polygon, closed: both ends of each side, so at any zoom its line runs along the wedges' feet. */
export function polygonPath(ring: Ring): string {
  // a flower of few: the circle the petals' feet stand on, touching each foot at its middle; a flower with no petals
  // is that circle alone (a path of just 'Z' is invalid SVG)
  if (ring.n < FEW) {
    let rho = SHAPE.r0;
    for (let i = 0; i < ring.n; i++) rho = Math.min(rho, SHAPE.r0 * (ring.cw[i] as number));
    const { cx, cy } = SHAPE;
    return `M${n3(cx - rho)} ${n3(cy)}A${n3(rho)} ${n3(rho)} 0 1 1 ${n3(cx + rho)} ${n3(cy)}A${n3(rho)} ${n3(rho)} 0 1 1 ${n3(cx - rho)} ${n3(cy)}Z`;
  }
  // round the circle: laid, the petals already are; gliding to a new order, they're visited by angle, so
  // the line never cuts across the middle
  const order = Array.from({ length: ring.n }, (_, i) => i);
  const angle = (i: number) => (((ring.start[i] as number) % TAU) + TAU) % TAU;
  for (let i = 1; i < ring.n; i++) {
    if (angle(order[i] as number) < angle(order[i - 1] as number)) {
      order.sort((x, y) => angle(x) - angle(y));
      break;
    }
  }
  let d = '';
  order.forEach((i, at) => {
    d += `${at ? 'L' : 'M'}${n3(ring.ax[i] as number)} ${n3(ring.ay[i] as number)}`;
    d += `L${n3(ring.bx[i] as number)} ${n3(ring.by[i] as number)}`;
  });
  return `${d}Z`;
}

/** All the wedges as one path: the silhouette. */
export function silhouettePath(ring: Ring): string {
  let d = '';
  for (let i = 0; i < ring.n; i++) d += bandPath(ring, i, 0, ring.h[i] as number);
  return d;
}

/** A point in a wedge: `t` of the way across it, at height h. */
export function pointIn(ring: Ring, i: number, t: number, h: number): [number, number] {
  const a = leftAt(ring, i, h);
  const b = rightAt(ring, i, h);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Is a world point (with the ring's slide already taken off) on a wedge as it's drawn? */
export function insideWedge(ring: Ring, i: number, x: number, y: number): boolean {
  const nx = ring.nx[i] as number;
  const ny = ring.ny[i] as number;
  const mx = ((ring.ax[i] as number) + (ring.bx[i] as number)) / 2;
  const my = ((ring.ay[i] as number) + (ring.by[i] as number)) / 2;
  const up = (x - mx) * nx + (y - my) * ny;
  if (up < 0 || up > (ring.h[i] as number)) return false;
  const across = (x - mx) * -ny + (y - my) * nx;
  return Math.abs(across) <= widthAt(ring, i, up) / 2;
}

/** What a petal needs from the reading to be a shape. */
export type PetalShape = Pick<ReadingPetal, 'width' | 'height'>;

export interface Rest {
  /** The ring with nothing swollen. Never written to after this. */
  ring: Ring;
  width: Float64Array;
  /** Heights exactly as the reading gives them, in world units. */
  height: Float64Array;
  /** Middle of each side, in radians, at rest. */
  mid: Float64Array;
}

export function restOf(petals: PetalShape[]): Rest {
  const n = petals.length;
  const width = Float64Array.from(petals, (p) => p.width);
  const height = Float64Array.from(petals, (p) => p.height * SHAPE.L);
  const ring = newRing(n);
  lay(ring, width, height, 0);
  const mid = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    mid[i] = ((ring.start[i] as number) + (ring.end[i] as number)) / 2;
  }
  return { ring, width, height, mid };
}
