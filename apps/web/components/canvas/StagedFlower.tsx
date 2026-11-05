'use client';
// A flower as something on a stage. This is where flowers meet the stage, which stays ignorant of them.
import { useFlowerDrawing } from '../../viewmodels/useFlowerDrawing.ts';

export function StagedFlower({ svg, selected }: { svg: string; selected: string | null }) {
  const { host, broken } = useFlowerDrawing<SVGGElement>(svg, selected, { inWorld: true });
  return (
    <g ref={host} className="flower-svg">
      {broken && <text>The SVG could not be read.</text>}
    </g>
  );
}
