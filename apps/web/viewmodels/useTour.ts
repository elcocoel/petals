// The landing map's moves, one after another (lib/landing-tour.ts): what the map shows now. They play while the map
// is on the screen and stop when it's scrolled away; with reduced motion the map holds the first and never moves.
import { type RefObject, useEffect, useState } from 'react';
import type { MapShow } from '../landscape/LandscapeCanvas.tsx';
import type { TourMove } from '../lib/landing-tour.ts';

export function useTour(
  moves: readonly TourMove[],
  frame: RefObject<HTMLElement | null>,
): MapShow | undefined {
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const watch = new IntersectionObserver(([e]) => setSeen(Boolean(e?.isIntersecting)), {
      threshold: 0.25,
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [frame]);
  const still =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const move = moves[at % (moves.length || 1)];
  useEffect(() => {
    if (!seen || still || !move || moves.length < 2) return;
    const next = window.setTimeout(() => setAt((i) => (i + 1) % moves.length), move.hold * 1000);
    return () => window.clearTimeout(next);
  }, [seen, still, move, moves.length]);
  return seen || still ? move?.show : undefined;
}
