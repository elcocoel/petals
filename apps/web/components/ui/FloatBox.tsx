'use client';
// A box that floats over a canvas: a BarBox a hand can move and size. The conversation, the models and the
// flower's own box are this. With a `foot` it's two parts, one box (design/conversation.md): a light sheet
// rising out of a dark base, a little narrower, its foot in behind the base's edge, sized apart at the seam.
// It holds no state: where it is and what a hand does to it come from viewmodels/useFloatBoxes.ts, which
// writes directly to the element, so a drag never renders. Hidden until that has placed it, since only the
// browser knows the window. The edges are shown by the cursor alone, the seam by its line too.
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
  seam: Hold;
}

export function FloatBox({
  label,
  title,
  surface = 'ground',
  hand,
  closed = false,
  control,
  foot,
  footSurface = 'ink',
  solid = false,
  folded = false,
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
  /** The base the sheet rises out of, on its own surface: the conversation's input. */
  foot?: ReactNode;
  footSurface?: SurfaceName;
  /** It opens over another box (the flower's over the thread): its glass sits on a solid surface. */
  solid?: boolean;
  /** Folded to its bar by the page (the map's boxes): no line under the bar, so the box's own edge closes it. */
  folded?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      ref={hand.root}
      aria-label={label}
      onPointerDownCapture={hand.raise}
      // box.close
      hidden={closed}
      // the map reads where the boxes over it stand, so its names and notes keep clear of them (LOOK)
      data-float=""
      className="invisible fixed top-0 left-0 flex flex-col"
    >
      <BarBox
        kind="float"
        surface={surface}
        solid={solid}
        folded={folded}
        className={`flex min-h-0 flex-1 flex-col bg-surface ${foot ? 'mx-space-8 -mb-space-16' : ''}`}
        bar={
          control ? (
            <div className="flex items-center justify-between gap-text-gap">
              {title ? (
                <span className="min-w-0 truncate">
                  <Mono as="span">{title}</Mono>
                </span>
              ) : (
                <span />
              )}
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
        {/* its rows scroll above the box's rounded foot, so nothing is cut by the corner and the scroll bar stays
            inside it (Elco, 12 Nov, wave 4 walk: "things going out of the visual frame in this radius ... Even the
            scroll bar just falls out of the thing"); with a base, the base closes it instead */}
        {/* folded to its bar it holds nothing, so no foot: the foot would stand below the bar, unseen, and take
            the map's clicks there (LOOK, flow 17 on live) */}
        <div className={`flex min-h-0 flex-1 flex-col ${foot || folded ? '' : 'pb-space-32'}`}>
          <div
            className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none ${foot ? 'pb-space-16' : ''}`}
          >
            {children}
          </div>
        </div>
      </BarBox>
      {foot && (
        // box.split
        <div
          data-foot=""
          data-b="box"
          data-kind="float"
          data-surface={footSurface}
          className="relative z-10 flex shrink-0 flex-col border border-primary bg-surface"
        >
          <span
            aria-hidden="true"
            {...hand.seam}
            className="group/seam absolute inset-x-block-gap -top-space-4 flex h-space-8 cursor-row-resize touch-none items-center"
          >
            <span className="invisible h-px w-full scale-y-200 bg-accent group-hover/seam:visible group-active/seam:visible" />
          </span>
          {foot}
        </div>
      )}
      {(Object.keys(EDGE) as (keyof typeof EDGE)[]).map((edge) => (
        <span
          key={edge}
          aria-hidden="true"
          {...hand.edge[edge]}
          className={`absolute z-20 touch-none ${EDGE[edge]}`}
        />
      ))}
    </section>
  );
}
