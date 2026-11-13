// A map card's value (value/v2 on 11 Nov, value/v3 on 12 Nov): a treasury's priced total and how many of its assets have no
// price beside the token's own worth; none for a value/v1.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Value, validateValue } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { cardValue } from '../src/value-store.ts';

const fixture = (v: 1 | 2 | 3): Value => {
  const d = JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', '..', 'core', 'schema', 'fixtures', `value.v${v}.json`),
      'utf8',
    ),
  );
  const checked = validateValue(d);
  if (!checked.ok) throw new Error('fixture');
  return checked.value;
};

describe("a card's value", () => {
  test("value/v2: the treasury's priced total, and how many assets have no price", () => {
    expect(cardValue(fixture(2))).toMatchObject({
      treasury_usd: '415595873.80',
      treasury_unpriced: 0,
    });
  });
  test("value/v3: circulating, max and market cap as CoinGecko says them, and DefiLlama's treasury named as such", () => {
    expect(cardValue(fixture(3))).toMatchObject({
      circulating: { amount: '607715895.875979', source: 'coingecko' },
      max: { amount: '1000000000', source: 'coingecko' },
      market_cap: { usd: '3695648655', source: 'coingecko' },
      treasury_usd: '1620436914.59',
      treasury_source: {
        source: 'defillama',
        ref: "DefiLlama's treasury (https://api.llama.fi/treasury/uniswap)",
      },
    });
    expect(cardValue(fixture(2))).toMatchObject({
      treasury_source: { source: 'chain', ref: "its treasury's accounts, read from their chain" },
      circulating: null,
      max: null,
    });
  });
  test('value/v1: no treasury', () => {
    expect(cardValue(fixture(1))).toMatchObject({ treasury_usd: null, treasury_unpriced: null });
  });
});
