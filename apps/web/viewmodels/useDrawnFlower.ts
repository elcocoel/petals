// A flower draws itself from its spec, where it was made in the thread.
import { useEffect, useState } from 'react';
import { type Drawn, drawFlower } from '../lib/agent-client.ts';

export function useDrawnFlower(spec: unknown): { drawn: Drawn | null; failed: string | null } {
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const specJson = JSON.stringify(spec);

  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const out = await drawFlower(specJson);
        if (!gone) setDrawn(out);
      } catch (e) {
        if (!gone) setFailed(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      gone = true;
    };
  }, [specJson]);

  return { drawn, failed };
}
