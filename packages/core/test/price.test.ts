// price/v1 (Elco, 10 Nov): NEAR AI's bill, plus the fees switched on times the person's tip, plus the
// protocol's percent of the bill. Every switch off is Petals at cost.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { type Price, petalsCharge, priceHash, tipAllowed, tipOf } from '../src/index.ts';

const FIXTURE = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'schema',
  'fixtures',
  'price.v1.json',
);
const off = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Price;
const on = (f: (p: Price) => void): Price => {
  const p = structuredClone(off);
  f(p);
  return p;
};

describe('price/v1', () => {
  test('every switch off: Petals takes nothing, whatever the tip', () => {
    for (const e of [
      { kind: 'call', billed_usd: 0.01 },
      { kind: 'turn', tools: { get_snapshot: 3 } },
      { kind: 'top_up', usd: 5 },
    ] as const) {
      expect(petalsCharge(off, 5, e).total_usd).toBe(0);
    }
  });

  test('fees times the tip, plus the protocol rate, which the tip leaves alone', () => {
    const p = on((x) => {
      x.fees.usage = { on: true, percent: 10 };
      x.protocol = { on: true, percent: 5 };
    });
    expect(petalsCharge(p, 2, { kind: 'call', billed_usd: 0.01 })).toEqual({
      fees_usd: 0.001,
      tip: 2,
      protocol_usd: 0.0005,
      total_usd: 0.0025,
    });
    // a tip of 0 is free of fees, the protocol rate stays
    expect(petalsCharge(p, 0, { kind: 'call', billed_usd: 0.01 }).total_usd).toBe(0.0005);
  });

  test('per turn, per tool by name, and a percent of a top-up', () => {
    const p = on((x) => {
      x.fees.per_turn = { on: true, usd: 0.002 };
      x.fees.per_tool = { on: true, usd: { get_snapshot: 0.001 } };
      x.fees.top_up = { on: true, percent: 3 };
    });
    expect(
      petalsCharge(p, 1, { kind: 'turn', tools: { get_snapshot: 2, look_up: 4 } }).total_usd,
    ).toBe(0.004);
    expect(petalsCharge(p, 1, { kind: 'top_up', usd: 5 }).total_usd).toBe(0.15);
  });

  test('a free allowance: nothing on top until NEAR AI has billed that much', () => {
    const p = on((x) => {
      x.fees.usage = { on: true, percent: 10 };
      x.fees.free = { on: true, usd: 1 };
    });
    expect(petalsCharge(p, 1, { kind: 'call', billed_usd: 0.01 }, 0.5).total_usd).toBe(0);
    expect(petalsCharge(p, 1, { kind: 'call', billed_usd: 0.01 }, 1).total_usd).toBe(0.001);
  });

  test("the tip: the person's, else the default, within the price's bounds; a price is named by its hash", () => {
    expect(tipOf(off, null)).toBe(1);
    expect(tipOf(off, 3)).toBe(3);
    expect(tipAllowed(off, 10)).toBe(true);
    expect(tipAllowed(off, 11)).toBe(false);
    expect(priceHash(off)).toMatch(/^[0-9a-f]{64}$/);
    expect(priceHash(on((x) => (x.protocol.on = true)))).not.toBe(priceHash(off));
  });
});
