// The landing's map: the global Power Map, not placeholder squares. Its data is megabytes, so it's asked for
// once, when its frame comes near the window (the adapter's readPowerMap).
import { type RefObject, useEffect, useState } from 'react';
import type { BenchLandscape } from '../landscape/land.ts';
import { readPowerMap } from '../lib/agent-client.ts';

/** How far ahead of the window the map starts loading, so it's there when someone arrives. */
const AHEAD = '800px';

export type LandingMap =
  | { state: 'waiting' }
  | { state: 'ready'; land: BenchLandscape }
  | { state: 'failed'; error: string };

export function useLandingMap(frame: RefObject<HTMLElement | null>): LandingMap {
  const [map, setMap] = useState<LandingMap>({ state: 'waiting' });
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let gone = false;
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        near.disconnect();
        readPowerMap()
          .then((body) => {
            if (gone) return;
            setMap(
              'error' in body
                ? { state: 'failed', error: body.error }
                : { state: 'ready', land: body },
            );
          })
          .catch((e: unknown) => {
            if (!gone)
              setMap({ state: 'failed', error: e instanceof Error ? e.message : String(e) });
          });
      },
      { rootMargin: AHEAD },
    );
    near.observe(el);
    return () => {
      gone = true;
      near.disconnect();
    };
  }, [frame]);
  return map;
}
