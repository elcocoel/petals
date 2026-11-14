// The Play (lib/play.ts): steps a map's dated readings one after another, reads each (GET /maps/:id/reading by its
// snapshot) and hands it to the map as a landed reading, so the flower glides from one moment to the next. Pressed
// again, it pauses where it is; at the last moment it stops there, and a press starts over. Leaving the flower, or
// a map without moments, gives the map its own reading back.
import { useEffect, useRef, useState } from 'react';
import type { MapLanded } from '../landscape/LandscapeCanvas.tsx';
import { readComposed } from '../lib/agent-client.ts';
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

  // another flower, or none: the Play starts over and the map draws its own reading
  // biome-ignore lint/correctness/useExhaustiveDependencies: the map is what resets it
  useEffect(() => {
    setAt(-1);
    setPlaying(false);
    land.current(null);
  }, [map]);

  // each moment shown: read it and hand it to the map; then, playing, the next after a while, until the last
  useEffect(() => {
    const step = steps[at];
    if (!flower || !step) return;
    let gone = false;
    void readComposed(flower.map, [step.snapshot], view).then((r) => {
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
    });
    const next = playing
      ? window.setTimeout(() => {
          if (at + 1 < steps.length) setAt(at + 1);
          else setPlaying(false);
        }, PLAY_STEP)
      : 0;
    return () => {
      gone = true;
      window.clearTimeout(next);
    };
  }, [at, playing, flower, steps, view]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setAt((now) => (now < 0 || now >= steps.length - 1 ? 0 : now + 1));
    setPlaying(true);
  };
  return { at, playing, toggle };
}
