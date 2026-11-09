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

/**
 * Where the conversation's boxes start: on the left, because a sorted flower's small side is there
 * and its biggest names are upper right. Output above, input directly under it, stopping above the
 * corner the flower's small map has. The flower's own box waits on the right, at the top, closed until
 * something asks for it. The list of conversations waits beside the output, as tall as it, and the models
 * wait beside the input, ending level with it.
 */
export function conversationBoxes(
  win: Size,
  inputH: number = floatBox['input-height'],
): { output: Rect; input: Rect; panel: Rect; list: Rect; options: Rect } {
  const { inset, gap, width, floor, 'min-height': minH } = floatBox;
  const w = Math.min(width, win.w - inset * 2);
  const outputH = Math.max(minH, win.h - inset - floor - gap - inputH);
  const panelW = Math.min(floatBox['panel-width'], win.w - inset * 2);
  const panelH = Math.min(floatBox['panel-height'], win.h - inset * 2);
  return {
    output: kept({ x: inset, y: inset, w, h: outputH }, win),
    input: kept({ x: inset, y: inset + outputH + gap, w, h: inputH }, win),
    panel: kept({ x: win.w - inset - panelW, y: inset, w: panelW, h: panelH }, win),
    list: kept({ x: inset + w + gap, y: inset, w: floatBox['list-width'], h: outputH }, win),
    options: kept(
      {
        x: inset + w + gap,
        y: Math.max(inset, inset + outputH + gap + inputH - floatBox['options-height']),
        w: floatBox['options-width'],
        h: Math.min(floatBox['options-height'], win.h - inset * 2),
      },
      win,
    ),
  };
}

/**
 * With the terminal in the page (W10): the person's own agent takes the output's place, wider and down to
 * the floor, since its own screen holds the input too. The list moves over to stay beside it.
 */
export function terminalBoxes(win: Size): ReturnType<typeof conversationBoxes> {
  const boxes = conversationBoxes(win, 0);
  const { inset, gap } = floatBox;
  const w = Math.min(floatBox['terminal-width'], win.w - inset * 2);
  return {
    ...boxes,
    output: kept({ ...boxes.output, w }, win),
    list: kept({ ...boxes.list, x: inset + w + gap }, win),
  };
}

/** The same, with a recorded run's input: a read-only saved question and the button that plays it. */
export const recordedBoxes = (win: Size) =>
  conversationBoxes(win, floatBox['recorded-input-height']);
