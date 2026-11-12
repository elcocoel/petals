// What a hand does to the boxes floating over a canvas: move, size, raise, and keep the wheel. It writes
// straight to each box's element, so a drag never renders React and a render never moves a box. The
// geometry is in lib/float-box.ts. Positions last as long as the page does (a visit, not kept per person).
import { sizes } from '@petal/tokens';
import { type HTMLAttributes, type RefCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type Edge,
  kept,
  moved,
  type Rect,
  type Size,
  seamed,
  sized,
  snapped,
} from '../lib/float-box.ts';

type Hold = Pick<
  HTMLAttributes<HTMLElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onMouseDown'
>;

export interface BoxHand {
  root: RefCallback<HTMLElement>;
  raise: () => void;
  bar: Hold;
  edge: Record<Edge, Hold>;
  /** box.split: the line between a box's sheet and its base, where it has one. */
  seam: Hold;
  /**
   * The page sets the box's height (a fold to its bar, say), and null puts back the height it had before;
   * a box with a base isn't folded. Sizing it by hand ends the fold where it is.
   */
  fold: (to: number | null) => void;
}

/** Where a page's boxes live, and how they behave there (OVERLAYS, 12 Nov: the map's panels as boxes). */
export interface FloatRoom {
  /**
   * Where the side panel ends, on a page that has one (/make): when it opens or closes, the boxes next to it
   * or near it move with it into the room, a hand's too (Elco, walk 5, 12 Nov: "anything that is in its area
   * of influence or close to it ... would like get out of the way"), and they snap beside it.
   */
  edge?: number | undefined;
  /** Where the boxes' room starts from the window's top, as it is now (below the site's nav): no bar goes above it. */
  top?: (() => number) | undefined;
  /** box.snap: a box let go near the room's edges lands on them (Elco, walk 5: "snap to the edges"). */
  snap?: boolean | undefined;
}

interface Held {
  el: HTMLElement | null;
  rect: Rect | null;
  /** A hand moved or sized it: placing the boxes again leaves it where it was put. */
  moved: boolean;
  /** folded by the page to `to`, and the height it goes back to */
  folded: { to: number; back: number } | null;
}

/** One order for every box on the page, whichever group it's in, so the one raised last is on top. */
let highest = 0;

/** box.hold: pressing here leaves the cursor where it was, so what's being typed stays in focus. */
export const keepCursor = (e: { preventDefault(): void }) => e.preventDefault();

const windowSize = (): Size => ({ w: window.innerWidth, h: window.innerHeight });

/**
 * A box a hand has put next to the side panel, or near it: its left side under the panel, or no further past
 * the panel's edge than the panel's own width. It moves with the edge (Elco's walk 5, 12 Nov).
 */
const nearPanel = (r: Rect, edge: number) => r.x <= edge + sizes['Sidebar width'];

/** A box with a base marks it, so the base's height is painted with the rest (components/ui/FloatBox.tsx). */
const BASE = '[data-foot]';

const paint = (el: HTMLElement, r: Rect) => {
  el.style.translate = `${Math.round(r.x)}px ${Math.round(r.y)}px`;
  el.style.width = `${Math.round(r.w)}px`;
  el.style.height = `${Math.round(r.h)}px`;
  if (r.base === undefined) return;
  const base = el.querySelector<HTMLElement>(BASE);
  if (base) base.style.height = `${Math.round(r.base)}px`;
};

/** Is there anything between the pointer and the box that this wheel can still scroll? */
function canScroll(from: EventTarget | null, root: Element, dx: number, dy: number): boolean {
  const sideways = Math.abs(dx) > Math.abs(dy);
  for (let el = from instanceof Element ? from : null; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    const scrolls = /auto|scroll/.test(sideways ? style.overflowX : style.overflowY);
    if (scrolls) {
      const room = sideways
        ? dx > 0
          ? el.scrollWidth - el.clientWidth - el.scrollLeft
          : el.scrollLeft
        : dy > 0
          ? el.scrollHeight - el.clientHeight - el.scrollTop
          : el.scrollTop;
      if (room > 0.5) return true;
    }
    if (el === root) break;
  }
  return false;
}

