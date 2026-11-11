// The hero's story clock (lib/hero-story.ts): which beat is on and how far into it, one frame per screen refresh.
// It plays by itself and loops; it sleeps while the hero is out of sight or the tab is hidden, and wakes where it
// left off. `fresh` is the first beat on arrival, which grows from the bare centre; once the story has gone round
// (or a beat has been chosen) it is false. With reduced motion it starts paused on a settled scene, and the beats
// are stepped by hand. Choosing a beat pauses it there, settled; play goes on from it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BEAT_MS, SETTLED_MS } from '../lib/hero-story.ts';

/** The longest step one frame may take, so a stalled frame doesn't jump the story. */
const MAX_STEP_MS = 50;

export function useHeroStory<T extends HTMLElement>(beats: number) {
  const stage = useRef<T>(null);
  const [beat, setBeat] = useState(0);
  const [t, setT] = useState(0);
  const [fresh, setFresh] = useState(true);
  const [playing, setPlaying] = useState(true);
  const visible = useRef(true);
  const clock = useRef({ beat: 0, t: 0 });
  /** Starts the frames again after the hero comes back into sight; set while playing. */
  const wake = useRef<() => void>(() => {});

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
            visible.current = Boolean(entry?.isIntersecting);
            if (visible.current) wake.current();
          },
          { threshold: 0.15 },
        )
      : null;
    if (el) watch?.observe(el);
    const tab = () => {
      if (!document.hidden) wake.current();
    };
    document.addEventListener('visibilitychange', tab);
    return () => {
      watch?.disconnect();
      document.removeEventListener('visibilitychange', tab);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = 0;
    const frame = (now: number) => {
      id = 0;
      // out of sight: no more frames until wake()
      if (!visible.current || document.hidden) return;
      const dt = last ? Math.min(MAX_STEP_MS, now - last) : 0;
      last = now;
      const c = clock.current;
      c.t += dt;
      if (c.t > BEAT_MS) {
        c.beat = (c.beat + 1) % beats;
        c.t = 0;
        setBeat(c.beat);
        if (c.beat === 0) setFresh(false);
      }
      setT(c.t);
      id = requestAnimationFrame(frame);
    };
    wake.current = () => {
      if (id) return;
      last = 0;
      id = requestAnimationFrame(frame);
    };
    wake.current();
    return () => {
      cancelAnimationFrame(id);
      wake.current = () => {};
    };
  }, [playing, beats]);

  const choose = useCallback((to: number) => {
    setPlaying(false);
    clock.current = { beat: to, t: SETTLED_MS };
    setBeat(to);
    setT(SETTLED_MS);
    setFresh(false);
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

  return { stage, beat, t, fresh, playing, choose, toggle };
}

export type HeroStoryClock = ReturnType<typeof useHeroStory<HTMLDivElement>>;
