// A map's card, for its layers in the map's Information box (lib/map-layers.ts): asked once a visit per map,
// when someone is in it; the same for every viewer. Null until it's here, or if it can't be read.
import { useEffect, useState } from 'react';
import { readMapCard } from '../lib/agent-client.ts';
import type { LayerCard } from '../lib/map-layers.ts';

const asked = new Map<string, Promise<LayerCard | null>>();

const read = (map: string) => {
  let p = asked.get(map);
  if (!p) {
    p = readMapCard(map).catch(() => null);
    asked.set(map, p);
  }
  return p;
};

export function useMapCard(map: string | null): LayerCard | null {
  const [got, setGot] = useState<{ map: string; card: LayerCard | null } | null>(null);
  useEffect(() => {
    if (!map) return;
    let gone = false;
    void read(map).then((card) => {
      if (!gone) setGot({ map, card });
    });
    return () => {
      gone = true;
    };
  }, [map]);
  return map && got?.map === map ? got.card : null;
}
