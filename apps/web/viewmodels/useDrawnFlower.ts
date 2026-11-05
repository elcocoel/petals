// Flowers draw themselves from their specs. Each one is drawn once and kept, so a row can show its
// picture and clicking back to an earlier flower is immediate.
import { useEffect, useMemo, useRef, useState } from 'react';
import { drawFlower } from '../lib/agent-client.ts';
import type { Drawing } from '../lib/panel-view.ts';

export function useDrawnFlowers(specs: { key: string; spec: unknown }[]): Record<string, Drawing> {
  const [drawn, setDrawn] = useState<Record<string, Drawing>>({});
  const asked = useRef(new Set<string>());
  const wanted = useMemo(() => new Map(specs.map((s) => [s.key, JSON.stringify(s.spec)])), [specs]);

  useEffect(() => {
    for (const [key, specJson] of wanted) {
      if (asked.current.has(key)) continue;
      asked.current.add(key);
      void drawFlower(specJson).then(
        (out) => setDrawn((d) => ({ ...d, [key]: out })),
        (e) =>
          setDrawn((d) => ({
            ...d,
            [key]: { failed: e instanceof Error ? e.message : String(e) },
          })),
      );
    }
  }, [wanted]);

  return drawn;
}
