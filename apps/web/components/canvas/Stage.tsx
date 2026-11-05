'use client';
// A pan-and-zoom stage (design/frontend-foundation.md, Canvas). Whatever it's given is its world: it
// knows nothing about flowers, so it can later hold many groups. Wheel zooms under the cursor, drag
// pans, double-click fits, and it fits whenever `fitKey` changes. The camera is in viewmodels/useStage.ts.
import type { ReactNode } from 'react';
import { useStage } from '../../viewmodels/useStage.ts';
import { Button } from '../ui/Button.tsx';

const HINT = 'Scroll to zoom. Drag to move. Double-click to fit.';

export function Stage({
  label,
  fitKey,
  pickAttribute,
  onPick,
  bleed = false,
  children,
}: {
  /** What a screen reader hears for the stage. */
  label: string;
  fitKey?: string;
  pickAttribute?: string;
  onPick?: (value: string | null) => void;
  /** Runs out to the edges of a column set in by the workspace inset, like a map in its window. */
  bleed?: boolean;
  /** SVG content, in world coordinates. */
  children: ReactNode;
}) {
  const stage = useStage({ fitKey, pickAttribute, onPick });
  return (
    <div
      className={`flex min-h-stage-height min-w-0 flex-1 flex-col ${bleed ? '-mx-column-gap' : ''}`}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <svg
          ref={stage.svg}
          role="img"
          aria-label={label}
          className="absolute inset-0 block size-full cursor-grab touch-none select-none active:cursor-grabbing"
        >
          <g ref={stage.world}>{children}</g>
        </svg>
      </div>
      <div
        className={`flex items-center justify-between gap-block-gap ${bleed ? 'px-column-gap' : ''}`}
      >
        <p className="type-mono-small text-muted">{HINT}</p>
        <Button variant="quiet" onClick={stage.fit}>
          Fit
        </Button>
      </div>
    </div>
  );
}
