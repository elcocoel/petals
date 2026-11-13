// The camera, with no DOM. Pinch and scroll zoom under the cursor, a drag pans, and everything that
// moves it on its own (a notch of a wheel, the way back, a bounce off a limit) is a spring, so a hand
// can take it over at any moment from where it is. The zoom's limits are soft: past them it gives way
// less and less, and comes back when let go. d3-zoom isn't used here because it snaps to its extent.

import type { View } from '@petal/core/wedge/view';
import {
  BOUNCE_BACK,
  FIT,
  FLY,
  NOTCH,
  PAN_DECAY,
  PINCH_GAIN,
  RELEASE_AFTER,
  SOFT_EDGE,
  WHEEL,
  WHEEL_GAIN,
  ZOOM_LIMITS,
} from './feel.ts';
import { SHAPE } from './ring.ts';
import { advance, SNAP, type Spring, type SpringSpec, spring, stepOf } from './spring.ts';

export type { View } from '@petal/core/wedge/view';

/** What the camera fits to and comes back to: a circle in world units. One flower, by default. */
export interface Home {
  cx: number;
  cy: number;
  r: number;
}

/** One flower: the space /make and the bench draw in. */
export const FLOWER_HOME: Home = { cx: SHAPE.cx, cy: SHAPE.cy, r: SHAPE.R };

/**
 * What covers the canvas's sides, in px: on /make, the conversation down its left. Its
 * home fits in what's left, so it isn't drawn under them.
 */
export interface Clear {
  left: number;
  right: number;
  /** Below the flower, on a phone, where the conversation stands under it. */
  top: number;
  bottom: number;
}

export const NO_CLEAR: Clear = { left: 0, right: 0, top: 0, bottom: 0 };

export interface Camera extends View {
  home: Home;
  /** The sides the home keeps clear of (Clear). */
  clear: Clear;
  /** The zoom's limits, as logs of the scale, before the soft edge. */
  lo: number;
  hi: number;
  /** The log of the scale, before the soft edge. */
  raw: Spring;
  spec: SpringSpec;
  mode: 'anchor' | 'free' | 'fly';
  /** Anchor: a screen point and the world point that stays under it. */
  ax: number;
  ay: number;
  wx: number;
  wy: number;
  /** Fly: the world point at the window's centre. */
  cx: Spring;
  cy: Spring;
  /** Free: a drag's leftover velocity, in px/s. */
  vx: number;
  vy: number;
  sinceInput: number;
  /** Has a person moved it? If not, a resize refits. */
  touched: boolean;
}

const LN_LO = Math.log(ZOOM_LIMITS[0]);
const LN_HI = Math.log(ZOOM_LIMITS[1]);
/** How far raw may run past a limit; enough for the soft edge to use up nearly all its give. */
const RAW_OVER = SOFT_EDGE * 6;

/** Past a limit, each step gives less than the last: never stops moving, never leaves the edge's reach. */
export function softLimit(raw: number, lo = LN_LO, hi = LN_HI, edge = SOFT_EDGE): number {
  if (raw > hi) return hi + edge * (1 - 1 / (1 + (raw - hi) / edge));
  if (raw < lo) return lo - edge * (1 - 1 / (1 + (lo - raw) / edge));
  return raw;
}

/**
 * The view that shows the whole home in the window, or in the part of it the sides leave clear: one flower
 * unless a home is given.
 */
export function fitView(
  width: number,
  height: number,
  home: Home = FLOWER_HOME,
  clear: Clear = NO_CLEAR,
): Omit<View, 'width' | 'height'> {
  const freeW = Math.max(1, width - clear.left - clear.right);
  const freeH = Math.max(1, height - clear.top - clear.bottom);
  const k = (Math.min(freeW, freeH) * FIT) / home.r;
  return {
    k,
    x: clear.left + freeW / 2 - home.cx * k,
    y: clear.top + freeH / 2 - home.cy * k,
  };
}

/** A camera on its home. The limits are scales, as in ZOOM_LIMITS, which is the default. */
export function newCamera(
  width: number,
  height: number,
  home: Home = FLOWER_HOME,
  limits: readonly [number, number] = ZOOM_LIMITS,
  clear: Clear = NO_CLEAR,
): Camera {
  const fit = fitView(width, height, home, clear);
  return {
    ...fit,
    width,
    height,
    home,
    clear,
    lo: Math.log(limits[0]),
    hi: Math.log(limits[1]),
    raw: spring(Math.log(fit.k)),
    spec: WHEEL,
    mode: 'free',
    ax: 0,
    ay: 0,
    wx: 0,
    wy: 0,
    cx: spring(home.cx),
    cy: spring(home.cy),
    vx: 0,
    vy: 0,
    sinceInput: 1,
    touched: false,
  };
}

export function resize(cam: Camera, width: number, height: number): void {
  if (cam.touched) {
    cam.x += (width - cam.width) / 2;
    cam.y += (height - cam.height) / 2;
    cam.width = width;
    cam.height = height;
    return;
  }
  cam.width = width;
  cam.height = height;
  const fit = fitView(width, height, cam.home, cam.clear);
  Object.assign(cam, fit);
  cam.raw = spring(Math.log(fit.k));
}

