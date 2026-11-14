'use client';
// The one illustrated quote, wherever a quote shows: the lobby's band, /make's empty canvas. The drawing has
// no box: its paper is multiplied into whatever ground it sits on and its edges fade out. Who said it is in
// mono under the words, and at that line's right end a button shows another quote: the next in the list,
// round again after the last, so every one of them can be seen. `room` says how much it's given: a band of
// its own (the lobby) lays the drawing and the words side by side on the split from a wide window, the words
// in the title's size, as a section's head; a column (beside the boxes on /make's canvas) keeps the drawing
// over the words at every width. Where it sits, and the band around it, are the page's. The quote handed in
// is where it starts (one per visit, viewmodels/usePowerQuote.ts); the quotes are lib/power-quotes.ts's.
import { useState } from 'react';
import { POWER_QUOTES, type PowerQuoteItem, quoteFor, quoteWords } from '../../lib/power-quotes.ts';
import { IconButton } from './IconButton.tsx';
import { Mono } from './Mono.tsx';

const ROOM = {
  band: { grid: 'lg:grid-cols-split-flip lg:gap-column-gap', words: 'type-title' },
  column: { grid: '', words: 'type-lead' },
} as const;

export function Quote({
  quote,
  room = 'band',
}: {
  quote: PowerQuoteItem;
  room?: keyof typeof ROOM;
}) {
  const look = ROOM[room];
  // how many times another quote was asked for since this one was handed in; a new one starts over
  const [given, setGiven] = useState(quote.id);
  const [steps, setSteps] = useState(0);
  if (given !== quote.id) {
    setGiven(quote.id);
    setSteps(0);
  }
  const shown =
    steps === 0 ? quote : quoteFor(POWER_QUOTES.findIndex((q) => q.id === quote.id) + steps);
  return (
    <figure className={`m-0 grid grid-cols-1 items-center gap-block-gap ${look.grid}`}>
      {/* biome-ignore lint/performance/noImgElement: a still illustration, served as it is */}
      <img
        className="block h-auto w-full mix-blend-multiply mask-radial-closest-side mask-radial-from-60% mask-radial-to-100%"
        src={shown.image}
        width={960}
        height={720}
        loading="lazy"
        alt=""
      />
      <div className="flex flex-col gap-block-gap">
        <blockquote className={`m-0 text-balance ${look.words}`}>“{shown.quote}”</blockquote>
        <figcaption className="flex items-center justify-between gap-text-gap">
          <Mono tone="muted">{shown.author}</Mono>
          {/* pressable even where the quote's ground lets the pointer through (/make's canvas) */}
          <span className="pointer-events-auto">
            <IconButton
              icon="arrow"
              label={quoteWords.next}
              tip="left"
              onClick={() => setSteps((n) => n + 1)}
            />
          </span>
        </figcaption>
      </div>
    </figure>
  );
}
