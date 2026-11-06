// What the pointer asks of the petals, as targets for their springs. Pure.
//
// Dock: direct focus carries the weight. The petal under the pointer rises and its tip widens over its
// neighbours, the next one rises 15% of that, the next 5%, and past that nothing moves. Nothing changes
// width on the circle, so the polygon and the line between wedges hold still. Lift: only the
// petal under it, wider on the circle, and the others step back. `way` only changes the targets.
import { DETAIL, fade, ramp } from './detail.ts';
import {
  DOCK_FALLOFF,
  DOCK_RISE,
  DOCK_RISE_NEAR,
  FLARE_MAX,
  FLARE_MIN_TIP_PX,
  FLARE_NEAR,
  FLARE_WIDE,
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
import { widthBefore } from './ring.ts';

export type HoverWay = 'dock' | 'lift';

/** How much the pointer counts at this distance from the centre, in world units: it fades out over
 * the middle of the polygon and past the tips, so travel in and out is as continuous as any. */
export function reachOf(m: Pick<Model, 'r0' | 'R'>): (r: number) => number {
  const { r0, R } = m;
  return (r) => ramp(r0 * 0.25, r0 * 0.7, r) * (1 - ramp(R * 1.12, R * 1.6, r));
}

const nearness = (sidePx: number) => ramp(SWELL_WIDE_BELOW_PX, SWELL_NEAR_ABOVE_PX, sidePx);

/** Lift: the swell's extra width at full strength for a petal of this size on screen. */
export function swellGain(sidePx: number): number {
  const gain = SWELL_WIDE + (SWELL_NEAR - SWELL_WIDE) * nearness(sidePx);
  return Math.min(SWELL_MAX, Math.max(gain, SWELL_MIN_PX / (sidePx || 1) - 1));
}

/** Dock: the flare at full strength for a petal of this size on screen. */
export function flareGain(sidePx: number, tipPx: number): number {
  const gain = FLARE_WIDE + (FLARE_NEAR - FLARE_WIDE) * nearness(sidePx);
  return Math.min(FLARE_MAX, Math.max(gain, FLARE_MIN_TIP_PX / (tipPx || 1) - 1));
}

/** Dock: how far the focus rises, as a share of the longest bar. */
export const riseGain = (sidePx: number): number =>
  DOCK_RISE + (DOCK_RISE_NEAR - DOCK_RISE) * nearness(sidePx);

/** The height a petal is drawn, from its own and its spring. Below zero it's folded or stepping back. */
export function heightOf(way: HoverWay, H: number, L: number, g: number): number {
  if (g < 0) return H * Math.max(0, 1 + g);
  return way === 'dock' ? H + L * g : H * (1 + LIFT_OWN * g) + L * LIFT_LONGEST * g;
}

export interface HoverFocus {
  index: number;
  reach: number;
}

export interface HoverTargets {
  /** Extra width on the circle. */
  width: Float64Array;
  /** See heightOf. */
  height: Float64Array;
  /** Extra width at the tip, over the neighbours. */
  flare: Float64Array;
}

/** Writes each petal's targets. */
export function hoverTargets(
  way: HoverWay,
  m: Model,
  focus: HoverFocus | null,
  k: number,
  out: HoverTargets,
): void {
  out.width.fill(0);
  out.height.fill(0);
  out.flare.fill(0);
  const gain = focus ? focus.reach * fade(DETAIL.hover, m.R * k) : 0;
  if (gain <= 0 || !focus) return;
  const sidePx = (m.ring.len[focus.index] as number) * k;
  if (way === 'lift') {
    out.height.fill(-SETTLE * gain);
    out.width[focus.index] = swellGain(sidePx) * gain;
    out.height[focus.index] = gain;
    return;
  }
  // figure.petal-focus
  const tipPx = widthBefore(m.ring, focus.index, m.height[focus.index] as number) * k;
  out.flare[focus.index] = flareGain(sidePx, tipPx) * gain;
  const rise = riseGain(sidePx) * gain;
  // figure.petal-neighbour
  // Furthest first, so on a tiny flower the nearest petal's share is the one that stays.
  for (let d = DOCK_FALLOFF.length - 1; d >= 0; d--) {
    const share = DOCK_FALLOFF[d] as number;
    out.height[(focus.index + d) % m.n] = rise * share;
    out.height[(focus.index - d + m.n * d) % m.n] = rise * share;
  }
}
