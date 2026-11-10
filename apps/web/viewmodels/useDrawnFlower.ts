// Flowers draw themselves from their specs, in the person's view (usePersonView). Each one is drawn once
// per view and kept, so a row can show its picture and clicking back to an earlier flower is immediate;
// when the person changes their view, every flower is drawn again in the new one.
import { useEffect, useMemo, useRef, useState } from 'react';
import { drawFlower } from '../lib/agent-client.ts';
import type { Drawing } from '../lib/panel-view.ts';
import type { PersonView } from '../lib/person-view.ts';

export function useDrawnFlowers(
  specs: { key: string; spec: unknown }[],
  person: PersonView,
): Record<string, Drawing> {
  const [drawn, setDrawn] = useState<Record<string, Drawing>>({});
  const asked = useRef(new Set<string>());
  const wanted = useMemo(() => new Map(specs.map((s) => [s.key, JSON.stringify(s.spec)])), [specs]);
  const { view, hash } = person;

  useEffect(() => {
    for (const [key, specJson] of wanted) {
      const at = `${hash} ${key}`;
      if (asked.current.has(at)) continue;
      asked.current.add(at);
      void drawFlower(specJson, view).then(
        (out) => setDrawn((d) => ({ ...d, [at]: out })),
        (e) =>
          setDrawn((d) => ({
            ...d,
            [at]: { failed: e instanceof Error ? e.message : String(e) },
          })),
      );
    }
  }, [wanted, view, hash]);

  return useMemo(
    () =>
      Object.fromEntries(
        [...wanted.keys()].flatMap((key) => {
          const d = drawn[`${hash} ${key}`];
          return d ? [[key, d]] : [];
        }),
      ),
    [wanted, drawn, hash],
  );
}
