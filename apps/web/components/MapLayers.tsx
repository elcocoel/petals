// A map's layers in its Information box (lib/map-layers.ts), with the period each layer's data covers and who
// mapped it: one row each, what it is on its first line, then its period, how much, and who mapped it or where
// it came from, quiet in mono, the outside source's arrow beside it. Props only.
import type { LayerLine } from '../lib/map-layers.ts';
import { Mono } from './ui/Mono.tsx';
import { SourceLink } from './ui/SourceLink.tsx';

export function MapLayers({ layers }: { layers: readonly LayerLine[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-space-8 p-0">
      {layers.map((l) => (
        <li key={l.key} className="flex flex-col">
          <span className="type-ui text-primary wrap-anywhere">{l.name}</span>
          <span className="flex min-w-0 items-center gap-space-4">
            <Mono as="span" tone="muted">
              {[l.period, l.count, l.by].filter(Boolean).join(' · ')}
            </Mono>
            {l.link && l.by && <SourceLink href={l.link} name={l.by} />}
          </span>
        </li>
      ))}
    </ul>
  );
}
