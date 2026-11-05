// What a snapshot says about itself: source links and units, for the flower beside it. Read once each.
import { useEffect, useRef, useState } from 'react';
import { readSnapshotFacts, type SnapshotFacts } from '../lib/agent-client.ts';

const NONE: SnapshotFacts = { sources: {}, units: {} };

export function useSnapshotFacts(sha256: string | null): SnapshotFacts {
  const [facts, setFacts] = useState<Record<string, SnapshotFacts>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (!sha256 || asked.current.has(sha256)) return;
    asked.current.add(sha256);
    void readSnapshotFacts(sha256).then((f) => setFacts((all) => ({ ...all, [sha256]: f })));
  }, [sha256]);

  return (sha256 && facts[sha256]) || NONE;
}
