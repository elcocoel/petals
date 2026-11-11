'use client';
// The legend on the map bench (design/legend.md, design/overlays.md; #92, #95): one of the overlays, top
// right, read only, in the person's view, with the maps' own keys. Folded to its bar below md, as the chain
// list is, so the two never cover the map on a phone.
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
    <div className="fixed top-space-16 right-space-16">
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
