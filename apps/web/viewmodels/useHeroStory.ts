// The hero's story clock (lib/hero-story.ts): which beat is on and how far into it, a frame at a time. It plays
// by itself and loops; it holds while the hero is out of sight or the tab is hidden. With reduced motion it starts
// paused on a settled scene, and the beats are stepped by hand. Choosing a beat pauses it there, settled; play
// goes on from it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BEAT_MS, SETTLED_MS } from '../lib/hero-story.ts';

/** How often a frame is drawn: smooth enough for the petals, light enough for a landing page. */
const FRAME_MS = 33;

export function useHeroStory<T extends HTMLElement>(beats: number) {
  const stage = useRef<T>(null);
  const [beat, setBeat] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const seen = useRef({ visible: true, hidden: false });
  const clock = useRef({ beat: 0, t: 0 });

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPlaying(false);
      clock.current.t = SETTLED_MS;
      setT(SETTLED_MS);
    }
    const el = stage.current;
    const watch = el
      ? new IntersectionObserver(
          ([entry]) => {
            seen.current.visible = Boolean(entry?.isIntersecting);
          },
          { threshold: 0.15 },
        )
      : null;
    if (el) watch?.observe(el);
    const tab = () => {
      seen.current.hidden = document.hidden;
    };
    document.addEventListener('visibilitychange', tab);
    return () => {
      watch?.disconnect();
      document.removeEventListener('visibilitychange', tab);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(50, now - last);
      last = now;
      if (!seen.current.visible || seen.current.hidden) return;
      const c = clock.current;
      c.t += dt;
      if (c.t > BEAT_MS) {
        c.beat = (c.beat + 1) % beats;
        c.t = 0;
        setBeat(c.beat);
      }
      setT(c.t);
    }, FRAME_MS);
    return () => clearInterval(tick);
  }, [playing, beats]);

  const choose = useCallback((to: number) => {
    setPlaying(false);
    clock.current = { beat: to, t: SETTLED_MS };
    setBeat(to);
    setT(SETTLED_MS);
  }, []);

  const toggle = useCallback(() => {
    setPlaying((on) => {
      // played again from a beat whose words have left: that beat starts over
      if (!on && clock.current.t > BEAT_MS - 900) {
        clock.current.t = 0;
        setT(0);
      }
      return !on;
    });
  }, []);

  return { stage, beat, t, playing, choose, toggle };
}

export type HeroStoryClock = ReturnType<typeof useHeroStory<HTMLDivElement>>;
