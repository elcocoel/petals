// A map's voting blocs, read once per map and period, as its votes are (useMapVotes): for the legend's
// Highlight row, whose chosen bloc's members the map highlights inside the flower (LandscapeAt.highlight). The
// period is the server's own (its recent votes) or all of them, so blocs can be seen across time periods.
// Null until they're read, and when the map has none.
import type { Blocs } from '@petal/core';
import { useEffect, useRef, useState } from 'react';
import { readMapBlocs } from '../lib/agent-client.ts';
import { type BlocSpan, spanAsk } from '../lib/bloc-words.ts';

export function useMapBlocs(
  map: string | null | undefined,
  span: BlocSpan = 'recent',
): Blocs | null {
  const [read, setRead] = useState<Record<string, Blocs | null>>({});
  const asked = useRef(new Set<string>());
  const key = map ? `${map}|${span}` : null;
  useEffect(() => {
    if (!map || !key || asked.current.has(key)) return;
    asked.current.add(key);
    void readMapBlocs(map, spanAsk(span)).then((b) => setRead((all) => ({ ...all, [key]: b })));
  }, [map, key, span]);
  return (key && read[key]) || null;
}
