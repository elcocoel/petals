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
  /**
   * A box with a base (FloatBox's `foot`, design/conversation.md): the base's height, from the box's foot up.
   * The sheet above it has the rest.
   */
  base?: number;
}
export type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

/** Below `lo` never wins over `lo`, so a window smaller than a box still gives one answer. */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** A sheet keeps its bar and a line or two, and a base one line of its field and its controls. */
const SHEET_MIN = floatBox['min-height'];
const BASE_MIN = floatBox['base-min-height'];

/** The base, inside a box this tall: never below its least, and never so tall the sheet goes below its own. */
const baseIn = (base: number, h: number) => clamp(base, BASE_MIN, h - SHEET_MIN);

/** The same box, inside this window. What a drag and a window resize both come down to. */
export function kept(r: Rect, win: Size): Rect {
  const w = Math.min(r.w, win.w);
  const h = Math.min(r.h, win.h);
  return {
    w,
    h,
    x: clamp(r.x, 0, win.w - w),
    y: clamp(r.y, 0, win.h - floatBox.bar),
    ...(r.base === undefined ? {} : { base: baseIn(r.base, h) }),
  };
}

export const moved = (from: Rect, dx: number, dy: number, win: Size): Rect =>
  kept({ ...from, x: from.x + dx, y: from.y + dy }, win);

/** How near an edge a box let go of lands on it: a bar's height. */
const SNAP = floatBox.bar;

/**
 * box.snap: a box let go near the window's edges, or near the side panel's edge (`left`, where it ends, 0
 * for none), lands flush on them, where the boxes start (Elco, walk 5, 12 Nov: "maybe they would snap to the
 * edges more easily").
 */
export function snapped(r: Rect, win: Size, left = 0): Rect {
  const { inset } = floatBox;
  const near = (a: number, b: number) => Math.abs(a - b) <= SNAP;
  const start = left > 0 ? besidePanel(left) : inset;
  const end = win.w - inset - r.w;
  const bottom = win.h - inset - r.h;
  const x = near(r.x, start) ? start : near(r.x, end) ? end : r.x;
  const y = near(r.y, inset) ? inset : near(r.y, bottom) ? bottom : r.y;
  return kept({ ...r, x, y }, win);
}

/**
 * The edge or corner under the hand follows it; the opposite one stays where it is. With a base, each edge
 * sizes its own part (design/conversation.md, lines 5 to 7): the top the sheet, the bottom the base.
 */
export function sized(from: Rect, edge: Edge, dx: number, dy: number, win: Size): Rect {
  const minW = Math.min(floatBox['min-width'], win.w);
  const { base } = from;
  // the part this edge doesn't size keeps its height
  const minN = base === undefined ? floatBox['min-height'] : base + SHEET_MIN;
  const minS = base === undefined ? floatBox['min-height'] : from.h - base + BASE_MIN;
  let left = from.x;
  let right = from.x + from.w;
  let top = from.y;
  let bottom = from.y + from.h;
  if (edge.includes('w')) left = clamp(left + dx, 0, right - minW);
  if (edge.includes('e')) right = clamp(right + dx, left + minW, win.w);
  if (edge.includes('n')) {
    top = clamp(top + dy, 0, Math.min(bottom - Math.min(minN, win.h), win.h - floatBox.bar));
  }
  if (edge.includes('s')) bottom = clamp(bottom + dy, top + Math.min(minS, win.h), win.h);
  const h = bottom - top;
  const r = { x: left, y: top, w: right - left, h };
  if (base === undefined) return r;
  return { ...r, base: edge.includes('s') ? baseIn(base + (bottom - from.y - from.h), h) : base };
}

/** box.split: the seam follows the hand, so the base grows as the sheet shrinks, and the box stays as it is. */
export const seamed = (from: Rect, dy: number): Rect =>
  from.base === undefined ? from : { ...from, base: baseIn(from.base - dy, from.h) };

/**
 * Where the boxes start beside the side panel, when it's on the page (components/workspace/WorkMenu.tsx):
 * its bar of sections (a Row height control with Space 8 around it) and the section open beside it,
 * Sidebar width wide, at their widest, so opening or folding the panel never moves a box.
 */
const BAR = sizes['Row height'] + 2 * layout['Space 8'];
export const besideMenu = BAR + sizes['Sidebar width'] + floatBox.gap;

/** Where the boxes start past a side panel that ends at `edge` (design/side-panel.md, line 21). */
export const besidePanel = (edge: number) => edge + floatBox.gap;

