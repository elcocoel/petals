// A map's record of versions, for its history in the map's Information box (lib/map-history.ts): asked once a
// visit per map, when someone is in it; the same for every viewer, and again after a publication (`version`: a new
// version joins the record). Null until it's here, or if it can't be read.
import { useEffect, useState } from 'react';
import { readMapRecord } from '../lib/agent-client.ts';
import type { MapRecord } from '../lib/map-history.ts';

const asked = new Map<string, Promise<MapRecord | null>>();

const read = (map: string, version: string) => {
  const key = `${map}@${version}`;
  let p = asked.get(key);
  if (!p) {
    p = readMapRecord(map).catch(() => null);
    asked.set(key, p);
  }
  return p;
};

export function useMapRecord(map: string | null, version = ''): MapRecord | null {
  const [got, setGot] = useState<{ map: string; record: MapRecord | null } | null>(null);
  useEffect(() => {
    if (!map) return;
    let gone = false;
    void read(map, version).then((record) => {
      if (!gone) setGot({ map, record });
    });
    return () => {
      gone = true;
    };
  }, [map, version]);
  return map && got?.map === map ? got.record : null;
}
