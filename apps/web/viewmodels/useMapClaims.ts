// What Petals' own mapping says about the map you're in (lib/map-claims.ts): asked for once a visit per map,
// when someone is in it, and kept while they move about; the same for every viewer. Null until it's here, or
// if it can't be read: the overlay isn't shown then.
import type { Claim } from '@petal/core/types';
import { useEffect, useState } from 'react';
import { readMapClaims } from '../lib/agent-client.ts';

const asked = new Map<string, Promise<Claim[] | null>>();

const read = (map: string) => {
  let p = asked.get(map);
  if (!p) {
    p = readMapClaims(map).then(
      (body) => body?.claims ?? null,
      () => null,
    );
    asked.set(map, p);
  }
  return p;
};

export function useMapClaims(map: string | null): Claim[] | null {
  const [got, setGot] = useState<{ map: string; claims: Claim[] | null } | null>(null);
  useEffect(() => {
    if (!map) return;
    let gone = false;
    void read(map).then((claims) => {
      if (!gone) setGot({ map, claims });
    });
    return () => {
      gone = true;
    };
  }, [map]);
  return map && got?.map === map ? got.claims : null;
}
