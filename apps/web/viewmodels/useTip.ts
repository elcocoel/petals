// The person's tip (price/v2): read once when someone's signed in,
// with the price's scale for it (GET /api/v1/me/tip) and a typical turn (the catalogue's default model,
// measured). The slider moves a draft while a hand holds it; letting go keeps it (PUT), and if it isn't
// kept the draft goes and what's kept shows again, with the reason. No timer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { readCatalogue, readTip, saveTip } from '../lib/agent-client.ts';
import { type Tip, type TypicalTurn, typicalTurn } from '../lib/tip.ts';

export function useTip(signedIn: boolean) {
  const [kept, setKept] = useState<Tip | null>(null);
  const [turn, setTurn] = useState<TypicalTurn | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  // where the hand has it, for the letting go, which can come before a render does
  const held = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let gone = false;
    void readTip().then(
      (t) => !gone && setKept(t),
      () => {},
    );
    void readCatalogue().then(
      (c) => !gone && setTurn(typicalTurn(c)),
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [signedIn]);

  const slide = useCallback((p: number) => {
    held.current = p;
    setDraft(p);
  }, []);

  const set = useCallback(() => {
    const p = held.current;
    held.current = null;
    if (p === null || !kept || p === kept.tip_percent) {
      setDraft(null);
      return;
    }
    setFailed(null);
    saveTip(p).then(
      (t) => {
        setKept(t);
        setDraft(null);
      },
      (e: unknown) => {
        setFailed(e instanceof Error ? e.message : String(e));
        setDraft(null);
      },
    );
  }, [kept]);

  return {
    percent: draft ?? kept?.tip_percent ?? null,
    scale: kept ? { min: kept.min_percent, max: kept.max_percent, step: kept.step_percent } : null,
    turn,
    open,
    toggle: useCallback(() => setOpen((now) => !now), []),
    slide,
    set,
    failed,
  };
}
