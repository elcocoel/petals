// A quote for an empty screen (lib/power-quotes.ts): one seed per page visit, picked once it's in the browser so
// the server's page and the browser's agree; each empty place passes its own offset, so two on one page differ.
import { useEffect, useState } from 'react';
import { POWER_QUOTES, type PowerQuoteItem, quoteFor } from '../lib/power-quotes.ts';

let visit: number | null = null;

export function usePowerQuote(offset = 0): PowerQuoteItem | null {
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => {
    visit ??= Math.floor(Math.random() * POWER_QUOTES.length);
    setSeed(visit);
  }, []);
  return seed === null ? null : quoteFor(seed + offset);
}
