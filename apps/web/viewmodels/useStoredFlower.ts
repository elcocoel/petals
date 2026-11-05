// A stored flower for the panel: what /f/[id] reads, read here from the browser. Each one is read once.
import { useEffect, useRef, useState } from 'react';
import { readFlower, type StoredFlower } from '../lib/agent-client.ts';

export type StoredRead = { flower: StoredFlower } | { failed: string };

export function useStoredFlower(id: string | null): StoredRead | null {
  const [read, setRead] = useState<Record<string, StoredRead>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (!id || asked.current.has(id)) return;
    asked.current.add(id);
    void readFlower(id).then(
      (flower) => setRead((r) => ({ ...r, [id]: { flower } })),
      (e) =>
        setRead((r) => ({
          ...r,
          [id]: { failed: e instanceof Error ? e.message : String(e) },
        })),
    );
  }, [id]);

  return id ? (read[id] ?? null) : null;
}
