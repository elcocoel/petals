// value/v1: a map's token in dollars, its reading's totals, and each petal's value as a piece of
// data beside the snapshot's. No price: no pieces and no dollars, never a guess.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { Snapshot } from '../src/types/index.ts';
import { usdString, type Value, validateValue, valuePieces, valueTotals } from '../src/values.ts';

const AT = '2026-11-11T14:00:00.000Z';
const UNI = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const holding = (participant: string, amount: string, measure = 'balance', asset = UNI) => ({
  participant,
  asset,
  measure,
  amount,
  amount_raw: '0',
  unit: 'UNI',
  as_of: AT,
  source: 's',
});
const SNAP = {
  holdings: [
    holding('0xaaa', '1000'),
    holding('0xbbb', '250.5'),
    holding('0xaaa', '7', 'delegated_votes'),
    holding('0xccc', '3', 'balance', 'other-asset'),
  ],
} as unknown as Snapshot;
const PRICE = { usd: 6.49, source: '1click', ref: `nep141:eth-${UNI}.omft.near`, at: AT };
const value = (price: Value['price']): Value => ({
  petal: 'value/v1',
  about: `eip155:1:${UNI}`,
  asset: { id: UNI, symbol: 'UNI' },
  price,
  supply: {
    amount: '1000000000',
    unit: 'UNI',
    source: 'chain',
    ref: `totalSupply() on eip155:1:${UNI}`,
    at: AT,
  },
  snapshot: 'a'.repeat(64),
  measure: 'balance',
  totals: valueTotals(SNAP, UNI, price),
  read_at: AT,
});

describe('value/v1', () => {
  test('dollars as cents, or three significant figures below a cent', () => {
    expect(usdString(6490.123)).toBe('6490.12');
    expect(usdString(0.000123456)).toBe('0.000123');
    expect(usdString(0)).toBe('0');
  });

  test("a reading's totals: each measure held in the asset, at the price; other assets aren't counted", () => {
    expect(valueTotals(SNAP, UNI, PRICE)).toEqual([
      { measure: 'balance', unit: 'UNI', amount: '1250.5', usd: '8115.74' },
      { measure: 'delegated_votes', unit: 'UNI', amount: '7', usd: '45.43' },
    ]);
    // with no price, the amounts and no dollars
    expect(valueTotals(SNAP, UNI, null).map((t) => t.usd)).toEqual([null, null]);
  });

  test('each petal’s value is a piece of data per measure, inferred, as of the price, and no price gives none', () => {
    const pieces = valuePieces(SNAP, value(PRICE));
    expect(pieces.map((p) => p.name)).toEqual(['balance_usd', 'delegated_votes_usd']);
    expect(pieces[0]).toMatchObject({
      kind: 'amount',
      unit: 'USD',
      standing: 'inferred',
      as_of: AT,
      values: [
        { participant: '0xaaa', value: '6490.00' },
        { participant: '0xbbb', value: '1625.75' },
      ],
    });
    expect(pieces[0]?.layer).toMatch(/^[0-9a-f]{64}$/);
    expect(valuePieces(SNAP, value(null))).toEqual([]);
    expect(valuePieces(SNAP, null)).toEqual([]);
  });

  test('a value, priced or not, is a valid value/v1; a guessed field is refused', () => {
    expect(validateValue(value(PRICE)).ok).toBe(true);
    expect(validateValue(value(null)).ok).toBe(true);
    expect(validateValue({ ...value(PRICE), estimate: '1' }).ok).toBe(false);
  });
});

describe('value/v2', () => {
  const fixture = () =>
    JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'schema', 'fixtures', 'value.v2.json'), 'utf8'),
    );
  test("value/v1 with the treasury: Arbitrum's named wallets, each asset priced, and the total of the priced", () => {
    const v = fixture();
    expect(validateValue(v).ok).toBe(true);
    expect(v.treasury.items.map((i: { asset: { symbol: string } }) => i.asset.symbol)).toEqual([
      'ARB',
      'ETH',
      'USDC',
    ]);
    expect(v.treasury.total).toMatchObject({ priced: 3, unpriced: 0 });
  });

  test('an asset says where it was read, a reading or a call; a value/v2 holds its treasury, null when none was read', () => {
    const v = fixture();
    const nowhere = { ...v.treasury.items[0], source: { at: v.read_at } };
    expect(validateValue({ ...v, treasury: { ...v.treasury, items: [nowhere] } }).ok).toBe(false);
    expect(validateValue({ ...v, treasury: null }).ok).toBe(true);
    const { treasury: _t, ...without } = v;
    expect(validateValue(without).ok).toBe(false);
  });
});

describe('value/v3', () => {
  const fixture = () =>
    JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'schema', 'fixtures', 'value.v3.json'), 'utf8'),
    );
  test("value/v2 with circulating, max and market cap, each naming its source: Uniswap's, with DefiLlama's treasury", () => {
    const v = fixture();
    expect(validateValue(v).ok).toBe(true);
    expect(v.circulating.source).toBe('coingecko');
    expect(v.treasury.items[0].source.ref).toBe(
      'Ethereum-OwnTokens (https://api.llama.fi/treasury/uniswap)',
    );
  });

  test('each amount names where it came from; max may say there is none; market cap may be absent', () => {
    const v = fixture();
    const { source: _s, ...nameless } = v.circulating;
    expect(validateValue({ ...v, circulating: nameless }).ok).toBe(false);
    const none = { amount: null, source: 'chain', ref: 'max_inflation_rate 1/40', at: v.read_at };
    expect(validateValue({ ...v, max: none }).ok).toBe(true);
    expect(validateValue({ ...v, circulating: null, max: null }).ok).toBe(true);
    const { market_cap: _m, ...noCap } = v;
    expect(validateValue(noCap).ok).toBe(true);
    const { circulating: _c, ...without } = v;
    expect(validateValue(without).ok).toBe(false);
  });
});
