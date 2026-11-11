// The illustrated hero's simulated chat (Elco, 11 Nov): its scripted turns are said one after another, by
// themselves, and once the last has been read for a while the chat starts again. It starts the first time it
// comes into sight, and holds while it's out of sight or the tab is hidden. With reduced motion nothing moves
// by itself: the whole chat is there at once.
import { useEffect, useRef, useState } from 'react';

/** How long each turn stays the newest before the next is said. */
const BEAT_MS = 2600;
/** How long the whole chat stays, once it's all said, before it starts again. */
const REST_MS = 6000;

export function useHeroChat<T extends HTMLElement>(count: number) {
  const box = useRef<T>(null);
  const [shown, setShown] = useState(0);
  const [hold, setHold] = useState({ away: true, hidden: false });
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setStill(true);
    const el = box.current;
    if (!el) return;
    const seen = new IntersectionObserver(([entry]) =>
      setHold((h) => ({ ...h, away: !entry?.isIntersecting })),
    );
    seen.observe(el);
    const tab = () => setHold((h) => ({ ...h, hidden: document.hidden }));
    document.addEventListener('visibilitychange', tab);
    return () => {
      seen.disconnect();
      document.removeEventListener('visibilitychange', tab);
    };
  }, []);

  useEffect(() => {
    if (still || hold.away || hold.hidden) return;
    const t = setTimeout(
      () => setShown((n) => (n >= count ? 0 : n + 1)),
      shown === 0 ? BEAT_MS / 2 : shown >= count ? REST_MS : BEAT_MS,
    );
    return () => clearTimeout(t);
  }, [shown, count, still, hold]);

  return { box, shown: still ? count : shown };
}
