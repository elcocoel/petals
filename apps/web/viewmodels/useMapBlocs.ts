// A map's voting blocs (#94), read once per map, as its votes are (useMapVotes): for the legend's Highlight row,
// whose chosen bloc's members the map highlights inside the flower (LandscapeAt.highlight). Null until they're
// read, and when the map has none.
import type { Blocs } from '@petal/core';
import { useEffect, useRef, useState } from 'react';
import { readMapBlocs } from '../lib/agent-client.ts';

export function useMapBlocs(map: string | null | undefined): Blocs | null {
  const [read, setRead] = useState<Record<string, Blocs | null>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!map || asked.current.has(map)) return;
    asked.current.add(map);
    void readMapBlocs(map).then((b) => setRead((all) => ({ ...all, [map]: b })));
  }, [map]);
  return (map && read[map]) || null;
}
