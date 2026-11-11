// The hero's petal: a symbol, not a reading (Elco, 11 Nov: "an evolving petal (symbolic, iconic) as it goes,
// just so it's not outdated as I evolve the look"). Its own simple drawing, not the live renderer: straight-
// edged wedges around a centre, a stable line between them, in the figure's two paints. It grows with the
// simulated chat: a seed (0), every account an equal petal (1), each one's height its share (2), and the few
// that hold the most lit (3). Under version 2 the wedges grow to their new heights around the clock
// (figure.grow, app/versions/v2.css).
import type { CSSProperties } from 'react';

/** How many wedges: enough to read as many accounts, few enough to read as a sign. */
const COUNT = 24;
/** The wedges' length at full height, in the drawing's units; the centre is at 0,0. */
const R = 100;
/** The hole at the centre. */
const HOLE = 16;
/** How many of the tallest are lit at the last stage. */
const LIT = 3;
/** Every petal's height when they're all equal. */
const EVEN = 0.42;

/** Tallest at twelve o'clock, then shorter around the clock, as a reading sorts its petals. */
const shares = Array.from({ length: COUNT }, (_, i) => 0.3 + 0.7 * (1 - i / (COUNT - 1)) ** 1.8);

function wedge(i: number) {
  const step = (2 * Math.PI) / COUNT;
  const a = -Math.PI / 2 + i * step;
  const at = (t: number) => `${(R * Math.cos(t)).toFixed(2)},${(R * Math.sin(t)).toFixed(2)}`;
  return `0,0 ${at(a)} ${at(a + step)}`;
}

export type PetalStage = 0 | 1 | 2 | 3;

export function HeroPetal({ stage }: { stage: PetalStage }) {
  return (
    <svg
      data-b="figure"
      data-kind="symbol"
      aria-hidden="true"
      viewBox={`${-R - 4} ${-R - 4} ${2 * R + 8} ${2 * R + 8}`}
      className="block h-auto w-drawing-240"
    >
      {shares.map((share, i) => {
        const height = stage === 0 ? 0 : stage === 1 ? EVEN : share;
        return (
          <polygon
            // biome-ignore lint/suspicious/noArrayIndexKey: the wedges are fixed, one per position
            key={i}
            data-part="wedge"
            points={wedge(i)}
            fill={stage === 3 && i < LIT ? 'var(--figure-accent)' : 'var(--figure-petal)'}
            stroke="var(--surface)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ scale: height, '--a': i / COUNT } as CSSProperties}
          />
        );
      })}
      <circle r={HOLE} fill="var(--surface)" stroke="var(--text-primary)" strokeWidth={1.5} />
    </svg>
  );
}
