// A row of cards that scrolls sideways (How it works; Elco, 10 Nov: "a row of cards"). The row itself is a
// strip that overflows and snaps to each card, so a trackpad, a finger or the keyboard move it with no help
// from here. This only drives the two arrows: one card back or on, each off at its own end.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useCardRow<T extends HTMLElement>() {
  const row = useRef<T>(null);
  const [ends, setEnds] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    setEnds({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      resized.disconnect();
    };
  }, [measure]);

  const step = useCallback((by: 1 | -1) => {
    const el = row.current;
    const card = el?.firstElementChild;
    if (!el || !(card instanceof HTMLElement)) return;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: by * (card.offsetWidth + gap), behavior: still ? 'auto' : 'smooth' });
  }, []);

  return {
    row,
    atStart: ends.start,
    atEnd: ends.end,
    back: () => step(-1),
    next: () => step(1),
  };
}
