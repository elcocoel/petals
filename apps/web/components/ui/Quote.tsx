// The one illustrated quote, wherever a quote shows: the lobby's band, /make's empty canvas. The drawing has
// no box: its paper is multiplied into whatever ground it sits on and its edges fade out. Who said it is in
// mono under the words. `room` says how much it's given: a band of its own (the lobby) lays the drawing and
// the words side by side on the split from a wide window, the words in the title's size, as a section's
// head; a column (beside the boxes on /make's canvas) keeps the drawing over the words at every width.
// Where it sits, and the band around it, are the page's. Props only; the quotes are lib/power-quotes.ts's,
// one per visit (viewmodels/usePowerQuote.ts).
import type { PowerQuoteItem } from '../../lib/power-quotes.ts';
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
  return (
    <figure className={`m-0 grid grid-cols-1 items-center gap-block-gap ${look.grid}`}>
      {/* biome-ignore lint/performance/noImgElement: a still illustration, served as it is */}
      <img
        className="block h-auto w-full mix-blend-multiply mask-radial-closest-side mask-radial-from-60% mask-radial-to-100%"
        src={quote.image}
        width={960}
        height={720}
        loading="lazy"
        alt=""
      />
      <div className="flex flex-col gap-block-gap">
        <blockquote className={`m-0 text-balance ${look.words}`}>“{quote.quote}”</blockquote>
        <figcaption>
          <Mono tone="muted">{quote.author}</Mono>
        </figcaption>
      </div>
    </figure>
  );
}
