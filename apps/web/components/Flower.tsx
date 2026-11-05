'use client';
// The flower on its own page (T064): the SVG the API rendered, with petal details on click through
// data-p (renderer.md: hover and click by delegation on data-p; no script inside the SVG).
import type { PetalDetail } from '@petal/core/types';
import { useState } from 'react';
import { useFlowerDrawing } from '../viewmodels/useFlowerDrawing.ts';
import { PetalDetails } from './PetalDetails.tsx';

export function Flower({
  svg,
  petals,
  title,
}: {
  svg: string;
  petals: PetalDetail[];
  title?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { host, broken } = useFlowerDrawing<HTMLDivElement>(svg, selected);
  const petal = petals.find((p) => p.id === selected) ?? null;
  return (
    <figure className="flower">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: petals are pointer-only until the keyboard pass */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a delegate for the SVG's petals */}
      <div
        ref={host}
        className="flower-svg"
        title={title}
        onClick={(e) => {
          const hit = (e.target as Element | null)?.closest?.('[data-p]');
          setSelected(hit?.getAttribute('data-p') ?? null);
        }}
      />
      {broken && <p className="error">The SVG could not be read.</p>}
      <figcaption>
        <PetalDetails petal={petal} />
      </figcaption>
    </figure>
  );
}
