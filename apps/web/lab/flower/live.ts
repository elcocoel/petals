// The flower's state from frame to frame, with no DOM: springs in, a laid-out ring out. The hook feeds
// it the pointer and the clock; marks.ts and scene.ts read what it holds. Time comes in as dt, so a
// test can run it at 60 and at 120 Hz without a browser.
import { type Camera, newCamera, stepCamera } from './camera.ts';
import { openAt } from './detail.ts';
import {
  ACCENT_FADE,
  HEIGHT,
  LOCK_AT,
  NOTE,
  OFFSET,
  OPEN,
  OPEN_WIDTH,
  PRESENCE,
  ROTATION,
  WIDTH,
} from './feel.ts';
import { type HoverWay, heightOf, hoverTargets, reachOf } from './hover.ts';
import { type Model, pick } from './model.ts';
import { lay, newRing, type Ring } from './ring.ts';
import {
  advance,
  advanceAll,
  type Channel,
  channel,
  SNAP,
  type Spring,
  spring,
  stepOf,
} from './spring.ts';

/** How long the opening bloom takes to sweep round, in seconds. */
const BLOOM = 0.42;

export interface Pointer {
  x: number;
  y: number;
  inside: boolean;
  dragging: boolean;
}

export interface Live {
  m: Model;
  way: HoverWay;
  camera: Camera;
  pointer: Pointer;
  ring: Ring;
  /** Extra width, 0 at rest. */
  width: Channel;
  /** Swell of the height, 0 at rest, below zero stepping back. */
  height: Channel;
  /** How far each petal has opened as an account. */
  open: Channel;
  /** How lit each petal is. */
  accent: Channel;
  rotation: Spring;
  ox: Spring;
  oy: Spring;
  /** The travelling note orbits the flower to its petal's tip, by angle and radius, so on a long
   * jump it runs round the rim and never across the middle. Its side, and whether it's there. */
  noteAngle: Spring;
  noteRadius: Spring;
  noteSide: Spring;
  presence: Spring;
  /** The petal the note is about; it stays until another one is pointed at. */
  focusIndex: number;
  /** The pointer's place in the rest flower: it stays when the pointer leaves, so the ring settles. */
  angle: number;
  along: number;
  up: number;
  /** The world point that stays under the pointer as a petal opens. */
  anchorX: number;
  anchorY: number;
  locked: boolean;
  calm: boolean;
  age: number;
  widths: Float64Array;
  heights: Float64Array;
  targetWidth: Float64Array;
  targetHeight: Float64Array;
  reach: (r: number) => number;
}

export function newLive(
  m: Model,
  way: HoverWay,
  width: number,
  height: number,
  calm: boolean,
): Live {
  const n = m.n;
  const camera = newCamera(width, height);
  const live: Live = {
    m,
    way,
    camera,
    pointer: { x: 0, y: 0, inside: false, dragging: false },
    ring: newRing(n),
    width: channel(n),
    // Every petal starts folded down onto the polygon, and blooms; calm skips it.
    height: channel(n, calm ? 0 : -1),
    open: channel(n),
    accent: channel(n),
    rotation: spring(),
    ox: spring(),
    oy: spring(),
    noteAngle: spring(0),
    noteRadius: spring(m.R),
    noteSide: spring(1),
    presence: spring(),
    focusIndex: 0,
    angle: 0,
    along: 0.5,
    up: 0,
    anchorX: 0,
    anchorY: 0,
    locked: false,
    calm,
    age: calm ? BLOOM : 0,
    widths: new Float64Array(m.width),
    heights: new Float64Array(m.height),
    targetWidth: new Float64Array(n),
    targetHeight: new Float64Array(n),
    reach: reachOf(m),
  };
  lay(live.ring, live.widths, live.heights, 0);
  return live;
}

export interface Stepped {
  /** Something still moves: ask for another frame. */
  moving: boolean;
  /** The petals changed shape: their paths need writing. */
  ringMoved: boolean;
  accentMoved: boolean;
}

