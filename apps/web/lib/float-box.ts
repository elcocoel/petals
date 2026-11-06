// Where a box floating over a canvas sits, and what a hand does to it. Pure geometry, in window pixels.
// The one law: a box's bar can never leave the window, so it can always be grabbed again. Its body may
// hang off the bottom, which is how a person puts a box mostly out of the way.
import { floatBox } from '@petal/tokens';

export interface Size {
  w: number;
  h: number;
}
export interface Rect extends Size {
  x: number;
  y: number;
}
export type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

/** Below `lo` never wins over `lo`, so a window smaller than a box still gives one answer. */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** The same box, inside this window. What a drag and a window resize both come down to. */
export function kept(r: Rect, win: Size): Rect {
  const w = Math.min(r.w, win.w);
  const h = Math.min(r.h, win.h);
  return {
    w,
    h,
    x: clamp(r.x, 0, win.w - w),
    y: clamp(r.y, 0, win.h - floatBox.bar),
  };
}

export const moved = (from: Rect, dx: number, dy: number, win: Size): Rect =>
  kept({ ...from, x: from.x + dx, y: from.y + dy }, win);

/** The edge or corner under the hand follows it; the opposite one stays where it is. */
export function sized(from: Rect, edge: Edge, dx: number, dy: number, win: Size): Rect {
  const minW = Math.min(floatBox['min-width'], win.w);
  const minH = Math.min(floatBox['min-height'], win.h);
  let left = from.x;
  let right = from.x + from.w;
  let top = from.y;
  let bottom = from.y + from.h;
  if (edge.includes('w')) left = clamp(left + dx, 0, right - minW);
  if (edge.includes('e')) right = clamp(right + dx, left + minW, win.w);
  if (edge.includes('n')) top = clamp(top + dy, 0, Math.min(bottom - minH, win.h - floatBox.bar));
  if (edge.includes('s')) bottom = clamp(bottom + dy, top + minH, win.h);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Where the conversation's two boxes start: on the right, output above, input directly under it. */
export function conversationBoxes(win: Size): { output: Rect; input: Rect } {
  const { inset, gap, width, 'input-height': inputH, 'min-height': minH } = floatBox;
  const w = Math.min(width, win.w - inset * 2);
  const x = win.w - inset - w;
  const outputH = Math.max(minH, win.h - inset * 2 - gap - inputH);
  return {
    output: kept({ x, y: inset, w, h: outputH }, win),
    input: kept({ x, y: inset + outputH + gap, w, h: inputH }, win),
  };
}
