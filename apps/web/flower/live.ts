// The flower's state from frame to frame, with no DOM: springs in, a laid-out ring out. The hook feeds
// it the pointer and the clock; marks.ts and scene.ts read what it holds. Time comes in as dt, so a
// test can run it at 60 and at 120 Hz without a browser.
import { type Camera, newCamera, stepCamera, type View } from './camera.ts';
import { DETAIL, fade, openAt } from './detail.ts';
import {
  ACCENT_FADE,
  ACCENT_RISE,
  BANDS,
  CLICK_LIT,
  HEIGHT,
  LOCK_AT,
  NOTE,
  NOTE_HOLD,
  OFFSET,
  OPEN,
  OPEN_WIDTH,
  PRESENCE,
  ROTATION,
  WIDTH,
} from './feel.ts';
import { type HoverWay, heightOf, hoverTargets, reachOf } from './hover.ts';
import { bandUnder, type Model, type Picked, pick } from './model.ts';
import { FEW, insideWedge, lay, newRing, pointIn, type Ring } from './ring.ts';
import {
  advance,
  advanceAll,
  advanceBothWays,
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
  /** Extra width on the circle, 0 at rest. Only lift uses it. */
  width: Channel;
  /** Extra width at the tip, over the neighbours, 0 at rest. Only dock uses it. */
  flare: Channel;
  /** The height's spring, 0 at rest, below zero folded or stepping back. See heightOf. */
  height: Channel;
  /** How far each petal has opened as an account. */
  open: Channel;
  /** How lit each petal is. */
  accent: Channel;
  /** How much of each petal's bands show. */
  named: Channel;
  rotation: Spring;
  ox: Spring;
  oy: Spring;
  /** The travelling note orbits the flower to its petal's tip, by angle and radius, so on a long
   * jump it runs round the rim and never across the middle. Its side, and whether it's there. */
  noteAngle: Spring;
  noteRadius: Spring;
  noteSide: Spring;
  presence: Spring;
  /** The petal under the pointer; it stays until another one is pointed at. */
  focusIndex: number;
  /** The petal a click chose, or -1: it keeps its accent whatever the pointer does. */
  chosen: number;
  /** The petal the note names: the focus, but not faster than one name every NOTE_HOLD. */
  noteIndex: number;
  noteHold: number;
  /** Which of the focus's bands the pointer is on, or -1. */
  band: number;
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
  target: { width: Float64Array; height: Float64Array; flare: Float64Array };
  reach: (r: number) => number;
}

