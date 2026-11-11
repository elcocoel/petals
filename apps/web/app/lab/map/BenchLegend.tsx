'use client';
// The legend on the map bench (design/legend.md, design/overlays.md; #92, #95): one of the overlays, top
// right, read only, in the person's view, with the maps' own keys. Below md it's folded to its bar at the
// bottom right, as the chain list is folded at the top, so the two never cover the map or each other.
import type { View } from '@petal/core/types';
import { EVERY_FLOWER, inUse } from '@petal/core/view';
import { useEffect, useState } from 'react';
import { ViewLegend } from '../../../components/ViewLegend.tsx';
import type { LegendKey } from '../../../lib/flower-view.ts';

export function BenchLegend({ view, keys }: { view: View; keys: LegendKey[] }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!window.matchMedia('(min-width: 48rem)').matches) setOpen(false);
  }, []);
  return (
    // on a phone it sits at the foot, so it never meets the chain list at the top
    <div className="fixed right-space-16 bottom-space-16 md:top-space-16 md:bottom-auto">
      <ViewLegend
        view={view}
        drawn={inUse(view, EVERY_FLOWER)}
        pieces={EVERY_FLOWER}
        keys={keys}
        fold={{ open, onToggle: () => setOpen((now) => !now) }}
      />
    </div>
  );
}
