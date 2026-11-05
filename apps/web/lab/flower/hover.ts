// What the pointer asks of the petals, as targets for their springs. Pure.
//
// Dock: a bump around the pointer's angle, in petals' own terms. Lift: only the petal under it, and
// the others step back. In both, neighbours make room because the widths share one circle, so the
// polygon stays closed whatever happens. `way` only changes the targets, never the machinery.
import { DETAIL, fade, ramp } from './detail.ts';
import {
  DOCK_CUTOFF,
  DOCK_SIGMA,
  DOCK_SIGMA_PX,
  LIFT_LONGEST,
  LIFT_OWN,
  SETTLE,
  SWELL_MAX,
  SWELL_MIN_PX,
  SWELL_NEAR,
  SWELL_NEAR_ABOVE_PX,
  SWELL_WIDE,
  SWELL_WIDE_BELOW_PX,
} from './feel.ts';
import type { Model } from './model.ts';

export type HoverWay = 'dock' | 'lift';

const TAU = Math.PI * 2;

/** How much the pointer counts at this distance from the centre, in world units: it fades out over
 * the middle of the polygon and past the bars' tips, so travel in and out is as continuous as any. */
export function reachOf(m: Pick<Model, 'r0' | 'R'>): (r: number) => number {
  const { r0, R } = m;
  return (r) => ramp(r0 * 0.25, r0 * 0.7, r) * (1 - ramp(R * 1.12, R * 1.6, r));
}

/** The swell's extra width at full strength for a petal of this size on screen. */
export function swellGain(sidePx: number): number {
  const gain =
    SWELL_WIDE + (SWELL_NEAR - SWELL_WIDE) * ramp(SWELL_WIDE_BELOW_PX, SWELL_NEAR_ABOVE_PX, sidePx);
  return Math.min(SWELL_MAX, Math.max(gain, SWELL_MIN_PX / (sidePx || 1) - 1));
}

/** The height a petal is drawn, from its own and its swell. Below zero it's stepping back. */
export function heightOf(H: number, L: number, g: number): number {
  return g >= 0 ? H * (1 + LIFT_OWN * g) + L * LIFT_LONGEST * g : H * Math.max(0, 1 + g);
}

export interface HoverFocus {
  index: number;
  angle: number;
  reach: number;
}

/** Writes each petal's width and height targets. */
export function hoverTargets(
  way: HoverWay,
  m: Model,
  focus: HoverFocus | null,
  k: number,
  outWidth: Float64Array,
  outHeight: Float64Array,
): void {
  const gain = focus ? focus.reach * fade(DETAIL.hover, m.R * k) : 0;
  if (gain <= 0 || !focus) {
    outWidth.fill(0);
    outHeight.fill(0);
    return;
  }
  const { len } = m.ring;
  if (way === 'lift') {
    outWidth.fill(0);
    outHeight.fill(-SETTLE * gain);
    outWidth[focus.index] = swellGain((len[focus.index] as number) * k) * gain;
    outHeight[focus.index] = gain;
    return;
  }
  const middle = (m.r0 + m.R) / 2;
  const sigma = Math.max(DOCK_SIGMA[0], Math.min(DOCK_SIGMA[1], DOCK_SIGMA_PX / (k * middle)));
  const cutoff = sigma * DOCK_CUTOFF;
  const { mid } = m;
  for (let i = 0; i < m.n; i++) {
    let d = Math.abs((mid[i] as number) - focus.angle);
    if (d > Math.PI) d = TAU - d;
    if (d > cutoff) {
      outWidth[i] = 0;
      outHeight[i] = 0;
      continue;
    }
    const g = Math.exp((-d * d) / (2 * sigma * sigma)) * gain;
    outWidth[i] = swellGain((len[i] as number) * k) * g;
    outHeight[i] = g;
  }
}
