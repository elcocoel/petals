// The claims the map's pins say (landscape/pins.ts), for the flowers drawn big enough to carry them: each map's
// claims read once a visit, shared with Insights (useMapClaims), and kept to those the person's Confidence lets
// through. Grows as more flowers come close; a map read before stays.
import type { Claim } from '@petal/core/types';
import { useEffect, useMemo, useState } from 'react';
import { readClaimsOnce } from './useMapClaims.ts';

export function useClaimPins(
  maps: readonly string[],
  keep: (claims: readonly Claim[]) => readonly Claim[],
): ReadonlyMap<string, readonly Claim[]> {
  const [read, setRead] = useState<ReadonlyMap<string, readonly Claim[]>>(new Map());
  const key = maps.join('\n');
  // the key says which maps
  // biome-ignore lint/correctness/useExhaustiveDependencies: maps are in the key
  useEffect(() => {
    let gone = false;
    for (const map of maps) {
      void readClaimsOnce(map).then((claims) => {
        if (gone || !claims) return;
        setRead((now) => (now.has(map) ? now : new Map(now).set(map, claims)));
      });
    }
    return () => {
      gone = true;
    };
  }, [key]);
  return useMemo(() => new Map([...read].map(([map, cs]) => [map, keep(cs)])), [read, keep]);
}
