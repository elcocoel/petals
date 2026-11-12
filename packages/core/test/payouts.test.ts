// payouts/v1 (12 Nov): what a DAO paid out, each payout dated by its own transfer and priced on that day; a
// period's payouts and their totals.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { type Payout, type Payouts, payoutsIn, validatePayouts } from '../src/payouts.ts';

const fixture = (): Payouts =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'schema', 'fixtures', 'payouts.v1.json'), 'utf8'),
  );

const NEAR = { id: 'NEAR', symbol: 'NEAR', decimals: 24 };
const pay = (to: string, raw: string, when: string | null, usd: string | null): Payout => ({
  from: 'near:mainnet:d.sputnik-dao.near',
  to: `near:mainnet:${to}`,
  asset: NEAR,
  amount: null,
  raw,
  when,
  proposal: {
    id: '1',
    kind: 'Transfer',
    ref: 'proposal:near:mainnet:d.sputnik-dao.near:1',
    at: '2026-01-01T00:00:00.000Z',
  },
  usd: usd ? { usd, price: 2, source: 'defillama', ref: 'test', at: when ?? '' } : null,
  evidence: null,
});

describe('payouts/v1', () => {
  test("the Build DAO's payouts: each from, to, what, how much, when paid, its proposal, its dollars that day", () => {
    const p = fixture();
    expect(validatePayouts(p).ok).toBe(true);
    expect(p.payouts[0]).toMatchObject({
      asset: { symbol: 'USDC', decimals: 6 },
      proposal: { kind: 'Transfer' },
      usd: { source: 'defillama' },
    });
  });

  test("what isn't known is null; what is said names where it's from", () => {
    const p = fixture();
    const first = p.payouts[0] as Payout;
    const unknown = { ...first, when: null, usd: null, evidence: null, amount: null };
    expect(validatePayouts({ ...p, payouts: [unknown] }).ok).toBe(true);
    const { source: _s, ...nameless } = first.usd as NonNullable<Payout['usd']>;
    expect(validatePayouts({ ...p, payouts: [{ ...first, usd: nameless }] }).ok).toBe(false);
    expect(validatePayouts({ ...p, payouts: [{ ...first, guess: 1 }] }).ok).toBe(false);
  });

  test("a period's payouts by when each was paid, since inclusive, until exclusive; the undated counted apart", () => {
    const p: Payouts = {
      ...fixture(),
      payouts: [
        pay('a.near', '1000000000000000000000000', '2026-01-10T00:00:00.000Z', '2.00'),
        pay('b.near', '2500000000000000000000000', '2026-02-01T00:00:00.000Z', null),
        pay('a.near', '500000000000000000000000', '2026-03-01T00:00:00.000Z', '1.00'),
        pay('c.near', '1', null, null),
      ],
    };
    const all = payoutsIn(p);
    expect(all.totals).toMatchObject({
      count: 4,
      recipients: 3,
      usd: '3.00',
      priced: 2,
      unpriced: 2,
    });
    expect(all.undated).toBe(0);
    const some = payoutsIn(p, {
      since: '2026-01-10T00:00:00.000Z',
      until: '2026-03-01T00:00:00.000Z',
    });
    expect(some.payouts.map((x) => x.to)).toEqual(['near:mainnet:a.near', 'near:mainnet:b.near']);
    expect(some.totals.assets).toEqual([{ asset: NEAR, amount: '3.5', count: 2, usd: '2.00' }]);
    expect(some.undated).toBe(1);
  });
});