export function newLive(
  m: Model,
  way: HoverWay,
  width: number,
  height: number,
  calm: boolean,
  /** The opening bloom. A flower that takes over from its own silhouette, as on the map, starts open. */
  bloom = true,
): Live {
  const n = m.n;
  const folded = !calm && bloom;
  const live: Live = {
    m,
    way,
    camera: newCamera(width, height),
    pointer: { x: 0, y: 0, inside: false, dragging: false },
    ring: newRing(n),
    width: channel(n),
    flare: channel(n),
    // Every petal starts folded down onto the polygon, and blooms; calm skips it.
    height: channel(n, folded ? -1 : 0),
    open: channel(n),
    accent: channel(n),
    named: channel(n),
    rotation: spring(),
    ox: spring(),
    oy: spring(),
    noteAngle: spring(0),
    noteRadius: spring(m.R),
    noteSide: spring(1),
    presence: spring(),
    focusIndex: 0,
    chosen: -1,
    noteIndex: 0,
    noteHold: 0,
    band: -1,
    angle: 0,
    along: 0.5,
    up: 0,
    anchorX: 0,
    anchorY: 0,
    locked: false,
    calm,
    age: folded ? 0 : BLOOM,
    widths: new Float64Array(m.width),
    heights: new Float64Array(m.height),
    target: {
      width: new Float64Array(n),
      height: new Float64Array(n),
      flare: new Float64Array(n),
    },
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
  /** Which bands show, or which one is pointed at, changed. */
  bandsMoved: boolean;
}

/** Where the note's text goes for this petal: the side its rest normal points to. */
const sideOf = (m: Model, i: number): number => ((m.ring.nx[i] as number) >= -0.02 ? 1 : -1);

/** Hit-testing follows the shape: on its own wider tip, over a neighbour's angle, the focus stays. */
const focusStays = (l: Live, under: Picked, index: number, px: number, py: number): boolean =>
  under.index !== index &&
  l.presence.t > 0 &&
  insideWedge(l.ring, index, px - l.ring.ox, py - l.ring.oy);

/** What a click lands on. Every angle belongs to someone, so "ground" is only where hover lights no one. */
export type Clicked = { kind: 'petal'; index: number } | { kind: 'centre' } | { kind: 'ground' };

/**
 * figure.pick: a click takes what hover has lit at that point, with the same pick and the same rule.
 * Where nothing is lit it's the flower's centre or the ground. A flower too small to answer the pointer
 * has no petals to tell apart, so all of it counts as its centre.
 */
export function clickedAt(l: Live, x: number, y: number): Clicked {
  const { m, camera: cam } = l;
  if (l.locked) return { kind: 'petal', index: l.focusIndex };
  const px = (x - cam.x) / cam.k;
  const py = (y - cam.y) / cam.k;
  const answers = fade(DETAIL.hover, m.R * cam.k);
  const under = pick(m, px, py, l.reach);
  if (under && under.reach * answers >= CLICK_LIT) {
    const stays = focusStays(l, under, l.focusIndex, px, py);
    return { kind: 'petal', index: stays ? l.focusIndex : under.index };
  }
  const centre = answers >= CLICK_LIT ? m.r0 : m.R;
  return Math.hypot(px - m.cx, py - m.cy) < centre ? { kind: 'centre' } : { kind: 'ground' };
}

/**
 * One frame of the whole flower. With a view, the flower is one of many in a space whose camera is
 * somebody else's (the map): it takes that view as it is and doesn't move its own camera.
 */
export function stepLive(l: Live, dt: number, view?: View): Stepped {
  const { m, camera: cam, pointer, ring } = l;
  const moved = view ? takeView(cam, view) : stepCamera(cam, dt, l.calm);
  const { k } = cam;
  l.age += dt;

  // What the pointer is over, by wedge, at rest: angles only move if an account opens or in lift, and
  // the fixed point below keeps the wedge at the pointer's angle under the pointer even then.
  const px = (pointer.x - cam.x) / k;
  const py = (pointer.y - cam.y) / k;
  const picked = pointer.inside ? pick(m, px, py, l.reach) : null;

  let index = l.focusIndex;
  let reach = 0;
  if (l.locked) {
    reach = 1;
    if (openAt(m.ring.len[index] as number, k) < LOCK_AT - 0.1) l.locked = false;
  }
  if (!l.locked && picked && !pointer.dragging) {
    reach = picked.reach;
    if (!focusStays(l, picked, index, px, py)) {
      index = picked.index;
      l.focusIndex = index;
      l.angle = picked.angle;
      l.along = picked.along;
      l.up = picked.up;
      l.anchorX = px;
      l.anchorY = py;
      if (openAt(m.ring.len[index] as number, k) >= LOCK_AT) l.locked = true;
    }
  } else if (!l.locked && pointer.dragging && l.presence.t > 0) {
    reach = l.presence.t;
  }

  // One name at a time, not one per petal the pointer crosses. No queue: the latest one wins.
  l.noteHold = Math.max(0, l.noteHold - dt);
  if (index !== l.noteIndex && (l.noteHold <= 0 || l.locked || l.calm)) {
    l.noteIndex = index;
    l.noteHold = NOTE_HOLD;
    l.noteSide.t = sideOf(m, index);
  }

  // Targets.
  const focus = reach > 0 ? { index, reach } : null;
  const opening = focus && (l.locked || picked) ? openAt(m.ring.len[index] as number, k) : 0;
  hoverTargets(l.way, m, focus, k, l.target);
  l.width.t.set(l.target.width);
  l.flare.t.set(l.target.flare);
  // An account opening takes over from the flare.
  if (focus) l.flare.t[index] = (l.flare.t[index] as number) * (1 - opening);
  if (l.age < BLOOM) {
    // The bloom: each petal gets its target when the sweep reaches it.
    for (let i = 0; i < m.n; i++) {
      l.height.t[i] = l.age < (BLOOM * i) / m.n ? -1 : (l.target.height[i] as number);
    }
  } else l.height.t.set(l.target.height);
  l.open.t.fill(0);
  l.accent.t.fill(0);
  l.named.t.fill(0);
  if (focus) {
    l.open.t[index] = opening;
    l.accent.t[index] = reach;
    l.named.t[index] = reach;
  }
  // figure.petal-picked
  if (l.chosen >= 0) l.accent.t[l.chosen] = 1;
  l.presence.t = reach;

  // Springs.
  const snap = l.calm;
  const movedWidth = advanceAll(l.width, snap ? SNAP : stepOf(WIDTH, dt));
  const movedFlare = advanceAll(l.flare, snap ? SNAP : stepOf(WIDTH, dt));
  const movedHeight = advanceAll(l.height, snap ? SNAP : stepOf(HEIGHT, dt));
  const movedOpen = advanceAll(l.open, snap ? SNAP : stepOf(OPEN, dt));
  const accentMoved = advanceBothWays(
    l.accent,
    snap ? SNAP : stepOf(ACCENT_RISE, dt),
    snap ? SNAP : stepOf(ACCENT_FADE, dt),
  );
  const movedNamed = advanceAll(l.named, snap ? SNAP : stepOf(BANDS, dt));

  // The petals' shapes.
  const { width, height } = m;
  let total = 0;
  let before = 0;
  const atIndex = locatePetal(m, l.angle);
  for (let i = 0; i < m.n; i++) {
    const swell = Math.max(l.width.x[i] as number, (OPEN_WIDTH - 1) * (l.open.x[i] as number));
    const w = (width[i] as number) * (1 + Math.max(-0.5, swell));
    l.widths[i] = w;
    l.heights[i] = heightOf(l.way, height[i] as number, m.L, l.height.x[i] as number);
    if (i < atIndex) before += w;
    total += w;
  }

  // The fixed point: whatever's at the pointer's angle at rest is drawn at the pointer's angle now.
  const restAt = alongOf(m, l.angle, atIndex);
  // a flower of few lays its petals in even slots (ring.ts lay): where that point is in them, as lay will put it
  const few = m.n > 0 && m.n < FEW;
  const slot = TAU / (m.n || 1);
  const fewW = few
    ? Math.min(slot * 0.9, ((l.widths[atIndex] as number) * TAU) / FEW / (total / m.n || 1))
    : 0;
  const swollenAngle = few
    ? atIndex * slot - fewW / 2 + restAt * fewW
    : ((before + restAt * (l.widths[atIndex] as number)) / (total || 1)) * TAU;
  l.rotation.t = l.angle - swollenAngle;
  const rotationMoved = advance(l.rotation, snap ? SNAP : stepOf(ROTATION, dt));

  const ringMoved =
    movedWidth || movedFlare || movedHeight || movedOpen || rotationMoved || l.age <= BLOOM + dt;
  if (ringMoved) {
    lay(ring, l.widths, l.heights, l.rotation.x);
    for (let i = 0; i < m.n; i++) ring.flare[i] = Math.max(0, l.flare.x[i] as number);
  }

  // Keep the anchor where it is as the petal opens: the whole ring slides.
  const opened = l.open.x[index] as number;
  let wantX = 0;
  let wantY = 0;
  if (opened > 0) {
    const up = (l.up * (l.heights[index] as number)) / ((height[index] as number) || 1);
    const point = pointIn(ring, index, l.along, up);
    wantX = (l.anchorX - point[0]) * opened;
    wantY = (l.anchorY - point[1]) * opened;
  }
  l.ox.t = wantX;
  l.oy.t = wantY;
  const movedOx = advance(l.ox, snap ? SNAP : stepOf(OFFSET, dt));
  const movedOy = advance(l.oy, snap ? SNAP : stepOf(OFFSET, dt));
  ring.ox = l.ox.x;
  ring.oy = l.oy.x;

  // The band under the pointer, by how far up the focus it is.
  const drawn = ring.h[index] as number;
  const across =
    (px - ring.ox - ((ring.ax[index] as number) + (ring.bx[index] as number)) / 2) *
      (ring.nx[index] as number) +
    (py - ring.oy - ((ring.ay[index] as number) + (ring.by[index] as number)) / 2) *
      (ring.ny[index] as number);
  const band = focus ? bandUnder(m.petals[index]?.segments ?? [], across / (drawn || 1)) : -1;
  const bandChanged = band !== l.band;
  l.band = band;

  // The travelling note goes to its petal's tip, the short way round.
  const tip = tipOf(ring, l.noteIndex);
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
    l.noteSide.x = l.noteSide.t;
    l.noteSide.v = 0;
  }
  const noteStep = snap ? SNAP : stepOf(NOTE, dt);
  const movedAngle = advance(l.noteAngle, noteStep);
  const movedRadius = advance(l.noteRadius, noteStep);
  const movedSide = advance(l.noteSide, noteStep);
  const movedPresence = advance(l.presence, snap ? SNAP : stepOf(PRESENCE, dt));

  return {
    moving:
      moved ||
      ringMoved ||
      accentMoved ||
      movedNamed ||
      movedOx ||
      movedOy ||
      movedAngle ||
      movedRadius ||
      movedSide ||
      movedPresence ||
      index !== l.noteIndex,
    ringMoved,
    accentMoved,
    bandsMoved: movedNamed || bandChanged,
  };
}

