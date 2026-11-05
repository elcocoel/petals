// Every number that decides how it feels, in one place to tune. What shows at what distance is in
// detail.ts. All of these started as guesses; the report says which ones were tuned by eye.
import type { SpringSpec } from './spring.ts';

/** The bar's height is the bounciest thing: it's what makes a sweep feel alive. */
export const HEIGHT: SpringSpec = { response: 0.3, damping: 0.56 };
/** The width is steadier, or the whole polygon would wobble. */
export const WIDTH: SpringSpec = { response: 0.26, damping: 0.85 };
/** How a petal hands the crossing to another one, when the pointer moves on part-way. */
export const OPEN: SpringSpec = { response: 0.22, damping: 1 };
/** Accent rises at once with the pointer and fades behind it, like a comet's tail. */
export const ACCENT_FADE: SpringSpec = { response: 0.5, damping: 1 };
/** Keeps what's under the pointer under the pointer. */
export const ROTATION: SpringSpec = { response: 0.2, damping: 1 };
export const OFFSET: SpringSpec = { response: 0.16, damping: 1 };
/** The travelling note follows its petal. */
export const NOTE: SpringSpec = { response: 0.2, damping: 0.78 };
export const PRESENCE: SpringSpec = { response: 0.16, damping: 1 };
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
export const FIT = 0.44;

/** Dock: how wide the swell is, in px along the ring, and its limits in radians. */
export const DOCK_SIGMA_PX = 72;
export const DOCK_SIGMA: [number, number] = [0.05, 0.34];
/** Dock: past this many sigmas a petal doesn't feel the pointer at all. */
export const DOCK_CUTOFF = 3;
/** The swell's peak width, as extra on the petal's own. Falls off as the petal gets big on screen. */
export const SWELL_WIDE = 1.5;
export const SWELL_NEAR = 0.3;
export const SWELL_WIDE_BELOW_PX = 16;
export const SWELL_NEAR_ABOVE_PX = 70;
/** A petal under the pointer is at least this many px wide, however many petals there are. */
export const SWELL_MIN_PX = 16;
export const SWELL_MAX = 9;
/** The height: a share of its own, plus a share of the longest bar, so a short petal grows too. */
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
