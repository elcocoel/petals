// T198: the path between two accounts, and how it says it stopped looking.
import { beforeAll, describe, expect, test } from 'vitest';
import { type Queries, RelationsIndex } from '../src/index.ts';
import { evm, snap, source, tmpIndexPath } from './helpers.ts';

const [a, b, c, d] = [evm(1), evm(2), evm(3), evm(4)] as [string, string, string, string];
const acct = (x: string, chain = 'eip155:1') => `${chain}:${x}`;
const group = (name: string, holders: string[], o: Parameters<typeof snap>[0] = {}) =>
  snap({
    id: 'g',
    params: { name },
    title: name,
    holders: holders.map((h) => [h, '1'] as [string, string]),
    ...o,
  });

let q: Queries;
beforeAll(async () => {
  const src = source(
    group('one', [a, b], { as_of: '2024-01-01T00:00:00Z' }),
    group('two', [b, c], { as_of: '2025-01-01T00:00:00Z', participantsTotal: 90 }),
    // only reachable by trusting one address on two chains
    group('base', [a, d], { chain: 'eip155:8453', as_of: '2026-01-01T00:00:00Z' }),
    // no link to anything
    group('apart', [evm(7), evm(8)]),
    // a pool whose delegators are a group about it
    snap({
      id: 'stake',
      chain: 'near:mainnet',
      population: 'p',
      as_of: '2026-03-01T00:00:00Z',
      delegations: [
        { from: 'x.near', to: 'pool.near', amount: '5' },
        { from: 'y.near', to: 'pool.near', amount: '5' },
      ],
    }),
    // a big group: a bridge between two groups, and a lot to read
    group('huge', [evm(100), ...Array.from({ length: 3000 }, (_, i) => evm(1000 + i)), evm(101)]),
    group('left', [evm(50), evm(100)]),
    group('right', [evm(51), evm(101)]),
  );
  const index = new RelationsIndex(tmpIndexPath());
  q = await index.answer(src, (x) => x);
});

describe('a path', () => {
  test('each hop names its group, its date and its size', () => {
    const r = q.path(acct(a), acct(c));
    expect(r).toMatchObject({ found: true, reason: 'found', gave_up: false });
    expect(r.hops).toHaveLength(2);
    expect(r.hops[0]).toMatchObject({
      via: 'group',
      from: acct(a),
      to: acct(b),
      group: { title: 'one', as_of: '2024-01-01T00:00:00Z', coverage: { members_named: 2 } },
      from_in_group: { role: 'member', share: 0.5, rank: 1 },
    });
    expect(r.hops[1]).toMatchObject({
      via: 'group',
      from: acct(b),
      to: acct(c),
      group: {
        title: 'two',
        as_of: '2025-01-01T00:00:00Z',
        coverage: { members_named: 2, members_total: 90 },
      },
    });
  });

  test('a huge group in the way shows up as a size, and there is no score', () => {
    const r = q.path(acct(evm(50)), acct(evm(51)));
    expect(r.hops.map((h) => (h.via === 'group' ? h.group.coverage.members_named : 0))).toEqual([
      2, 3002, 2,
    ]);
    expect(JSON.stringify(r)).not.toMatch(/score/i);
    expect(r.note).toMatch(/group sizes/);
  });

  test('a group about an account connects it to its delegators', () => {
    const r = q.path('near:mainnet:x.near', 'near:mainnet:pool.near');
    expect(r.hops).toHaveLength(1);
    expect(r.hops[0]).toMatchObject({
      via: 'group',
      to: 'near:mainnet:pool.near',
      from_in_group: { role: 'member' },
      to_in_group: { role: 'anchor' },
    });
  });

  test('both names for one account', () => {
    expect(q.path(acct(a), acct(a))).toMatchObject({
      found: true,
      reason: 'same_account',
      hops: [],
    });
  });
});

describe('saying it stopped looking', () => {
  test('the budget ran out: it gave up, which is not no path', () => {
    const r = q.path(acct(evm(50)), acct(evm(51)), { budget: 10 });
    expect(r).toMatchObject({ found: false, reason: 'budget', gave_up: true, hops: [] });
    expect(r.touched).toBeGreaterThan(10);
    expect(r.note).toMatch(/may exist/);
  });

  test('the depth ran out: also not no path', () => {
    const r = q.path(acct(a), acct(c), { maxDepth: 1 });
    expect(r).toMatchObject({ found: false, reason: 'depth_limit', gave_up: true });
    expect(r.note).toMatch(/longer path may exist/);
  });

  test('nothing connects them: it looked everywhere, and absence still isn’t proof', () => {
    const r = q.path(acct(a), acct(evm(7)));
    expect(r).toMatchObject({ found: false, reason: 'no_path', gave_up: false });
    expect(r.note).toMatch(/not seen/);
  });

  test('an account no group holds', () => {
    const r = q.path(acct(evm(99)), acct(a));
    expect(r).toMatchObject({ found: false, reason: 'unknown_account', gave_up: false });
    expect(r.note).toContain(evm(99));
  });
});

describe('inference', () => {
  test('one address on two chains isn’t walked unless asked for', () => {
    const r = q.path(acct(a), acct(d, 'eip155:8453'));
    expect(r).toMatchObject({ found: false, reason: 'no_path', walked: 'observed links' });
  });

  test('asked for, the hop is there and marked inferred', () => {
    const r = q.path(acct(a), acct(d, 'eip155:8453'), { includeInferred: true });
    expect(r.found).toBe(true);
    const link = r.hops.find((h) => h.via === 'same_address');
    expect(link).toMatchObject({
      from: acct(a),
      to: acct(a, 'eip155:8453'),
      match: { status: 'inferred', method: 'same_evm_address' },
    });
    expect(r.walked).toBe('observed and inferred links');
  });

  test('a bare address starts on every chain, and says that is inferred', () => {
    const r = q.path(a, acct(d, 'eip155:8453'));
    expect(r.found).toBe(true);
    expect(r.from.accounts).toEqual([acct(a), acct(a, 'eip155:8453')]);
    expect(r.from.match).toEqual({ status: 'inferred', method: 'same_evm_address' });
    expect(r.hops).toHaveLength(1);
  });
});

test('each group expands once per direction: the work stays within the graph', async () => {
  // Every account of the huge group reaches every other through it. Without a visited set the
  // second level alone would read 3,002 squared rows.
  const r = q.path(acct(evm(1000)), acct(a), { maxDepth: 6 });
  expect(r.reason).toBe('no_path');
  expect(r.touched).toBeLessThan(20_000);
});
