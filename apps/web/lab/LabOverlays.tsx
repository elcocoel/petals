'use client';
// Overlays with a hand in the lab: a view, a chain and a fold held here, so a choice redraws at
// once, as on /make and /map. Nothing is saved.
import type { View } from '@petal/core/types';
import { DEFAULT_VIEW, type Dimension, EVERY_FLOWER, inUse } from '@petal/core/view';
import { useState } from 'react';
import { NavItem } from '../components/ui/NavItem.tsx';
import { Overlay } from '../components/ui/Overlay.tsx';
import { ViewLegend } from '../components/ViewLegend.tsx';
import type { LegendKey } from '../lib/flower-view.ts';
import { viewChoices } from '../lib/person-view.ts';
import { withData, withScale } from '../lib/view-edit.ts';

export function LabLegend({ keys }: { keys: readonly LegendKey[] }) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [open, setOpen] = useState<Dimension | null>('height');
  return (
    <ViewLegend
      view={view}
      drawn={inUse(view, EVERY_FLOWER)}
      pieces={EVERY_FLOWER}
      keys={keys}
      edit={{
        defaults: DEFAULT_VIEW,
        choices: viewChoices(EVERY_FLOWER),
        open,
        onOpen: (d) => setOpen((now) => (now === d ? null : d)),
        onPick: (d, data) => setView((v) => withData(v, d, data, EVERY_FLOWER, DEFAULT_VIEW)),
        onScale: (d, s) => setView((v) => withScale(v, d, s)),
      }}
    />
  );
}

/** The Power Map's chains with their counts (the live map's, 11 Nov), as the chain list would draw them. */
const CHAINS = [
  ['Gnosis', '72'],
  ['Solana', '49'],
  ['Ethereum', '48'],
  ['Arbitrum', '14'],
  ['Base', '14'],
  ['NEAR', '2'],
] as const;

/** The chain list as one of the overlays: pick a chain, fold it to its bar. */
export function LabChains({ startsFolded = false }: { startsFolded?: boolean }) {
  const [chain, setChain] = useState('Solana');
  const [open, setOpen] = useState(!startsFolded);
  return (
    <Overlay title="Power Map" fold={{ open, onToggle: () => setOpen((now) => !now) }}>
      <ul className="m-0 flex list-none flex-col p-0">
        {CHAINS.map(([label, count]) => (
          <li key={label}>
            <NavItem
              onClick={() => setChain(label)}
              chosen={chain === label}
              label={label}
              trail={count}
            />
          </li>
        ))}
      </ul>
    </Overlay>
  );
}

/** The legend folding, as every overlay can. */
export function LabFoldingLegend({ keys }: { keys: readonly LegendKey[] }) {
  const [open, setOpen] = useState(true);
  return (
    <ViewLegend
      view={DEFAULT_VIEW}
      drawn={inUse(DEFAULT_VIEW, EVERY_FLOWER)}
      pieces={EVERY_FLOWER}
      keys={keys}
      fold={{ open, onToggle: () => setOpen((now) => !now) }}
    />
  );
}
