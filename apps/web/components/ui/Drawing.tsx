// A drawing from lib/figures.ts as inline SVG, each mark painted with a role, so it follows the surface
// it sits on. One component for every thumb, glyph and cell: a kind and one of four sizes, or `fill` for
// as wide as its parent. Inside another <svg> it's placed with x, y, width and height instead.
// Petals / Cell 12:16, Petals / Cell repeat 24:209, Petals / Thumb, Petals / Glyph.
import { useId } from 'react';
import {
  cell,
  type DrawingKind,
  drawings,
  type FigureDrawing,
  type FigurePaint,
} from '../../lib/figures.ts';

const PAINT: Record<FigurePaint, string> = {
  line: 'var(--text-primary)',
  petal: 'var(--figure-petal)',
  accent: 'var(--figure-accent)',
  surface: 'var(--surface)',
};

const SIZES = {
  48: 'w-drawing-48',
  72: 'w-drawing-72',
  144: 'w-drawing-144',
  240: 'w-drawing-240',
  fill: 'w-full',
  // The small marks beside the workspace's words, kept apart with the rest of its sizes.
  'cell-small': 'w-cell-small',
  'cell-medium': 'w-cell-medium',
  'cell-large': 'w-cell-large',
} as const;

function marks(drawing: FigureDrawing) {
  return drawing.marks.map((mark) => (
    <path
      key={mark.d}
      d={mark.d}
      fill={mark.fill ? PAINT[mark.fill] : 'none'}
      stroke={mark.stroke ? PAINT[mark.stroke] : undefined}
      className={
        mark.stroke ? `figure-stroke ${mark.faint ? 'figure-faint' : ''}`.trim() : undefined
      }
    />
  ));
}

/** The repeat's own geometry, from its component in Figma. */
const REPEAT = { width: 480, height: 260, columns: 7, rows: 4 };
const AT = { x: 17, y: 6, stepX: 64, stepY: 62, width: 63, height: 57.2727 };

function CellRepeat({ className }: { className: string }) {
  const id = useId();
  const cells = Array.from({ length: REPEAT.rows * REPEAT.columns }, (_, i) => ({
    x: AT.x + (i % REPEAT.columns) * AT.stepX,
    y: AT.y + Math.floor(i / REPEAT.columns) * AT.stepY,
  }));
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${REPEAT.width} ${REPEAT.height}`} className={className}>
      <symbol id={id} viewBox={`0 0 ${cell.width} ${cell.height}`}>
        {marks(cell)}
      </symbol>
      {cells.map(({ x, y }) => (
        <use key={`${x},${y}`} href={`#${id}`} x={x} y={y} width={AT.width} height={AT.height} />
      ))}
    </svg>
  );
}

export function Drawing({
  kind,
  size = 'fill',
  x,
  y,
  width,
  height,
}: {
  kind: DrawingKind;
  size?: keyof typeof SIZES;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  const className = `h-auto shrink-0 ${SIZES[size]}`;
  if (kind === 'cell-repeat') return <CellRepeat className={className} />;
  const drawing = drawings[kind];
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      className={width === undefined ? className : undefined}
      x={x}
      y={y}
      width={width}
      height={height}
    >
      {marks(drawing)}
    </svg>
  );
}
