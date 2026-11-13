// What a map's token is worth, in people's words: a petal's dollars in its box, the map's total and its
// token's supply on its page, each with where and when, and "No price" when there's none. On the server's own
// fixture, ENS's delegates priced by DefiLlama.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { dollars, type MapValue, mapWorth, petalWorth } from '../lib/value-view.ts';

const fixture = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../../packages/core/schema/fixtures/value.v1.json'),
    'utf8',
  ),
);
// a card carries the stored value with its own sums (packages/tools/src/value-store.ts)
const card: MapValue = {
  ...fixture,
  supply_usd: '443965579.00',
  total_usd: fixture.totals[0].usd,
};

describe('dollars as people read them', () => {
  test('whole above a hundred, cents above a cent, three figures below', () => {
    expect(dollars('17697346.57')).toBe('$17,697,347');
    expect(dollars(4.43965579)).toBe('$4.44');
    expect(dollars(0.001234)).toBe('$0.00123');
  });
});

describe("a petal's dollars", () => {
  test('its amount at the price, with where and when', () => {
    const w = petalWorth('1000', 'delegated_votes', card);
    // an outside source's price links where it was read; the chain's supply, read by Petals, doesn't
    expect(w).toEqual({
      text: '$4,440 at $4.44 per ENS',
      source: 'DefiLlama, 11 Nov 2026',
      link: 'https://coins.llama.fi/prices/current/ethereum:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72',
    });
  });
  test('no price says so; another measure, or no value, says nothing', () => {
    expect(petalWorth('1000', 'delegated_votes', { ...card, price: null })).toBe('no price');
    expect(petalWorth('1000', 'balance', card)).toBeNull();
    expect(petalWorth('1000', 'delegated_votes', null)).toBeNull();
  });
});

describe("the map's worth", () => {
  test("the reading's total and the supply, each at the price, with their sources", () => {
    expect(mapWorth(card)).toEqual([
      {
        text: '$17,697,347 in this reading: 3,986,198 ENS at $4.44',
        source: 'DefiLlama, 11 Nov 2026',
        link: 'https://coins.llama.fi/prices/current/ethereum:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72',
      },
      { text: 'Supply 100,000,000 ENS, $443,965,579', source: 'the chain, 11 Nov 2026' },
    ]);
  });
  test('no price says so, and no value says nothing', () => {
    expect(mapWorth({ ...card, price: null })).toBe('no price');
    expect(mapWorth(null)).toBeNull();
  });
});