/** Where the note's text goes for this petal: the side its rest normal points to. */
const sideOf = (m: Model, i: number): number => ((m.ring.nx[i] as number) >= -0.02 ? 1 : -1);

/** One frame of the whole flower. */
export function stepLive(l: Live, dt: number): Stepped {
  const { m, camera: cam, pointer, ring } = l;
  const moved = stepCamera(cam, dt, l.calm);
  const { k } = cam;
  l.age += dt;

  // What the pointer is over. Pure, against the flower at rest: the fixed point below makes that the
  // same as what's drawn under it, so hit-testing never feeds back on the swell.
  const px = (pointer.x - cam.x) / k;
  const py = (pointer.y - cam.y) / k;
  const picked = pointer.inside ? pick(m, px, py, l.reach) : null;

  let index = l.focusIndex;
  let reach = 0;
  if (l.locked) {
    index = l.focusIndex;
    reach = 1;
    if (openAt(m.ring.len[index] as number, k) < LOCK_AT - 0.1) l.locked = false;
  }
  if (!l.locked && picked && !pointer.dragging) {
    index = picked.index;
    reach = picked.reach;
    l.focusIndex = index;
    l.angle = picked.angle;
    l.along = picked.along;
    l.up = picked.up;
    l.anchorX = px;
    l.anchorY = py;
    l.noteSide.t = sideOf(m, index);
    if (openAt(m.ring.len[index] as number, k) >= LOCK_AT) l.locked = true;
  } else if (!l.locked && pointer.dragging && l.presence.t > 0) {
    reach = l.presence.t;
  }

  // Targets.
  const focus = reach > 0 ? { index, angle: l.angle, reach } : null;
  hoverTargets(l.way, m, focus, k, l.targetWidth, l.targetHeight);
  l.width.t.set(l.targetWidth);
  if (l.age < BLOOM) {
    // The bloom: each petal gets its target when the sweep reaches it.
    for (let i = 0; i < m.n; i++) {
      l.height.t[i] = l.age < (BLOOM * i) / m.n ? -1 : (l.targetHeight[i] as number);
    }
  } else l.height.t.set(l.targetHeight);
  l.open.t.fill(0);
  l.accent.t.fill(0);
  if (focus) {
    l.open.t[index] = l.locked || picked ? openAt(m.ring.len[index] as number, k) : 0;
    l.accent.t[index] = reach;
    // The pointer leads: lit on the very frame it arrives.
    if ((l.accent.x[index] as number) < reach) {
      l.accent.x[index] = reach;
      l.accent.v[index] = 0;
    }
  }
  l.presence.t = reach;

  // Springs.
  const snap = l.calm;
  const a = advanceAll(l.width, snap ? SNAP : stepOf(WIDTH, dt));
  const b = advanceAll(l.height, snap ? SNAP : stepOf(HEIGHT, dt));
  const c = advanceAll(l.open, snap ? SNAP : stepOf(OPEN, dt));
  const accentMoved = advanceAll(l.accent, snap ? SNAP : stepOf(ACCENT_FADE, dt));

  // The petals' shapes.
  const { width, height } = m;
  let total = 0;
  let before = 0;
  const atIndex = locatePetal(m, l.angle);
  for (let i = 0; i < m.n; i++) {
    const swell = Math.max(l.width.x[i] as number, (OPEN_WIDTH - 1) * (l.open.x[i] as number));
    const w = (width[i] as number) * (1 + Math.max(-0.5, swell));
    l.widths[i] = w;
    l.heights[i] = heightOf(height[i] as number, m.L, l.height.x[i] as number);
    if (i < atIndex) before += w;
    total += w;
  }

  // The fixed point: whatever's at the pointer's angle at rest is drawn at the pointer's angle now.
  const restAt = alongOf(m, l.angle, atIndex);
  const swollenAngle = ((before + restAt * (l.widths[atIndex] as number)) / (total || 1)) * TAU;
  l.rotation.t = l.angle - swollenAngle;
  const rotationMoved = advance(l.rotation, snap ? SNAP : stepOf(ROTATION, dt));

  const ringMoved = a || b || c || rotationMoved || l.age <= BLOOM + dt;
  if (ringMoved) lay(ring, l.widths, l.heights, l.rotation.x);

  // Keep the anchor where it is as the petal opens: straight chords shift, so the whole ring slides.
  const opened = l.open.x[index] as number;
  let wantX = 0;
  let wantY = 0;
  if (opened > 0) {
    const t = l.along;
    const up = (l.up * (l.heights[index] as number)) / ((height[index] as number) || 1);
    const nx = ring.nx[index] as number;
    const ny = ring.ny[index] as number;
    const x = (ring.ax[index] as number) * (1 - t) + (ring.bx[index] as number) * t + nx * up;
    const y = (ring.ay[index] as number) * (1 - t) + (ring.by[index] as number) * t + ny * up;
    wantX = (l.anchorX - x) * opened;
    wantY = (l.anchorY - y) * opened;
  }
  l.ox.t = wantX;
  l.oy.t = wantY;
  const d = advance(l.ox, snap ? SNAP : stepOf(OFFSET, dt));
  const e = advance(l.oy, snap ? SNAP : stepOf(OFFSET, dt));
  ring.ox = l.ox.x;
  ring.oy = l.oy.x;

  // The travelling note goes to its petal's tip, the short way round.
  const tip = tipOf(ring, index);
  const dx = tip.x - m.cx;
  const dy = tip.y - m.cy;
  const toward = Math.atan2(dx, -dy);
  const turns = Math.round((l.noteAngle.x - toward) / TAU);
  l.noteAngle.t = toward + turns * TAU;
  l.noteRadius.t = Math.sqrt(dx * dx + dy * dy);
  // Arriving out of nowhere, it starts where it's going.
  if (l.presence.x === 0 && reach > 0) {
    l.noteAngle.x = l.noteAngle.t;
    l.noteAngle.v = 0;
    l.noteRadius.x = l.noteRadius.t;
    l.noteRadius.v = 0;
  }
  const noteStep = snap ? SNAP : stepOf(NOTE, dt);
  const f = advance(l.noteAngle, noteStep);
  const g = advance(l.noteRadius, noteStep);
  const h = advance(l.noteSide, noteStep);
  const j = advance(l.presence, snap ? SNAP : stepOf(PRESENCE, dt));

  return {
    moving:
      moved ||
      a ||
      b ||
      c ||
      accentMoved ||
      rotationMoved ||
      d ||
      e ||
      f ||
      g ||
      h ||
      j ||
      l.age <= BLOOM + dt,
    ringMoved,
    accentMoved,
  };
}

const TAU = Math.PI * 2;

function locatePetal(m: Model, angle: number): number {
  const { start } = m.ring;
  let lo = 0;
  let hi = m.n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((start[mid] as number) <= angle) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function alongOf(m: Model, angle: number, at: number): number {
  const s0 = m.ring.start[at] as number;
  const s1 = m.ring.start[at + 1] as number;
  return (angle - s0) / (s1 - s0 || 1);
}

/** The world point the note has got to. */
export function noteAt(l: Live): { x: number; y: number } {
  const a = l.noteAngle.x;
  const r = l.noteRadius.x;
  return { x: l.m.cx + r * Math.sin(a), y: l.m.cy - r * Math.cos(a) };
}

/** The tip of a petal's bar, at the middle of its top edge. */
export function tipOf(ring: Ring, i: number): { x: number; y: number } {
  const h = ring.h[i] as number;
  return {
    x: ((ring.ax[i] as number) + (ring.bx[i] as number)) / 2 + (ring.nx[i] as number) * h,
    y: ((ring.ay[i] as number) + (ring.by[i] as number)) / 2 + (ring.ny[i] as number) * h,
  };
}
