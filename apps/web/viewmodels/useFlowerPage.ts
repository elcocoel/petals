// A flower on its own page, /f/<id> or a draft's link (one petal
// behaviour wherever a petal is touched). The same live flower as /make, drawn in the person's view, with
// the same box beside it: a hover lights and swells a petal, a click selects it and opens its detail, the
// ground lets it go, and Escape does too. Only the conversation is missing.
import { useEffect, useMemo, useState } from 'react';
import {
  type CanvasFlower,
  type CanvasHit,
  canvasPetal,
  flowerPanelView,
  nextCanvas,
  type PanelFlower,
  pickPlan,
} from '../lib/panel-view.ts';
import type { PanelSection } from '../lib/thread.ts';
import { petalWorth } from '../lib/value-view.ts';
import { useDrawnFlowers } from './useDrawnFlower.ts';
import { useMapValue } from './useMapValue.ts';
import { useMapVotes } from './useMapVotes.ts';
import { usePersonView } from './usePersonView.ts';
import { useSnapshotFacts } from './useSnapshotFacts.ts';

export function useFlowerPage(flower: PanelFlower) {
  const person = usePersonView();
  const toDraw = useMemo(() => [{ key: flower.key, spec: flower.spec }], [flower]);
  const drawing = useDrawnFlowers(toDraw, person)[flower.key];
  const facts = useSnapshotFacts(flower.spec.snapshot.sha256);
  const value = useMapValue(flower.spec);
  const votes = useMapVotes(flower.spec);
  const [petal, setPetal] = useState<string | null>(null);
  const [section, setSection] = useState<PanelSection>(null);
  // The page is the flower: its box is open from the start.
  const [boxOpen, setBoxOpen] = useState(true);

  // Adjusted during render, as /make does, so the canvas never paints a frame behind the box.
  const [canvas, setCanvas] = useState<CanvasFlower | null>(null);
  const nextHeld = nextCanvas(canvas, flower.key, drawing?.reading, undefined, person.hash);
  if (nextHeld !== canvas) setCanvas(nextHeld);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPetal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const panel = useMemo(
    () =>
      flowerPanelView({
        flower,
        drawing,
        selected: petal,
        sources: facts.sources,
        units: facts.units,
      }),
    [flower, drawing, petal, facts],
  );
  const selected = drawing?.petals?.find((p) => p.id === petal) ?? null;

  return {
    state: {
      canvas,
      /** its map's proposals on the ring, where it has any */
      votes,
      panel,
      selected: petal,
      petal: selected && canvasPetal(selected),
      unit: facts.units[flower.spec.selection.measure],
      /** the selected petal's dollars at its map's price */
      worth: selected ? petalWorth(selected.amount, flower.spec.selection.measure, value) : null,
      section,
      boxOpen,
    },
    actions: {
      /** A click on the canvas, as on /make: a petal or the centre opens the box, the ground lets go. */
      pick: (hit: CanvasHit) => {
        const { actions, opensBox } = pickPlan(hit, canvas, flower.key, []);
        for (const a of actions) if (a.type === 'select') setPetal(a.petal);
        if (opensBox) setBoxOpen(true);
      },
      closeDetail: () => setPetal(null),
      setSection: (next: PanelSection) => setSection((s) => (s === next ? null : next)),
      closeBox: () => setBoxOpen(false),
    },
  };
}
