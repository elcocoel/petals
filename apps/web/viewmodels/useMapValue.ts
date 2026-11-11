// What a flower's map's token is worth (board #91): its map's card's value, read once per map, so a petal's box can
// say its dollars. Null until it's read, and when the map has none.
import { mapOf } from '@petal/core';
import type { Snapshot, Spec } from '@petal/core/types';
import { useEffect, useRef, useState } from 'react';
import { readMapValue } from '../lib/agent-client.ts';
import type { MapValue } from '../lib/value-view.ts';

/** The map a spec draws, by core's own rule: its network's address, in one form. */
export const mapOfSpec = (spec: Spec) => mapOf({ network: spec.network } as unknown as Snapshot);

export function useMapValue(spec: Spec | null | undefined): MapValue | null {
  const map = spec ? mapOfSpec(spec) : null;
  const [values, setValues] = useState<Record<string, MapValue | null>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!map || asked.current.has(map)) return;
    asked.current.add(map);
    void readMapValue(map).then((v) => setValues((all) => ({ ...all, [map]: v })));
  }, [map]);
  return (map && values[map]) || null;
}