export function useFloatBoxes<K extends string>(
  keys: readonly K[],
  place: (win: Size) => Record<K, Rect>,
  room: FloatRoom = {},
): Record<K, BoxHand> {
  const { edge } = room;
  const boxes = useRef(new Map<K, Held>());
  const lastEdge = useRef(edge);
  // read when a hand moves a box, so a room that changes never builds the hands again
  const roomNow = useRef(room);
  roomNow.current = room;

  const hands = useMemo(() => {
    const heldOf = (key: K): Held => {
      let held = boxes.current.get(key);
      if (!held) {
        held = { el: null, rect: null, moved: false, folded: null };
        boxes.current.set(key, held);
      }
      return held;
    };

    // box.hold
    const onWheel = (e: WheelEvent) => {
      const root = e.currentTarget as Element;
      // a pinch arrives as a wheel with ctrl, and would zoom the page; anything this box can't scroll
      // would go on to the page, where a sideways swipe means going back
      if (e.cancelable && (e.ctrlKey || !canScroll(e.target, root, e.deltaX, e.deltaY))) {
        e.preventDefault();
      }
    };

    const topNow = () => roomNow.current.top?.() ?? 0;

    const handFor = (key: K): BoxHand => {
      const held = heldOf(key);

      const holdWith = (
        next: (from: Rect, dx: number, dy: number, win: Size) => Rect,
        /** where it lands when it's let go, if anywhere but where the hand left it */
        land?: (r: Rect, win: Size) => Rect,
      ): Hold => {
        let grip: { id: number; x: number; y: number; from: Rect } | null = null;
        const release = (e: { pointerId: number }) => {
          if (grip?.id !== e.pointerId) return;
          grip = null;
          if (!land || !held.el || !held.rect) return;
          held.rect = land(held.rect, windowSize());
          paint(held.el, held.rect);
        };
        return {
          onPointerDown: (e) => {
            if (e.button !== 0 || !held.rect) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            grip = { id: e.pointerId, x: e.clientX, y: e.clientY, from: held.rect };
          },
          onPointerMove: (e) => {
            if (grip?.id !== e.pointerId || !held.el) return;
            // the button came up somewhere this never heard about: the box doesn't stick to the pointer
            if (e.buttons === 0) {
              grip = null;
              return;
            }
            const dx = e.clientX - grip.x;
            const dy = e.clientY - grip.y;
            held.moved = true;
            held.rect = next(grip.from, dx, dy, windowSize());
            paint(held.el, held.rect);
          },
          onPointerUp: release,
          onPointerCancel: release,
          // what's typed stays focused and no words get selected: a hand on a box's edge is only moving it
          onMouseDown: keepCursor,
        };
      };

      return {
        root: (el) => {
          held.el = el;
          if (!el) return;
          el.addEventListener('wheel', onWheel, { passive: false });
          return () => el.removeEventListener('wheel', onWheel);
        },
        // box.move
        raise: () => {
          if (held.el) held.el.style.zIndex = String(++highest);
        },
        // box.snap, where the page asks for it: let go near an edge, it lands on it
        bar: holdWith(
          (from, dx, dy, win) => moved(from, dx, dy, win, topNow()),
          (r, win) => (roomNow.current.snap ? snapped(r, win, lastEdge.current ?? 0, topNow()) : r),
        ),
        // box.size
        edge: Object.fromEntries(
          (['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((edge) => [
            edge,
            holdWith((from, dx, dy, win) => {
              // sized by hand, a folded box is no longer folded
              held.folded = null;
              return sized(from, edge, dx, dy, win, topNow());
            }),
          ]),
        ) as Record<Edge, Hold>,
        // box.split
        seam: holdWith((from, _dx, dy) => seamed(from, dy)),
        fold: (to) => {
          if (!held.el || !held.rect || held.rect.base !== undefined) return;
          if (to === null) {
            if (!held.folded) return;
            held.rect = kept({ ...held.rect, h: held.folded.back }, windowSize(), topNow());
            held.folded = null;
          } else {
            held.folded = { to, back: held.folded?.back ?? held.rect.h };
            held.rect = { ...held.rect, h: to };
          }
          paint(held.el, held.rect);
        },
      };
    };

    return Object.fromEntries(keys.map((key) => [key, handFor(key)])) as Record<K, BoxHand>;
  }, [keys]);

  // Placed again when the placing changes (the side panel's edge, on /make), except a box a hand has put
  // somewhere (design/side-panel.md, line 21): that one stays, unless it's next to the panel or near it, and
  // then it moves as far as the panel's edge did.
  useLayoutEffect(() => {
    const now = windowSize();
    const top = roomNow.current.top?.() ?? 0;
    const first = place(now);
    const was = lastEdge.current;
    lastEdge.current = edge;
    const shift = edge !== undefined && was !== undefined ? edge - was : 0;
    for (const key of keys) {
      const held = boxes.current.get(key);
      if (!held?.el) continue;
      if (held.moved) {
        if (shift === 0 || !held.rect || was === undefined || !nearPanel(held.rect, was)) continue;
        held.rect = kept({ ...held.rect, x: held.rect.x + shift }, now, top);
        paint(held.el, held.rect);
        continue;
      }
      const placed = first[key];
      // folded by the page, it stays folded where it's placed, and goes back to the placed height
      if (held.folded) held.folded = { ...held.folded, back: placed.h };
      held.rect = held.folded ? { ...placed, h: held.folded.to } : placed;
      paint(held.el, held.rect);
      // raised when it first shows, never when it's placed again: a box a hand raised last stays on top
      // while the side panel opens or closes
      if (held.el.style.visibility !== 'visible') {
        hands[key].raise();
        held.el.style.visibility = 'visible';
      }
    }
    const onResize = () => {
      const win = windowSize();
      const room = roomNow.current.top?.() ?? 0;
      for (const held of boxes.current.values()) {
        if (!held.el || !held.rect) continue;
        held.rect = kept(held.rect, win, room);
        paint(held.el, held.rect);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [keys, place, hands, edge]);

  return hands;
}