/** The sides change: a camera nobody has moved fits its home again, beside them; a moved one stays. */
export function clearSides(cam: Camera, clear: Clear): void {
  const { left, right, top, bottom } = cam.clear;
  if (
    left === clear.left &&
    right === clear.right &&
    top === clear.top &&
    bottom === clear.bottom
  ) {
    return;
  }
  cam.clear = clear;
  if (!cam.touched) resize(cam, cam.width, cam.height);
}

export interface WheelInput {
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
  /** Chrome reports a trackpad pinch as a wheel with ctrl. */
  ctrlKey: boolean;
  sx: number;
  sy: number;
}

/** One wheel event. A finger moves it at once, in full; a mouse's notch goes through a spring. */
export function zoomWheel(cam: Camera, e: WheelInput): void {
  const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
  const d = -pixels * (e.ctrlKey ? PINCH_GAIN : WHEEL_GAIN);
  // The hand takes over from wherever the camera is. A fly stops there; nothing jumps.
  if (cam.mode === 'fly') cam.raw.t = cam.raw.x;
  cam.mode = 'anchor';
  cam.spec = WHEEL;
  cam.ax = e.sx;
  cam.ay = e.sy;
  cam.wx = (e.sx - cam.x) / cam.k;
  cam.wy = (e.sy - cam.y) / cam.k;
  cam.vx = 0;
  cam.vy = 0;
  cam.sinceInput = 0;
  cam.touched = true;
  const direct = e.ctrlKey || Math.abs(pixels) < NOTCH;
  const t = Math.max(cam.lo - RAW_OVER, Math.min(cam.hi + RAW_OVER, cam.raw.t + d));
  if (direct) cam.raw.x += t - cam.raw.t;
  cam.raw.t = t;
}

export function panBy(cam: Camera, dx: number, dy: number): void {
  if (cam.mode === 'fly') {
    cam.raw.t = cam.raw.x;
    cam.raw.v = 0;
  }
  cam.mode = 'free';
  cam.x += dx;
  cam.y += dy;
  cam.vx = 0;
  cam.vy = 0;
  cam.sinceInput = 0;
  cam.touched = true;
}

export function letGo(cam: Camera, vx: number, vy: number): void {
  cam.vx = vx;
  cam.vy = vy;
}

/** The way back: a spring on the scale and on the world point at the window's centre. */
export function flyTo(cam: Camera, view: Omit<View, 'width' | 'height'>): void {
  cam.cx.x = (cam.width / 2 - cam.x) / cam.k;
  cam.cy.x = (cam.height / 2 - cam.y) / cam.k;
  cam.cx.v = 0;
  cam.cy.v = 0;
  cam.cx.t = (cam.width / 2 - view.x) / view.k;
  cam.cy.t = (cam.height / 2 - view.y) / view.k;
  cam.raw.t = Math.log(view.k);
  cam.spec = FLY;
  cam.mode = 'fly';
  cam.vx = 0;
  cam.vy = 0;
  cam.touched = false;
}

/** One frame. True while the camera is still moving. */
export function stepCamera(cam: Camera, dt: number, calm: boolean): boolean {
  cam.sinceInput += dt;
  if (cam.mode !== 'fly' && cam.sinceInput > RELEASE_AFTER) {
    const inside = Math.max(cam.lo, Math.min(cam.hi, cam.raw.t));
    if (inside !== cam.raw.t) {
      cam.raw.t = inside;
      cam.spec = BOUNCE_BACK;
    }
  }
  const step = calm ? SNAP : stepOf(cam.spec, dt);
  let moving = advance(cam.raw, step);
  const k = Math.exp(softLimit(cam.raw.x, cam.lo, cam.hi));
  if (cam.mode === 'anchor') {
    cam.k = k;
    cam.x = cam.ax - cam.wx * k;
    cam.y = cam.ay - cam.wy * k;
  } else if (cam.mode === 'fly') {
    const a = advance(cam.cx, step);
    const b = advance(cam.cy, step);
    moving = a || b || moving;
    cam.k = k;
    cam.x = cam.width / 2 - cam.cx.x * k;
    cam.y = cam.height / 2 - cam.cy.x * k;
  } else {
    cam.k = k;
    if (cam.vx !== 0 || cam.vy !== 0) {
      if (calm) {
        cam.vx = 0;
        cam.vy = 0;
      } else {
        cam.x += cam.vx * dt;
        cam.y += cam.vy * dt;
        const fall = Math.exp(-dt / PAN_DECAY);
        cam.vx *= fall;
        cam.vy *= fall;
        if (Math.hypot(cam.vx, cam.vy) < 4) {
          cam.vx = 0;
          cam.vy = 0;
        } else moving = true;
      }
    }
  }
  return moving || (cam.mode !== 'fly' && cam.sinceInput <= RELEASE_AFTER);
}
