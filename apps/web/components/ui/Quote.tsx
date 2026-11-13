// The one illustrated quote, wherever a quote shows: the lobby's band, /make's empty canvas. The drawing has
// no box: its paper is multiplied into whatever ground it sits on and its edges fade out. The words are in
// the title's size and who said them in mono, as a section's head. It reads its own room, not the window's
// (a container query): with room, the drawing and the words side by side on the split; without, the drawing
// over the words. Where it sits and the band around it are the page's. Props only; the quotes are
// lib/power-quotes.ts's, one per visit (viewmodels/usePowerQuote.ts).
import type { PowerQuoteItem } from '../../lib/power-quotes.ts';
import { Mono } from './Mono.tsx';

export function Quote({ quote }: { quote: PowerQuoteItem }) {
  return (
    <figure className="@container m-0 w-full">
      <div className="grid grid-cols-1 items-center gap-block-gap @3xl:grid-cols-split @3xl:gap-column-gap">
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
          <blockquote className="m-0 type-lead text-balance @3xl:type-title">
            “{quote.quote}”
          </blockquote>
          <figcaption>
            <Mono tone="muted">{quote.author}</Mono>
          </figcaption>
        </div>
      </div>
    </figure>
  );
}