/** A column of boxes `w` wide starts at `from`, or further left if it wouldn't fit there. */
const columnAt = (from: number, w: number, win: Size) =>
  Math.max(floatBox.inset, Math.min(from, win.w - floatBox.inset - w));

/**
 * Where the conversation starts (design/conversation.md, line 3): on the left, because a sorted flower's
 * small side is there and its biggest names are upper right, and past the menu when there is one (`from`).
 * One box, its sheet over its base, stopping above the corner the flower's small map has. The flower's own
 * box waits on the right, at the top, closed until something asks for it. The models wait beside it,
 * ending level with its foot.
 */
export function conversationBoxes(
  win: Size,
  base: number = floatBox['base-height'],
  from: number = floatBox.inset,
): { conversation: Rect; panel: Rect; options: Rect } {
  const { inset, gap, width, floor } = floatBox;
  const w = Math.min(width, win.w - inset * 2);
  const x = columnAt(from, w, win);
  const h = Math.max(SHEET_MIN + base, win.h - inset - floor);
  const panelW = Math.min(floatBox['panel-width'], win.w - inset * 2);
  const panelH = Math.min(floatBox['panel-height'], win.h - inset * 2);
  return {
    conversation: kept({ x, y: inset, w, h, base }, win),
    panel: kept({ x: win.w - inset - panelW, y: inset, w: panelW, h: panelH }, win),
    options: kept(
      {
        x: x + w + gap,
        y: Math.max(inset, inset + h - floatBox['options-height']),
        w: floatBox['options-width'],
        h: Math.min(floatBox['options-height'], win.h - inset * 2),
      },
      win,
    ),
  };
}

/**
 * A canvas page's one box (app/(canvas)): where the conversation's flower box starts, at the top right, in
 * the area below `top` (the site's nav), so it starts under the nav, not over it.
 */
export function boxUnder(win: Size, top: number): Rect {
  const { panel } = conversationBoxes({ w: win.w, h: win.h - top });
  return { ...panel, y: panel.y + top };
}

/**
 * What the conversation, where it starts, covers of the canvas, so the flower fits beside it (#78, 11 Nov), or
 * above it on a phone. Nothing when neither leaves the flower a third of the canvas.
 */
export function clearOfConversation(
  conversation: Rect,
  canvas: { left: number; top: number; width: number; height: number },
): { left: number; right: number; top: number; bottom: number } {
  const none = { left: 0, right: 0, top: 0, bottom: 0 };
  const { width, height } = canvas;
  const beside = Math.max(0, conversation.x + conversation.w + floatBox.gap - canvas.left);
  if (width - beside >= width / 3) return { ...none, left: beside };
  // below it, on a phone (besideOrBelow): the flower keeps the top
  const under = Math.max(0, canvas.top + height - (conversation.y - floatBox.gap));
  return height - under >= height / 3 ? { ...none, bottom: under } : none;
}

/** How much of a narrow window's height the flower keeps above the conversation (a phone). */
const ABOVE = 0.4;

/**
 * Where the conversation stands so the flower has room (#78, 11 Nov: on a phone the flower wasn't seen at
 * all): beside it when what's left beside is a third of the canvas or more; otherwise below it, the flower
 * keeping the top of the window. `left` is where the canvas starts, the side panel's edge.
 */
export function besideOrBelow(conversation: Rect, win: Size, left: number): Rect {
  const width = win.w - left;
  const beside = width - (conversation.x + conversation.w + floatBox.gap - left);
  if (beside >= width / 3) return conversation;
  const { inset } = floatBox;
  const x = win.w - conversation.x - inset >= floatBox['min-width'] ? conversation.x : inset;
  const y = Math.round(win.h * ABOVE);
  return kept({ ...conversation, x, y, w: win.w - x - inset, h: win.h - y - inset }, win);
}

/**
 * On /make, the flower's box opens over the conversation's thread, down to its base, so the flower keeps the
 * room beside the conversation and the field that asks about the petal stays in sight (#78, 11 Nov: the box
 * covered the flower's right side).
 */
export function overThread(conversation: Rect): Rect {
  const { x, y, w, h, base = 0 } = conversation;
  return { x, y, w, h: Math.max(SHEET_MIN, h - base) };
}

/** The same, with a recorded run's base: a read-only saved question and the button that plays it. */
export const recordedBoxes = (win: Size, from?: number) =>
  conversationBoxes(win, floatBox['recorded-base-height'], from);
