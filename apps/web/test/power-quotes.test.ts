// The illustrated power quotes (#89) for empty screens: Elco's 13, each with its picture.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { POWER_QUOTES, quoteFor } from '../lib/power-quotes.ts';

describe('the power quotes', () => {
  test('Elco’s final selection, each with its words, its author and a picture that’s there', () => {
    expect(POWER_QUOTES).toHaveLength(13);
    for (const q of POWER_QUOTES) {
      expect(q.quote.length, q.id).toBeGreaterThan(0);
      expect(q.author.length, q.id).toBeGreaterThan(0);
      expect(existsSync(join(import.meta.dirname, '..', 'public', q.image)), q.image).toBe(true);
    }
  });

  test('a seed always gives the same quote, and the next seed another', () => {
    expect(quoteFor(3)).toBe(quoteFor(3 + POWER_QUOTES.length));
    expect(quoteFor(-1)).toBe(POWER_QUOTES[POWER_QUOTES.length - 1]);
    expect(quoteFor(0)).not.toBe(quoteFor(1));
  });
});
