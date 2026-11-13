// A map's card, for its layers in the map's Information box (lib/map-layers.ts): asked once a visit per map,
// when someone is in it; the same for every viewer, and again after a publication (`version`: wave 8, a new layer
// joins the map). Null until it's here, or if it can't be read.
import { useEffect, useState } from 'react';
import { readMapCard } from '../lib/agent-client.ts';
import type { LayerCard } from '../lib/map-layers.ts';

const asked = new Map<string, Promise<LayerCard | null>>();

const read = (map: string, version: string) => {
  const key = `${map}@${version}`;
  let p = asked.get(key);
  if (!p) {
    p = readMapCard(map).catch(() => null);
    asked.set(key, p);
  }
  return p;
};

export function useMapCard(map: string | null, version = ''): LayerCard | null {
  const [got, setGot] = useState<{ map: string; card: LayerCard | null } | null>(null);
  useEffect(() => {
    if (!map) return;
    let gone = false;
    void read(map, version).then((card) => {
      if (!gone) setGot({ map, card });
    });
    return () => {
      gone = true;
    };
  }, [map, version]);
  return map && got?.map === map ? got.card : null;
}
