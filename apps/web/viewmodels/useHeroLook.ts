// Where the visitor is looking from, for the hero's depth (Elco, 11 Nov: "Minority Report ... 3D
// dimensionality"): the pointer over the stage, from -1 to 1 each way, eased so the layers drift rather than jump.
// Nearer layers move more than farther ones (components/landing/HeroStory.tsx). It runs only while it has
// somewhere to go: frames while the pointer moves and settles, none at rest. With reduced motion it stays still.
import { useEffect, useRef, useState } from 'react';

/** How much of the way to the pointer each frame goes. */
const FOLLOW = 0.08;

export function useHeroLook<T extends HTMLElement>(stage: React.RefObject<T | null>) {
  const [look, setLook] = useState({ x: 0, y: 0 });

  const want = useRef({ x: 0, y: 0 });
  const now = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = stage.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let id = 0;
    const step = () => {
      const n = now.current;
      const w = want.current;
      n.x += (w.x - n.x) * FOLLOW;
      n.y += (w.y - n.y) * FOLLOW;
      const done = Math.abs(w.x - n.x) < 0.002 && Math.abs(w.y - n.y) < 0.002;
      if (done) {
        n.x = w.x;
        n.y = w.y;
      }
      setLook({ x: n.x, y: n.y });
      id = done ? 0 : requestAnimationFrame(step);
    };
    const go = () => {
      if (!id) id = requestAnimationFrame(step);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      want.current = {
        x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)),
      };
      go();
    };
    const leave = () => {
      want.current = { x: 0, y: 0 };
      go();
    };
    // the whole hero's width, so the words beside the stage still tilt it
    const area = el.closest('section') ?? el;
    area.addEventListener('pointermove', move as EventListener);
    area.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(id);
      area.removeEventListener('pointermove', move as EventListener);
      area.removeEventListener('pointerleave', leave);
    };
  }, [stage]);

  return look;
}
