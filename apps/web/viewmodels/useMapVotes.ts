// A flower's map's proposals as its vote ring: read once per map, as its value is (useMapValue). Null until
// they're read, and when the map has none.
import type { Spec } from '@petal/core/types';
import { useEffect, useRef, useState } from 'react';
import { readMapProposals } from '../lib/agent-client.ts';
import { type VoteRing, voteRing } from '../lib/vote-ring.ts';
import { mapOfSpec } from './useMapValue.ts';

export function useMapVotes(spec: Spec | null | undefined): VoteRing | null {
  const map = spec ? mapOfSpec(spec) : null;
  const [rings, setRings] = useState<Record<string, VoteRing | null>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!map || asked.current.has(map)) return;
    asked.current.add(map);
    void readMapProposals(map).then((p) => setRings((all) => ({ ...all, [map]: voteRing(p) })));
  }, [map]);
  return (map && rings[map]) || null;
}
