'use client';
// The bench's view: an empty SVG for the scene to draw in, filling the window. Nothing else on screen.
import { useMemo, useRef } from 'react';
import type { HoverWay } from './hover.ts';
import type { FlowerReading } from './model.ts';
import { useFlowerBench } from './useFlowerBench.ts';

export function FlowerBench({
  reading,
  hover,
  relations,
  scatter,
  probe,
}: {
  reading: FlowerReading;
  hover: HoverWay;
  relations: boolean;
  scatter: boolean;
  probe: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const options = useMemo(
    () => ({ reading, hover, relations, scatter, probe }),
    [reading, hover, relations, scatter, probe],
  );
  useFlowerBench(svg, options);
  return (
    <svg
      ref={svg}
      role="img"
      aria-label={reading.title}
      className="fixed inset-0 block size-full touch-none select-none bg-surface"
    />
  );
}
