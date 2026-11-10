// Where a box floating over a canvas sits, and what a hand does to it. Pure geometry, in window pixels.
// The one law: a box's bar can never leave the window, so it can always be grabbed again. Its body may
// hang off the bottom, which is how a person puts a box mostly out of the way.
import { floatBox, layout, sizes } from '@petal/tokens';

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

/**
 * Where the boxes start beside the side panel, when it's on the page (components/workspace/WorkMenu.tsx):
 * its bar of sections (a Row height control with Space 8 around it) and the section open beside it,
 * Sidebar width wide, at their widest, so opening or folding the panel never moves a box.
 */
const BAR = sizes['Row height'] + 2 * layout['Space 8'];
export const besideMenu = BAR + sizes['Sidebar width'] + floatBox.gap;

/** A column of boxes `w` wide starts at `from`, or further left if it wouldn't fit there. */
const columnAt = (from: number, w: number, win: Size) =>
  Math.max(floatBox.inset, Math.min(from, win.w - floatBox.inset - w));

/**
 * Where the conversation's boxes start: on the left, because a sorted flower's small side is there
 * and its biggest names are upper right, and past the menu when there is one (`from`). Output above,
 * input directly under it, stopping above the corner the flower's small map has. The flower's own box
 * waits on the right, at the top, closed until something asks for it. The models wait beside the input,
 * ending level with it.
 */
export function conversationBoxes(
  win: Size,
  inputH: number = floatBox['input-height'],
  from: number = floatBox.inset,
): { output: Rect; input: Rect; panel: Rect; options: Rect } {
  const { inset, gap, width, floor, 'min-height': minH } = floatBox;
  const w = Math.min(width, win.w - inset * 2);
  const x = columnAt(from, w, win);
  const outputH = Math.max(minH, win.h - inset - floor - gap - inputH);
  const panelW = Math.min(floatBox['panel-width'], win.w - inset * 2);
  const panelH = Math.min(floatBox['panel-height'], win.h - inset * 2);
  return {
    output: kept({ x, y: inset, w, h: outputH }, win),
    input: kept({ x, y: inset + outputH + gap, w, h: inputH }, win),
    panel: kept({ x: win.w - inset - panelW, y: inset, w: panelW, h: panelH }, win),
    options: kept(
      {
        x: x + w + gap,
        y: Math.max(inset, inset + outputH + gap + inputH - floatBox['options-height']),
        w: floatBox['options-width'],
        h: Math.min(floatBox['options-height'], win.h - inset * 2),
      },
      win,
    ),
  };
}

/** The same, with a recorded run's input: a read-only saved question and the button that plays it. */
export const recordedBoxes = (win: Size) =>
  conversationBoxes(win, floatBox['recorded-input-height']);
