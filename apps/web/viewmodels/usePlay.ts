// The Play (lib/play.ts): steps a map's dated readings one after another, reads each (GET /maps/:id/reading by its
// snapshot) and hands it to the map as a landed reading, so the flower glides from one moment to the next. Every
// moment is asked for at the first press and kept, and the next step starts once a moment has landed, so a slow
// read holds the Play rather than being skipped. Pressed again, it pauses where it is; the last moment holds as
// long as the others, then the map draws its own reading again, so the last moment isn't taken for the map. Leaving
// the flower, or a map without moments, gives the map its own reading back too.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapLanded } from '../landscape/LandscapeCanvas.tsx';
import { type ComposedReading, readComposed } from '../lib/agent-client.ts';
import { PLAY_STEP, type PlayStep } from '../lib/play.ts';

export interface Play {
  /** the moment shown, by its place in the steps, or -1 before the first press */
  at: number;
  playing: boolean;
  toggle: () => void;
}

export function usePlay(
  flower: { map: string; chain: string; name: string } | null,
  steps: readonly PlayStep[],
  view: string,
  onLand: (landed: MapLanded | null) => void,
): Play {
  const [at, setAt] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const land = useRef(onLand);
  land.current = onLand;
  const map = flower?.map ?? null;
  // each moment's reading, asked for once and kept while the flower and the view stay
  const kept = useRef(new Map<string, Promise<ComposedReading | null>>());
  const readOf = useCallback(
    (snapshot: string) => {
      let p = kept.current.get(snapshot);
      if (!p && flower) {
        p = readComposed(flower.map, [snapshot], view);
        kept.current.set(snapshot, p);
      }
      return p ?? Promise.resolve(null);
    },
    [flower, view],
  );

  // another flower, or none: the Play starts over and the map draws its own reading
  // biome-ignore lint/correctness/useExhaustiveDependencies: the map is what resets it
  useEffect(() => {
    kept.current = new Map();
    setAt(-1);
    setPlaying(false);
    land.current(null);
  }, [map, view]);

  // each moment shown: read it and hand it to the map; then, playing, the next after a while, until the last
  useEffect(() => {
    const step = steps[at];
    if (!flower || !step) return;
    let gone = false;
    let next = 0;
    void readOf(step.snapshot).then((r) => {
      if (gone || !r) return;
      land.current({
        chain: flower.chain,
        name: flower.name,
        map: flower.map,
        reading: { title: '', petals: r.petals },
        snapshot: step.snapshot,
        ...(r.pieces ? { pieces: r.pieces } : {}),
        ...(r.given ? { given: r.given } : {}),
      });
      // the next moment once this one has landed
      if (playing)
        next = window.setTimeout(() => {
          if (at + 1 < steps.length) setAt(at + 1);
          else {
            // the end: the map's own reading again
            setPlaying(false);
            setAt(-1);
            land.current(null);
          }
        }, PLAY_STEP);
    });
    return () => {
      gone = true;
      window.clearTimeout(next);
    };
  }, [at, playing, flower, steps, readOf]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // every moment asked for at once, so each is there by its turn
    for (const s of steps) void readOf(s.snapshot);
    setAt((now) => (now < 0 || now >= steps.length - 1 ? 0 : now + 1));
    setPlaying(true);
  };
  return { at, playing, toggle };
}