const TAU = Math.PI * 2;

function locatePetal(m: Model, angle: number): number {
  // a flower of few: its petals stand in even slots round the circle, the first at twelve: the nearest slot's
  if (m.n > 0 && m.n < FEW) {
    const a = ((angle % TAU) + TAU) % TAU;
    return Math.round(a / (TAU / m.n)) % m.n;
  }
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
  const s1 = m.ring.end[at] as number;
  return (angle - s0) / (s1 - s0 || 1);
}

/** The world point the note has got to. */
export function noteAt(l: Live): { x: number; y: number } {
  const a = l.noteAngle.x;
  const r = l.noteRadius.x;
  return { x: l.m.cx + r * Math.sin(a), y: l.m.cy - r * Math.cos(a) };
}

/** The tip of a petal, at the middle of its end. */
export function tipOf(ring: Ring, i: number): { x: number; y: number } {
  const h = ring.h[i] as number;
  return {
    x: ((ring.ax[i] as number) + (ring.bx[i] as number)) / 2 + (ring.nx[i] as number) * h,
    y: ((ring.ay[i] as number) + (ring.by[i] as number)) / 2 + (ring.ny[i] as number) * h,
  };
}

/** Puts a view from outside on the flower's camera. True if it changed. */
function takeView(cam: Camera, v: View): boolean {
  const changed = cam.k !== v.k || cam.x !== v.x || cam.y !== v.y;
  cam.k = v.k;
  cam.x = v.x;
  cam.y = v.y;
  cam.width = v.width;
  cam.height = v.height;
  return changed;
}
