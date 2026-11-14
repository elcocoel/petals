'use client';
// The Play's one control (lib/play.ts): play or pause, what it plays (the dated readings' own title, so a series
// of delegates never reads as the map's holders), and the moment the flower shows, in mono beside it; before the
// first press, the first and last moments. The map places it on each frame right under the flower it moves,
// clear of the map's boxes (useLandscape), as a box over the map.
import { momentOf, type PlayStep, playWords } from '../lib/play.ts';
import { IconButton } from './ui/IconButton.tsx';
import { Mono } from './ui/Mono.tsx';

export function PlayControl({
  steps,
  at,
  playing,
  onToggle,
  box,
  place,
}: {
  steps: readonly PlayStep[];
  /** the moment shown, by its place in the steps, or -1 before the first press */
  at: number;
  playing: boolean;
  onToggle: () => void;
  /** the map places the control under the flower on each frame */
  box: (el: HTMLElement | null) => void;
  /** as the map is laid: over the whole window, or in its area of the page */
  place: 'fixed' | 'absolute';
}) {
  const shown = steps[at];
  const first = steps[0];
  const last = steps.at(-1);
  return (
    <section
      ref={box}
      data-float=""
      data-b="box"
      data-kind="float"
      aria-label={playWords.play}
      className={`invisible ${place} top-0 left-0 flex w-max items-center gap-space-8 border border-primary bg-surface py-space-4 pr-space-16 pl-space-4`}
    >
      <IconButton
        icon={playing ? 'pause' : 'play'}
        label={playing ? playWords.pause : playWords.play}
        tip="right"
        onClick={onToggle}
      />
      <span className="type-ui">{(shown ?? first)?.title}</span>
      <Mono as="span">
        {shown
          ? momentOf(shown.as_of)
          : first && last
            ? `${momentOf(first.as_of)} – ${momentOf(last.as_of)}`
            : ''}
      </Mono>
    </section>
  );
}
