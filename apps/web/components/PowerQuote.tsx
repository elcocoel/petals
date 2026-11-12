// One illustrated power quote (#89), for a screen with nothing on it yet: the picture, the words, who said them.
// Props only; the quotes are lib/power-quotes.ts's, picked by viewmodels/usePowerQuote.ts.
import type { PowerQuoteItem } from '../lib/power-quotes.ts';

export function PowerQuote({ quote }: { quote: PowerQuoteItem }) {
  return (
    <figure className="m-0 flex max-w-tile-width flex-col items-center gap-text-gap text-center">
      <img src={quote.image} alt="" className="w-full" />
      <blockquote className="m-0 type-lead">“{quote.quote}”</blockquote>
      <figcaption className="type-caption text-muted">— {quote.author}</figcaption>
    </figure>
  );
}
