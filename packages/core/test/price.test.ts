// price/v2 (Elco, 10 Nov: "there's three components to the price"): NEAR AI's bill, plus a base fee (each
// part a switch), plus the person's tip, a donation at a percent of their usage on a scale they set. Every
// switch off and a tip of 0 is Petals at cost.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { baseFee, type Price, priceHash, tipAllowed, tipOn, tipPercentOf } from '../src/index.ts';

const FIXTURE = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'schema',
  'fixtures',
  'price.v2.json',
);
const off = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Price;
const on = (f: (p: Price) => void): Price => {
  const p = structuredClone(off);
  f(p);
  return p;
};

describe('price/v2', () => {
  test('every switch off: no base fee on anything', () => {
    expect(baseFee(off, { kind: 'call', billed_usd: 0.01 })).toBe(0);
    expect(baseFee(off, { kind: 'turn', tools: { get_snapshot: 3 } })).toBe(0);
    expect(baseFee(off, { kind: 'top_up', usd: 5 })).toBe(0);
  });

  test('the base fee: a percent per call and per top-up, an amount per turn and per tool by name', () => {
    const p = on((x) => {
      x.base.usage = { on: true, percent: 10 };
      x.base.top_up = { on: true, percent: 3 };
      x.base.per_turn = { on: true, usd: 0.002 };
      x.base.per_tool = { on: true, usd: { get_snapshot: 0.001 } };
    });
    expect(baseFee(p, { kind: 'call', billed_usd: 0.01 })).toBe(0.001);
    expect(baseFee(p, { kind: 'top_up', usd: 5 })).toBe(0.15);
    expect(baseFee(p, { kind: 'turn', tools: { get_snapshot: 2, look_up: 4 } })).toBe(0.004);
  });

  test('a free allowance: no base fee until NEAR AI has billed that much', () => {
    const p = on((x) => {
      x.base.usage = { on: true, percent: 10 };
      x.base.free = { on: true, usd: 1 };
    });
    expect(baseFee(p, { kind: 'call', billed_usd: 0.01 }, 0.5)).toBe(0);
    expect(baseFee(p, { kind: 'call', billed_usd: 0.01 }, 1)).toBe(0.001);
  });

  test("the tip: a percent of the bill, 0 by default, on the price's scale", () => {
    expect(tipPercentOf(off, null)).toBe(0);
    expect(tipPercentOf(off, 15)).toBe(15);
    expect(tipOn(0.01, 15)).toBe(0.0015);
    expect(tipOn(0.01, 0)).toBe(0);
    expect(tipAllowed(off, 0)).toBe(true);
    expect(tipAllowed(off, 50)).toBe(true);
    expect(tipAllowed(off, 51)).toBe(false);
    expect(tipAllowed(off, 2.5)).toBe(false);
  });

  test('a price is named by its hash', () => {
    expect(priceHash(off)).toMatch(/^[0-9a-f]{64}$/);
    expect(priceHash(on((x) => (x.base.usage.on = true)))).not.toBe(priceHash(off));
  });
});
