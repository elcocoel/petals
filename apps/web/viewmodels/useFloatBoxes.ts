// What a hand does to the boxes floating over a canvas: move, size, raise, and keep the wheel. It writes
// straight to each box's element, so a drag never renders React and a render never moves a box. The
// geometry is in lib/float-box.ts. Positions last as long as the page does.
import { type HTMLAttributes, type RefCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { type Edge, kept, moved, type Rect, type Size, sized } from '../lib/float-box.ts';

type Hold = Pick<
  HTMLAttributes<HTMLElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onMouseDown'
>;

export interface BoxHand {
  root: RefCallback<HTMLElement>;
  raise: () => void;
  bar: Hold;
  edge: Record<Edge, Hold>;
}

interface Held {
  el: HTMLElement | null;
  rect: Rect | null;
}

/** box.hold: pressing here leaves the cursor where it was, so what's being typed stays in focus. */
export const keepCursor = (e: { preventDefault(): void }) => e.preventDefault();

const windowSize = (): Size => ({ w: window.innerWidth, h: window.innerHeight });

const paint = (el: HTMLElement, r: Rect) => {
  el.style.translate = `${Math.round(r.x)}px ${Math.round(r.y)}px`;
  el.style.width = `${Math.round(r.w)}px`;
  el.style.height = `${Math.round(r.h)}px`;
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
): Record<K, BoxHand> {
  const boxes = useRef(new Map<K, Held>());
  const highest = useRef(0);

  const hands = useMemo(() => {
    const heldOf = (key: K): Held => {
      let held = boxes.current.get(key);
      if (!held) {
        held = { el: null, rect: null };
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

    const handFor = (key: K): BoxHand => {
      const held = heldOf(key);

      const holdWith = (next: (from: Rect, dx: number, dy: number, win: Size) => Rect): Hold => {
        let grip: { id: number; x: number; y: number; from: Rect } | null = null;
        const release = (e: { pointerId: number }) => {
          if (grip?.id === e.pointerId) grip = null;
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
          if (held.el) held.el.style.zIndex = String(++highest.current);
        },
        bar: holdWith(moved),
        // box.size
        edge: Object.fromEntries(
          (['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as const).map((edge) => [
            edge,
            holdWith((from, dx, dy, win) => sized(from, edge, dx, dy, win)),
          ]),
        ) as Record<Edge, Hold>,
      };
    };

    return Object.fromEntries(keys.map((key) => [key, handFor(key)])) as Record<K, BoxHand>;
  }, [keys]);

  useLayoutEffect(() => {
    const first = place(windowSize());
    for (const key of keys) {
      const held = boxes.current.get(key);
      if (!held?.el) continue;
      held.rect = first[key];
      paint(held.el, held.rect);
      hands[key].raise();
      held.el.style.visibility = 'visible';
    }
    const onResize = () => {
      const win = windowSize();
      for (const held of boxes.current.values()) {
        if (!held.el || !held.rect) continue;
        held.rect = kept(held.rect, win);
        paint(held.el, held.rect);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [keys, place, hands]);

  return hands;
}
