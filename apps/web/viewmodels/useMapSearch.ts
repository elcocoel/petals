// Search on the Power Map as someone types (board 105, lib/map-search.ts). One search at a time, and when it's back the
// words as they are now are searched, if they moved: so it keeps up with typing without a timer and without
// asking more than the server answers. As they type, without the reranker (about 0.35 s); Enter asks for the
// best order, the reranker's (2 to 3 s), and that order stays until the words change.
import { useCallback, useRef, useState } from 'react';
import { searchMap } from '../lib/agent-client.ts';
import type { SearchBody } from '../lib/map-search.ts';

interface Want {
  q: string;
  ordered: boolean;
}

export interface MapSearch {
  q: string;
  /** The words typed. */
  type: (q: string) => void;
  /** Enter: the same words in the reranker's order. */
  order: () => void;
  clear: () => void;
  /** The newest answer that's back, for the words it was asked for; body null when it couldn't answer. */
  got: { q: string; ordered: boolean; body: SearchBody | null } | null;
  /** What's on its way now. */
  busy: 'quick' | 'ordered' | null;
}

const same = (a: Want | null, b: Want) => !!a && a.q === b.q && (a.ordered || !b.ordered);

export function useMapSearch(): MapSearch {
  const [q, setQ] = useState('');
  const [got, setGot] = useState<MapSearch['got']>(null);
  const [busy, setBusy] = useState<MapSearch['busy']>(null);
  const want = useRef<Want>({ q: '', ordered: false });
  const done = useRef<Want | null>(null);
  const flying = useRef(false);

  const run = useCallback(async () => {
    if (flying.current) return;
    flying.current = true;
    for (;;) {
      const w = want.current;
      if (!w.q.trim() || same(done.current, w)) break;
      setBusy(w.ordered ? 'ordered' : 'quick');
      const body = await searchMap(w.q.trim(), w.ordered).catch(() => null);
      done.current = w;
      // an answer for words that have since moved still shows while the newer one is asked
      if (want.current.q.trim()) setGot({ q: w.q, ordered: w.ordered, body });
    }
    setBusy(null);
    flying.current = false;
  }, []);

  const type = useCallback(
    (next: string) => {
      setQ(next);
      want.current = { q: next, ordered: false };
      if (!next.trim()) {
        // nothing shows now, so the same words typed again are asked again
        done.current = null;
        setGot(null);
        return;
      }
      void run();
    },
    [run],
  );
  const order = useCallback(() => {
    if (!want.current.q.trim()) return;
    want.current = { ...want.current, ordered: true };
    void run();
  }, [run]);
  const clear = useCallback(() => type(''), [type]);

  return { q, type, order, clear, got, busy };
}
