// Every number that decides how it feels, in one place to tune. What shows at what distance is in
// detail.ts. All of these started as guesses; the report says which ones were tuned by eye.
import type { SpringSpec } from './spring.ts';

/** Hover is calm: slow, and hardly any bounce. */
export const HEIGHT: SpringSpec = { response: 0.58, damping: 0.9 };
export const WIDTH: SpringSpec = { response: 0.5, damping: 1 };
/** How a petal hands the crossing to another one, when the pointer moves on part-way. */
export const OPEN: SpringSpec = { response: 0.22, damping: 1 };
/** Accent comes up soon enough that a petal the pointer only passes stays pale, and leaves slowly. */
export const ACCENT_RISE: SpringSpec = { response: 0.3, damping: 1 };
export const ACCENT_FADE: SpringSpec = { response: 0.8, damping: 1 };
/** A band shows once the pointer has stopped long enough to read its name. */
export const BANDS: SpringSpec = { response: 0.3, damping: 1 };
/** Keeps what's under the pointer under the pointer. */
export const ROTATION: SpringSpec = { response: 0.2, damping: 1 };
export const OFFSET: SpringSpec = { response: 0.16, damping: 1 };
/** The travelling note follows its petal. */
export const NOTE: SpringSpec = { response: 0.4, damping: 0.95 };
export const PRESENCE: SpringSpec = { response: 0.3, damping: 1 };
/** A note says one name for at least this long, in seconds, however fast the pointer goes by. */
export const NOTE_HOLD = 0.14;
/** A mouse wheel's notch is a jump; this takes the jump out. A pinch doesn't go through it. */
export const WHEEL: SpringSpec = { response: 0.1, damping: 1 };
export const FLY: SpringSpec = { response: 0.62, damping: 0.94 };
export const BOUNCE_BACK: SpringSpec = { response: 0.34, damping: 1 };

/** Zoom limits, as a scale on the world. The flower's world is 800 across. */
export const ZOOM_LIMITS: [number, number] = [0.05, 24];
/** Past a limit the zoom gives way less and less, up to this far (natural log of the scale). */
export const SOFT_EDGE = 0.28;
/** A wheel event's pixels to the log of the scale. Chrome's pinch is 100 ln(scale), so this is 1:1. */
export const PINCH_GAIN = 0.01;
export const WHEEL_GAIN = 0.002;
/** A wheel delta this big is a notch, not a finger. */
export const NOTCH = 40;
/** No wheel for this long and an overshoot springs back, in seconds. */
export const RELEASE_AFTER = 0.09;
/** Drag inertia: how long the velocity takes to fall by 1/e, in seconds. */
export const PAN_DECAY = 0.16;

/** The flower fills this share of the window's short side, at rest. */
export const FIT = 0.415;

/** The line between two wedges, in world units: the same width from base to tip. */
export const GUTTER = 0.6;

/** Dock: how much of the focus's rise each petal gets, by how many petals away it is. Past the last
 * one nothing moves. */
export const DOCK_FALLOFF = [1, 0.15, 0.05];
/** Dock: how far the focus rises, as a share of the longest bar. Less once it's big on screen. */
export const DOCK_RISE = 0.28;
export const DOCK_RISE_NEAR = 0.1;
/** Dock: how much wider the focus's tip gets, as extra on its own, drawn over its neighbours. Falls
 * off as the petal gets big on screen, and its tip reaches at least FLARE_MIN_TIP_PX across. */
export const FLARE_WIDE = 0.7;
export const FLARE_NEAR = 0.2;
export const FLARE_MIN_TIP_PX = 40;
export const FLARE_MAX = 6;

/** Lift: the swell's peak width, as extra on the petal's own. Falls off as it gets big on screen. */
export const SWELL_WIDE = 1.5;
export const SWELL_NEAR = 0.3;
export const SWELL_WIDE_BELOW_PX = 16;
export const SWELL_NEAR_ABOVE_PX = 70;
/** Lift: a petal under the pointer is at least this many px wide, however many petals there are. */
export const SWELL_MIN_PX = 16;
export const SWELL_MAX = 9;
/** Lift: the height, a share of its own, plus a share of the longest bar. */
export const LIFT_OWN = 0.16;
export const LIFT_LONGEST = 0.11;
/** Lift: the others step back by this much of their height. */
export const SETTLE = 0.07;

/** A crossing opens a petal up to this many times its width (crossing.js). */
export const OPEN_WIDTH = 4;
/** Past this far open, the account stays locked until the zoom closes it. */
export const LOCK_AT = 0.5;
/** The rest of the flower recedes this far while an account opens (crossing.js). */
export const RECEDE = 0.62;
