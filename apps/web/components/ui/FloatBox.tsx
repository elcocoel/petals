'use client';
// A box that floats over a canvas: a BarBox a hand can move and size. Input, output and the flower's own
// box are this. It holds no state: where it is and what a hand does to it come from
// viewmodels/useFloatBoxes.ts, which writes directly to the element, so a drag never renders. Hidden until
// that has placed it, since only the browser knows the window. The edges are shown by the cursor alone.
import type { SurfaceName } from '@petal/tokens';
import type { HTMLAttributes, ReactNode, RefCallback } from 'react';
import { BarBox } from './BarBox.tsx';
import { Mono } from './Mono.tsx';

type Hold = Pick<
  HTMLAttributes<HTMLElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onMouseDown'
>;

/** A control in the bar is pressed, not held: a press on it mustn't start moving the box. */
const leaveBarAlone = (e: { stopPropagation(): void }) => e.stopPropagation();

const EDGE = {
  n: 'inset-x-block-gap -top-space-4 h-space-8 cursor-ns-resize',
  s: 'inset-x-block-gap -bottom-space-4 h-space-8 cursor-ns-resize',
  e: 'inset-y-block-gap -right-space-4 w-space-8 cursor-ew-resize',
  w: 'inset-y-block-gap -left-space-4 w-space-8 cursor-ew-resize',
  nw: '-top-space-4 -left-space-4 size-block-gap cursor-nwse-resize',
  ne: '-top-space-4 -right-space-4 size-block-gap cursor-nesw-resize',
  sw: '-bottom-space-4 -left-space-4 size-block-gap cursor-nesw-resize',
  se: '-bottom-space-4 -right-space-4 size-block-gap cursor-nwse-resize',
} as const;

export interface FloatHand {
  root: RefCallback<HTMLElement>;
  raise: () => void;
  bar: Hold;
  edge: Record<keyof typeof EDGE, Hold>;
}

export function FloatBox({
  label,
  title,
  surface = 'ground',
  hand,
  closed = false,
  control,
  children,
}: {
  /** What a screen reader hears for the box. */
  label: string;
  /** The bar's words. Without them the bar is still there to hold. */
  title?: string | undefined;
  surface?: SurfaceName;
  hand: FloatHand;
  /** Not on the page for now. It keeps its place and its size for when it comes back. */
  closed?: boolean;
  /** Something the bar can do, at its far end. */
  control?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      ref={hand.root}
      aria-label={label}
      onPointerDownCapture={hand.raise}
      // box.close
      hidden={closed}
      className="invisible fixed top-0 left-0"
    >
      <BarBox
        kind="float"
        surface={surface}
        className="flex size-full flex-col bg-surface"
        bar={
          control ? (
            <div className="flex items-center justify-between gap-text-gap">
              {title ? <Mono>{title}</Mono> : <span />}
              <span className="shrink-0" onPointerDown={leaveBarAlone}>
                {control}
              </span>
            </div>
          ) : title ? (
            <Mono>{title}</Mono>
          ) : null
        }
        barClassName="min-h-control-height shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
        barProps={hand.bar}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none">
          {children}
        </div>
      </BarBox>
      {(Object.keys(EDGE) as (keyof typeof EDGE)[]).map((edge) => (
        <span
          key={edge}
          aria-hidden="true"
          {...hand.edge[edge]}
          className={`absolute touch-none ${EDGE[edge]}`}
        />
      ))}
    </section>
  );
}
