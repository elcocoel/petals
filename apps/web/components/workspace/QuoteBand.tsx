// One illustrated power quote, given a band of its own between the lobby's money and its work, as the landing
// gives its art room: the drawing on one side of the split, its paper multiplied into the band's ground and its
// edges fading out, so it has no box; on the other, the words in the title's size and who said them in mono, as
// a section's head. One per visit (viewmodels/usePowerQuote.ts). Props only. The quotes are
// lib/power-quotes.ts's.
import type { PowerQuoteItem } from '../../lib/power-quotes.ts';
import { Mono } from '../ui/Mono.tsx';
import { Section } from '../ui/Section.tsx';

export function QuoteBand({ quote }: { quote: PowerQuoteItem }) {
  return (
    <Section tone="mist" rule="top" layout="split" figure="start">
      {/* biome-ignore lint/performance/noImgElement: a still illustration, served as it is */}
      <img
        className="block h-auto w-full mix-blend-multiply mask-radial-closest-side mask-radial-from-60% mask-radial-to-100%"
        src={quote.image}
        width={960}
        height={720}
        loading="lazy"
        alt=""
      />
      <figure className="m-0 flex flex-col gap-block-gap self-center">
        <blockquote className="m-0 type-title text-balance">“{quote.quote}”</blockquote>
        <figcaption>
          <Mono tone="muted">{quote.author}</Mono>
        </figcaption>
      </figure>
    </Section>
  );
}
