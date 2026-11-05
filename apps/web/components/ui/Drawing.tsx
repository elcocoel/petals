// A drawing from lib/figures.ts as inline SVG, each mark painted with a role, so it follows the
// surface it sits on. Sized by whoever places it: a className outside an <svg>, or x, y, width and
// height inside one.
import type { ReactNode } from 'react';
import type { FigureDrawing, FigurePaint } from '../../lib/figures.ts';

const PAINT: Record<FigurePaint, string> = {
  line: 'var(--figure-line)',
  petal: 'var(--figure-petal)',
  accent: 'var(--figure-accent)',
  surface: 'var(--surface)',
};

/** The marks alone, for a drawing used many times from one <symbol>. */
export function drawMarks(drawing: FigureDrawing): ReactNode {
  return drawing.marks.map((mark) => (
    <path
      key={mark.d}
      d={mark.d}
      fill={mark.fill ? PAINT[mark.fill] : 'none'}
      stroke={mark.stroke ? PAINT[mark.stroke] : undefined}
      strokeWidth={mark.strokeWidth}
      strokeOpacity={mark.strokeOpacity}
    />
  ));
}

export function Drawing({
  drawing,
  className,
  x,
  y,
  width,
  height,
}: {
  drawing: FigureDrawing;
  className?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      className={className}
      x={x}
      y={y}
      width={width}
      height={height}
    >
      {drawMarks(drawing)}
    </svg>
  );
}
