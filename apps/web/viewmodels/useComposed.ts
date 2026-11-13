// The reading a map draws for the layers switched on (the server's GET /api/v1/maps/:id/reading, composition.md
// §9: layers from different people add up to fuller maps): asked when the layers on change, or a publication
// joins the map (`version`), in the person's view. The same layers always give the same reading, so each
// answer is kept for the visit. While a new one comes, the last stays, so the flower never
// jumps back to the whole map. Null with every layer on: the map draws its own reading.
import { useEffect, useState } from 'react';
import { type ComposedReading, readComposed } from '../lib/agent-client.ts';

const asked = new Map<string, Promise<ComposedReading | null>>();

export function useComposed(
  map: string | null,
  layers: readonly string[] | null,
  view: string,
  version = '',
): ComposedReading | null {
  const [got, setGot] = useState<{ map: string; reading: ComposedReading | null } | null>(null);
  const key = map && layers ? `${map}|${layers.join(',')}|${view}|${version}` : null;
  // the key says everything the read depends on: map, layers, view and version
  // biome-ignore lint/correctness/useExhaustiveDependencies: map, layers and view are in the key
  useEffect(() => {
    if (!key || !map || !layers) return;
    let gone = false;
    let p = asked.get(key);
    if (!p) {
      p = readComposed(map, layers, view).catch(() => null);
      asked.set(key, p);
    }
    void p.then((reading) => {
      if (!gone) setGot({ map, reading });
    });
    return () => {
      gone = true;
    };
  }, [key]);
  return key && got?.map === map ? got.reading : null;
}
