'use client';
// The flower, live: an empty SVG for the scene to draw in, filling the window. Nothing else on screen.
// The canvas is there with no flower too, as empty ground, and pressing it still leaves the cursor alone.
// Everything but the reading is an option the lab's bench asks for; the product's page asks for little.
import { useMemo, useRef } from 'react';
import { keepCursor } from '../viewmodels/useFloatBoxes.ts';
import type { HoverWay } from './hover.ts';
import type { FlowerReading } from './model.ts';
import type { FakeRelations } from './scene.ts';
import { useFlowerCanvas } from './useFlowerCanvas.ts';

export function FlowerCanvas({
  reading,
  hover = 'dock',
  relations = null,
  scatter = false,
  probe = false,
  readout = false,
}: {
  reading: FlowerReading | null;
  hover?: HoverWay;
  relations?: FakeRelations | null;
  scatter?: boolean;
  probe?: boolean;
  /** The tiny zoom and share in the corner: an instrument for tuning. */
  readout?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const options = useMemo(
    () => ({ reading, hover, relations, scatter, probe, readout }),
    [reading, hover, relations, scatter, probe, readout],
  );
  useFlowerCanvas(svg, options);
  return (
    // surface.canvas
    <svg
      ref={svg}
      {...(reading ? { role: 'img', 'aria-label': reading.title } : { 'aria-hidden': true })}
      onMouseDown={keepCursor}
      className="fixed inset-0 block size-full touch-none select-none bg-surface"
    />
  );
}
