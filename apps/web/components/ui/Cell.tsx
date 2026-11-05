// Petals / Cell 12:16, and Petals / Cell repeat 24:209: 7 by 4 of the same cell, from one <symbol>.
// Both scale with their column. Mint on mint vanishes, as it does in Figma's closing section.
import { useId } from 'react';
import { cell } from '../../lib/figures.ts';
import { Drawing, drawMarks } from './Drawing.tsx';

export function Cell() {
  return <Drawing drawing={cell} className="h-auto w-full" />;
}

/** The repeat's own geometry, from its component in Figma. */
const REPEAT = { width: 480, height: 260, columns: 7, rows: 4 };
const AT = { x: 17, y: 6, stepX: 64, stepY: 62, width: 63, height: 57.2727 };

export function CellRepeat() {
  const id = useId();
  const cells = Array.from({ length: REPEAT.rows * REPEAT.columns }, (_, i) => ({
    x: AT.x + (i % REPEAT.columns) * AT.stepX,
    y: AT.y + Math.floor(i / REPEAT.columns) * AT.stepY,
  }));
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${REPEAT.width} ${REPEAT.height}`}
      className="h-auto w-full"
    >
      <symbol id={id} viewBox={`0 0 ${cell.width} ${cell.height}`}>
        {drawMarks(cell)}
      </symbol>
      {cells.map(({ x, y }) => (
        <use key={`${x},${y}`} href={`#${id}`} x={x} y={y} width={AT.width} height={AT.height} />
      ))}
    </svg>
  );
}
