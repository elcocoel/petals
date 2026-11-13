// At some magnification a map shows its treasury and token price, switchable from the Tools box. Each map's
// card says them (value/v2's treasury, value/v1's price); the map shows them
// under the name once a flower is big enough, never where something else stands.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { type MapValue, worthWords } from '../lib/value-view.ts';

const text = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

const value = (over: Partial<MapValue>): MapValue => ({
  asset: { id: '0xc00e', symbol: 'COMP' },
  price: { usd: 19.8475469, source: 'defillama', ref: 'x', at: '2026-11-12T00:00:00Z' },
  supply: null,
  supply_usd: null,
  total_usd: null,
  measure: null,
  totals: [],
  snapshot: null,
  read_at: '2026-11-12T00:00:00Z',
  ...over,
});

test('the treasury and the token price, each where the card has it, never a guess', () => {
  expect(worthWords(value({ treasury_usd: '7034000.25', treasury_unpriced: 1 }))).toEqual([
    'Treasury $7,034,000 (1 unpriced)',
    '1 COMP = $19.85, 12 Nov',
  ]);
  // a price says it's a price, and its day: never a treasury of a few dollars
  expect(worthWords(value({ treasury_usd: null }))).toEqual(['1 COMP = $19.85, 12 Nov']);
  expect(worthWords(value({ price: null, treasury_usd: '60.81', treasury_unpriced: 0 }))).toEqual([
    'Treasury $60.81',
  ]);
  expect(worthWords(null)).toEqual([]);
});

test('under the name at some magnification, only where nothing stands, switched in the legend', () => {
  const scene = text('landscape/scene.ts');
  expect(scene).toMatch(
    /export const WORTH_AT: Row = \{ driver: 'flowerRadius', fadeIn: \[56, 72\] \};/,
  );
  expect(scene).toMatch(/const shown = worthOn \? fade\(WORTH_AT, r\) \* tone : 0;/);
  expect(scene).toMatch(
    /if \(inside && shown > 0\.01 && !placed\.some\(\(p\) => overlaps\(p, b\)\) && !onAFlower\(b, i\)\) \{/,
  );
  const canvas = text('landscape/LandscapeCanvas.tsx');
  expect(canvas).toMatch(/worth=\{\{ on: worth, onChange: setWorth \}\}/);
  expect(text('landscape/land.ts')).toMatch(
    /new Map\(maps\.map\(\(c\) => \[c\.id, worthWords\(c\.value\)\]\)\)/,
  );
});
