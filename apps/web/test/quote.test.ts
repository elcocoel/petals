// The one quote component: it carries its own way to another quote, and stepping from any quote reaches every
// one of them before coming round again.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Quote } from '../components/ui/Quote.tsx';
import { POWER_QUOTES, quoteFor, quoteWords } from '../lib/power-quotes.ts';

describe('the quote', () => {
  test('shows the quote handed in, with a button for another', () => {
    const first = POWER_QUOTES[0];
    if (!first) throw new Error('no quotes');
    const html = renderToStaticMarkup(createElement(Quote, { quote: first }));
    expect(html).toContain(first.image);
    expect(html).toContain(`aria-label="${quoteWords.next}"`);
  });

  test.each([0, 5, POWER_QUOTES.length - 1])(
    'from quote %i, stepping on shows every quote once, then the first again',
    (start) => {
      const n = POWER_QUOTES.length;
      const seen = Array.from({ length: n }, (_, k) => quoteFor(start + k).id);
      expect(new Set(seen).size).toBe(n);
      expect(quoteFor(start + n).id).toBe(seen[0]);
    },
  );
});
