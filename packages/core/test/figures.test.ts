// T025: computeFigures. Exact BigInt sums, shares rounded to 6 decimals, amounts as decimal strings,
// Nakamoto with a stated threshold. The validators fixture's Nakamoto coefficient is 9.
import { describe, expect, test } from 'vitest';
import { formatDecimal, parseDecimal, ratio6 } from '../src/decimal.ts';
import { computeFigures, isBftPopulation } from '../src/figures/index.ts';
import type { Snapshot } from '../src/types/index.ts';
import { houseOfStake, validators } from './load.ts';
import { sampleSnapshot } from './samples.ts';

/** A snapshot with one holding per amount (decimal strings), population `pop`. */
function withAmounts(amounts: string[], pop = 'test-holders', raw = false): Snapshot {
  const s = structuredClone(sampleSnapshot);
  s.network.population = pop;
  s.coverage.measure = 'm';
  s.participants = amounts.map((_, i) => ({
    id: `p${i}`,
    label: `P${i}`,
    kind: 'person',
    identity: null,
    source: 'rpc-validators',
  }));
  s.holdings = amounts.map((amount, i) => ({
    participant: `p${i}`,
    asset: 'X',
    measure: 'm',
    amount,
    ...(raw
      ? { amount_raw: `${parseDecimal(amount).v * 10n ** BigInt(6 - parseDecimal(amount).s)}` }
      : {}),
    unit: 'X',
    as_of: s.snapshot.as_of,
    source: 'rpc-validators',
  }));
  s.relationships = [];
  return s;
}

describe('decimal helpers', () => {
  test('format and parse round-trip without trailing zeros', () => {
    expect(formatDecimal(parseDecimal('1000.500').v, 3)).toBe('1000.5');
    expect(formatDecimal(3n, 24)).toBe('0.000000000000000000000003');
    expect(formatDecimal(3000n, 0)).toBe('3000');
  });
  test('ratio6 rounds half up to 6 decimals', () => {
    expect(ratio6(1n, 3n)).toBe(0.333333);
    expect(ratio6(2n, 3n)).toBe(0.666667);
    expect(ratio6(5n, 10_000_000n)).toBe(0.000001);
    expect(ratio6(1n, 1n)).toBe(1);
  });
});

describe('computeFigures on the NEAR validators fixture', () => {
  const f = computeFigures(validators(), { measure: 'validator_stake_current_epoch' });

  test('Nakamoto is 9 at the BFT threshold of 1/3 (stated)', () => {
    expect(f.nakamoto).toEqual({ threshold: 0.333333, count: 9 });
  });

  test('totals are exact decimal strings over amount_raw', () => {
    expect(f.unit).toBe('NEAR');
    expect(f.total).toBe('593372642.814240027020784486594744');
    expect(f.participants_included).toBe(371);
    expect(f.participants_total).toBe(371);
  });

  test('shares: the top 60, ranked, rounded to 6 decimals', () => {
    expect(f.shares).toHaveLength(60);
    expect(f.shares[0]).toEqual({
      id: 'astro-stakers.poolv1.near',
      label: 'astro-stakers.poolv1.near',
      amount: '33270925.619217119134459443495696',
      share: 0.056071,
      rank: 1,
    });
    for (const s of f.shares) expect(Math.round(s.share * 1e6) / 1e6).toBe(s.share);
    expect(f.shares.map((s) => s.rank)).toEqual(f.shares.map((_, i) => i + 1));
  });

  test('top-k, HHI, Gini, tail', () => {
    expect(f.top_k_share).toEqual({
      '1': 0.056071,
      '5': 0.211168,
      '10': 0.362499,
      '100': 0.938285,
    });
    expect(f.hhi).toBe(0.021471);
    expect(f.gini).toBe(0.836217);
    expect(f.tail).toEqual({
      count: 311,
      amount: '81869050.738906256586067675155591',
      share: 0.137972,
    });
  });

  test('figure ids name every figure, with fig:shares and one per k', () => {
    expect(f.figure_ids).toEqual([
      'fig:total',
      'fig:participants_total',
      'fig:participants_included',
      'fig:shares',
      'fig:top_k_share.1',
      'fig:top_k_share.5',
      'fig:top_k_share.10',
      'fig:top_k_share.100',
      'fig:nakamoto',
      'fig:hhi',
      'fig:gini',
      'fig:tail',
    ]);
    expect(f.fusions).toEqual([]);
  });

  test('deterministic: same input, same JSON', () => {
    const again = computeFigures(validators(), { measure: 'validator_stake_current_epoch' });
    expect(JSON.stringify(again)).toBe(JSON.stringify(f));
  });
});

describe('computeFigures rules', () => {
  test('House of Stake is not BFT: the threshold is 1/2; zero holders are not included', () => {
    const h = computeFigures(houseOfStake(), { measure: 'voting_power' });
    expect(isBftPopulation(houseOfStake().network)).toBe(false);
    expect(h.nakamoto).toEqual({ threshold: 0.5, count: 5 });
    expect(h.participants_included).toBe(466);
    expect(h.participants_total).toBe(518); // coverage.measure is voting_power
  });

  test('Nakamoto passes the threshold strictly: two equal halves need both at 1/2', () => {
    const s = withAmounts(['50', '50']);
    expect(computeFigures(s, { measure: 'm' }).nakamoto.count).toBe(2);
    expect(computeFigures(s, { measure: 'm', nakamotoThreshold: 0.4 }).nakamoto).toEqual({
      threshold: 0.4,
      count: 1,
    });
  });

  test('HHI and Gini by hand: equal holders give HHI 1/n and Gini 0', () => {
    const f = computeFigures(withAmounts(['10', '10', '10', '10']), { measure: 'm' });
    expect(f.hhi).toBe(0.25);
    expect(f.gini).toBe(0);
    // one holder of everything among four: Gini over included participants is (n-1)/n
    const g = computeFigures(withAmounts(['97', '1', '1', '1']), { measure: 'm' });
    expect(g.gini).toBe(0.72);
    expect(g.hhi).toBe(ratio6(97n * 97n + 3n, 10_000n));
  });

  test('decimal amounts and amount_raw give the same exact sums', () => {
    const amounts = ['0.1', '0.2', '1000000.000001'];
    const a = computeFigures(withAmounts(amounts), { measure: 'm' });
    const b = computeFigures(withAmounts(amounts, 'test-holders', true), { measure: 'm' });
    expect(a.total).toBe('1000000.300001'); // no floating point: 0.1 + 0.2 is exact
    expect(b).toEqual(a);
  });

  test('fewer holders than petals: no tail', () => {
    const f = computeFigures(withAmounts(['3', '2', '1']), { measure: 'm', petals: 60 });
    expect(f.shares).toHaveLength(3);
    expect(f.tail).toEqual({ count: 0, amount: '0', share: 0 });
    expect(f.top_k_share['100']).toBe(1);
  });

  test('bad input: unknown measure names the allowed ones', () => {
    expect(() => computeFigures(validators(), { measure: 'nope' })).toThrow(
      expect.objectContaining({
        code: 'bad_input',
        allowed: expect.arrayContaining(['validator_stake_current_epoch']),
      }),
    );
    expect(() =>
      computeFigures(withAmounts(['1']), { measure: 'm', nakamotoThreshold: 1.5 }),
    ).toThrow(expect.objectContaining({ code: 'bad_input' }));
    expect(() => computeFigures(withAmounts(['1']), { measure: 'm', petals: 0 })).toThrow(
      expect.objectContaining({ code: 'bad_input' }),
    );
  });
});
