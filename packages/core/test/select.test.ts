// T026: selectPetals (top N plus a declared tail; petals is a cap) and backerSegments (other
// delegators, accounts with 1M+ NEAR, liquid-staking contracts, lockups).
import { describe, expect, test } from 'vitest';
import { parseDecimal } from '../src/decimal.ts';
import { BACKER_ORDER, backerSegments } from '../src/segments/backers.ts';
import { selectPetals, TAIL_ID } from '../src/select.ts';
import type { Spec } from '../src/types/index.ts';
import { tinyBackers, twoParticipants, validators } from './load.ts';

const sel = (petals: number, group = true): Spec['selection'] => ({
  measure: 'validator_stake_current_epoch',
  petals,
  tail: { group, label: 'everyone else' },
});

describe('selectPetals', () => {
  test('top 60 by the measure, largest first, then one declared tail', () => {
    const rows = selectPetals(validators(), sel(60));
    expect(rows).toHaveLength(61);
    expect(rows[0]).toMatchObject({
      index: 0,
      id: 'astro-stakers.poolv1.near',
      kind: 'staking_pool',
      rank: 1,
      share: 0.056071,
      identity: { name: 'astrostakers.com', status: 'self-declared' },
    });
    for (let i = 1; i < 60; i++)
      expect(Number((rows[i - 1] as { amount: string }).amount)).toBeGreaterThanOrEqual(
        Number((rows[i] as { amount: string }).amount),
      );
    expect(rows[60]).toEqual({
      index: 60,
      id: TAIL_ID,
      label: 'everyone else',
      kind: 'group',
      identity: null,
      amount: '81869050.738906256586067675155591',
      share: 0.137972,
      rank: 61,
      tail: true,
      count: 311,
    });
  });

  test('the tail counts the participants it folds, not rows: a group row counts its members', () => {
    const v = validators();
    const measure = v.holdings[0]?.measure ?? '';
    const plain = selectPetals(v, { ...sel(2), measure });
    const folded = plain[1]?.id; // second by the measure, so sel(1) folds it into the tail
    const s = {
      ...v,
      participants: v.participants.map((p) =>
        p.id === folded ? { ...p, kind: 'group' as const, count: 5000 } : p,
      ),
    };
    const before = selectPetals(v, { ...sel(1), measure }).at(-1)?.count ?? 0;
    const tail = selectPetals(s, { ...sel(1), measure }).at(-1);
    expect(tail?.id).toBe(TAIL_ID);
    expect(tail?.count).toBe(before - 1 + 5000);
  });

  test('petals is a cap: two participants give two petals and no tail', () => {
    const rows = selectPetals(twoParticipants(), sel(60));
    expect(rows.map((r) => [r.id, r.rank, r.tail])).toEqual([
      ['astro-stakers.poolv1.near', 1, undefined],
      ['figment.poolv1.near', 2, undefined],
    ]);
  });

  test('exactly as many participants as petals: no tail', () => {
    expect(selectPetals(tinyBackers(), sel(5)).some((r) => r.tail)).toBe(false);
  });

  test('without tail.group the rest is not drawn (validateSpec refuses such a spec)', () => {
    expect(selectPetals(validators(), sel(10, false))).toHaveLength(10);
  });

  test('shares of the petals and the tail add up to the whole', () => {
    const rows = selectPetals(validators(), sel(60));
    const sum = rows.reduce(
      (t, r) => t + parseDecimal(r.amount).v * 10n ** BigInt(30 - parseDecimal(r.amount).s),
      0n,
    );
    expect(sum).toBe(parseDecimal('593372642.814240027020784486594744').v * 10n ** 6n);
  });

  test('an unknown measure is bad input', () => {
    expect(() => selectPetals(validators(), { ...sel(60), measure: 'nope' })).toThrow(
      expect.objectContaining({ code: 'bad_input' }),
    );
  });
});

describe('backerSegments', () => {
  test('a pool with every class: other, large, liquid, lockup, in that order', () => {
    const segs = backerSegments(validators(), 'astro-stakers.poolv1.near');
    expect(segs.map((s) => s.key)).toEqual([...BACKER_ORDER]);
    expect(segs.map((s) => s.label)).toEqual([
      'other delegators',
      'accounts with 1M+ NEAR',
      'liquid-staking contracts',
      'lockups (vesting)',
    ]);
    expect(segs[0]).toEqual({
      key: 'other',
      label: 'other delegators',
      amount: '20286510.058892487125277299909503',
      frac: 0.609656,
    });
    const total = segs.reduce((t, s) => t + s.frac, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  test('tiny-backers: every pool splits into the classes its backers carry', () => {
    const s = tinyBackers();
    const pools = s.participants.filter((p) => p.kind === 'staking_pool').map((p) => p.id);
    const seen = new Set<string>();
    for (const id of pools) {
      const segs = backerSegments(s, id);
      expect(segs.length).toBeGreaterThan(0);
      const keys = segs.map((x) => x.key);
      expect(keys).toEqual(BACKER_ORDER.filter((k) => keys.includes(k)));
      for (const k of keys) seen.add(k);
    }
    expect([...seen].sort()).toEqual([...BACKER_ORDER].sort());
  });

  test('folded group rows count in their class', () => {
    const s = tinyBackers();
    const lockupGroup = s.relationships.find(
      (r) => r.from === 'group:astro-stakers.poolv1.near:lockup',
    );
    expect(lockupGroup).toBeDefined();
    const lockup = backerSegments(s, 'astro-stakers.poolv1.near').find((x) => x.key === 'lockup');
    expect(Number(lockup?.amount)).toBeGreaterThanOrEqual(Number(lockupGroup?.amount));
  });

  test('a pool nobody delegates to has no segments', () => {
    expect(backerSegments(validators(), 'no-such.pool.near')).toEqual([]);
    expect(backerSegments(twoParticipants(), 'astro-stakers.poolv1.near')).toEqual([]);
  });
});
