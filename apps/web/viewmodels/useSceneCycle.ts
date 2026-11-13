// How it works' row of scenes, cycling on a loop with the focused card highlighted. One scene is in focus at a
// time, and the row slides so it's in the middle. Under version 2 a line fills under it (box.cycle, app/versions/v2.css) and, once it's full, the focus moves on to the next,
// round and round. Without that line (version 1, reduced motion) nothing moves by itself.
// A hand on the row holds it: the pointer over it, the keyboard in it, the row out of sight or the tab
// hidden. The ticks and the arrows move the focus in every version; a finger or a trackpad moves the row,
// and the focus follows what's left in view.
import {
  type FocusEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

/** How long a hand's scroll has to stop before the focus follows it. */
const SETTLE_MS = 160;
/** How long the row's own slide takes at most, so its scroll events aren't taken for a hand's. */
const SLIDE_MS = 1000;

/** The row's scenes, without the spacers at its ends. */
const scenes = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>('[data-kind="scene"]')];

export function useSceneCycle<T extends HTMLElement>(count: number) {
  const row = useRef<T>(null);
  const [current, setCurrent] = useState(0);
  const at = useRef(0);
  /** Whether the next change slides the row: not when the row is already where a hand left it. */
  const slide = useRef(false);
  /** Until when the row's scroll events are its own slide. */
  const sliding = useRef(0);
  const [hold, setHold] = useState({ pointer: false, keys: false, away: true, hidden: false });

  const go = useCallback(
    (to: number, follow = true) => {
      const next = ((to % count) + count) % count;
      slide.current = follow;
      at.current = next;
      setCurrent(next);
    },
    [count],
  );

  // The row slides so the scene in focus is in its middle.
  useEffect(() => {
    const el = row.current;
    const card = el && scenes(el)[current];
    if (!slide.current || !el || !card) return;
    const box = el.getBoundingClientRect();
    const at = card.getBoundingClientRect();
    const left = el.scrollLeft + at.left - box.left - (box.width - at.width) / 2;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    sliding.current = performance.now() + SLIDE_MS;
    el.scrollTo({ left, behavior: still ? 'auto' : 'smooth' });
  }, [current]);

  // A hand moved the row: the scene that came to rest in its middle takes the focus.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    let timer = 0;
    const settle = () => {
      if (performance.now() < sliding.current) return;
      const box = el.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      const off = scenes(el).map((c) => {
        const r = c.getBoundingClientRect();
        return Math.abs(r.left + r.width / 2 - middle);
      });
      const nearest = off.indexOf(Math.min(...off));
      if (nearest !== -1 && nearest !== at.current) go(nearest, false);
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SETTLE_MS);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, [go]);

  // Out of sight, or in a hidden tab, the row holds.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const seen = new IntersectionObserver(
      ([entry]) => setHold((h) => ({ ...h, away: !entry?.isIntersecting })),
      { threshold: 0.4 },
    );
    seen.observe(el);
    const onVisibility = () => setHold((h) => ({ ...h, hidden: document.hidden }));
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      seen.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  /** On the element around the row and its controls: the pointer and the keyboard hold it. */
  const holder = {
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType !== 'touch') setHold((h) => ({ ...h, pointer: true }));
    },
    onPointerLeave: () => setHold((h) => ({ ...h, pointer: false })),
    onFocus: (e: FocusEvent) => {
      if (e.target.matches(':focus-visible')) setHold((h) => ({ ...h, keys: true }));
    },
    onBlur: (e: FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setHold((h) => ({ ...h, keys: false }));
    },
  };

  return {
    row,
    current,
    held: hold.pointer || hold.keys || hold.away || hold.hidden,
    holder,
    go: (to: number) => go(to),
    back: () => go(at.current - 1),
    next: () => go(at.current + 1),
    /** The line under the scene in focus is full. */
    timeUp: () => go(at.current + 1),
  };
}
