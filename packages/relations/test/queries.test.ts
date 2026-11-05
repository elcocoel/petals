// T198: the questions, and the honesty rules each answer has to carry.
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, test } from 'vitest';
import { NOT_COORDINATION, type Queries, RelationsError, RelationsIndex } from '../src/index.ts';
import { evm, shaOf, snap, source, tmpIndexPath } from './helpers.ts';

const [x, y, z, w] = [evm(1), evm(2), evm(3), evm(4)];
const groupId = (token: string, chain = 'eip155:1') =>
  `erc20/${chain}/token:${token}/token_balance`;

const A = snap({
  id: 'erc20',
  params: { token: '0xa' },
  title: 'A holders',
  as_of: '2026-01-01T00:00:00Z',
  holders: [
    [x as string, '70'],
    [y as string, '20'],
    [z as string, '10'],
  ],
  identities: {
    [x as string]: { name: 'someone.eth', source: 's', status: 'self-declared' },
  },
});
const B = snap({
  id: 'erc20',
  params: { token: '0xb' },
  title: 'B holders',
  as_of: '2021-01-01T00:00:00Z',
  holders: [
    [y as string, '1000000000000000000000000000000'],
    [z as string, '1000000000000000000000000000000'],
    [w as string, '1000000000000000000000000000000'],
  ],
  participantsTotal: 100,
});
// complete, on the same chain as A, overlapping it on one account
const C = snap({
  id: 'erc20',
  params: { token: '0xc' },
  title: 'C holders',
  as_of: '2026-01-02T00:00:00Z',
  holders: [
    [x as string, '1'],
    [evm(9), '1'],
  ],
});
// another chain: the same address there is only an inference
const D = snap({
  id: 'erc20',
  chain: 'eip155:8453',
  params: { token: '0xd', window_days: '7' },
  title: 'D active holders',
  as_of: '2026-01-03T00:00:00Z',
  holders: [[z as string, '5']],
});
// not EVM: an equal string here is no match of any kind
const N = snap({
  id: 'near-thing',
  chain: 'near:mainnet',
  population: 'n',
  title: 'N',
  as_of: '2026-01-04T00:00:00Z',
  holders: [
    [x as string, '5'],
    ['q.near', '5'],
  ],
  folded: [{ id: 'group:tail-1', count: 2, amount: '1' }],
});
const S = snap({
  id: 'sol-thing',
  chain: 'solana:mainnet',
  population: 's',
  title: 'S',
  holders: [['group-free-account', '5']],
  folded: [{ id: 'group:tail-1', count: 2, amount: '1' }],
});
// two dates of one group, a moment apart
const E1 = snap({
  id: 'erc20',
  params: { token: '0xe' },
  title: 'E holders',
  as_of: '2026-02-01T00:00:00Z',
  holders: [
    [x as string, '1'],
    [y as string, '1'],
  ],
});
const E2 = snap({
  id: 'erc20',
  params: { token: '0xe' },
  title: 'E holders',
  as_of: '2026-02-01T00:00:14Z',
  holders: [
    [x as string, '1'],
    [w as string, '1'],
  ],
});

let q: Queries;
let index: RelationsIndex;
const src = source(A, B, C, D, N, S, E1, E2);

beforeAll(async () => {
  index = new RelationsIndex(tmpIndexPath());
  q = await index.answer(src, (queries) => queries);
});

describe('sharedAccounts', () => {
  test('a count, a list, both shares and both dates', () => {
    const r = q.sharedAccounts(groupId('0xa'), groupId('0xb'));
    expect(r.shared).toBe(2);
    expect(r.accounts.map((a) => a.account_a).sort()).toEqual([`eip155:1:${y}`, `eip155:1:${z}`]);
    expect(r.accounts[0]).toMatchObject({
      account_a: `eip155:1:${y}`,
      account_b: `eip155:1:${y}`,
      match: { status: 'observed' },
      share_a: 0.2,
      as_of_a: '2026-01-01T00:00:00Z',
      as_of_b: '2021-01-01T00:00:00Z',
      rank_a: 2,
      groups_observed: 3,
    });
    expect(r.accounts[0]?.share_b).toBeCloseTo(1 / 3, 5);
    expect(r.a.as_of).toBe('2026-01-01T00:00:00Z');
    expect(r.b.as_of).toBe('2021-01-01T00:00:00Z');
  });

  test('an amount past a double comes back as the exact string', () => {
    const r = q.sharedAccounts(groupId('0xa'), groupId('0xb'));
    expect(r.accounts[0]?.amount_b).toBe('1000000000000000000000000000000');
  });

  test('a lower bound where coverage is partial, with the facts', () => {
    const r = q.sharedAccounts(groupId('0xa'), groupId('0xb'));
    expect(r.at_least).toBe(true);
    expect(r.b.coverage).toMatchObject({ members_named: 3, members_total: 100, complete: false });
    expect(r.a.coverage.complete).toBe(true);
    expect(r.absence).toMatch(/partial/);
  });

  test('exact where both reads are complete', () => {
    const r = q.sharedAccounts(groupId('0xa'), groupId('0xc'));
    expect(r.shared).toBe(1);
    expect(r.at_least).toBe(false);
  });

  test('the gap between the two dates, in seconds and days', () => {
    const r = q.sharedAccounts(groupId('0xa'), groupId('0xb'));
    expect(r.gap_days).toBeCloseTo(1826, 0);
    expect(r.gap_seconds).toBe(1826 * 86_400);
    const near = q.sharedAccounts(groupId('0xa'), groupId('0xc'));
    expect(near.gap_seconds).toBe(86_400);
  });

  test('across chains: two ids, marked inferred, with the method', () => {
    const r = q.sharedAccounts(groupId('0xa'), groupId('0xd', 'eip155:8453'));
    expect(r.shared).toBe(1);
    const inferred = { status: 'inferred', method: 'same_evm_address' };
    expect(r.match).toEqual(inferred);
    expect(r.accounts[0]).toMatchObject({
      account_a: `eip155:1:${z}`,
      account_b: `eip155:8453:${z}`,
      match: inferred,
    });
  });

  test('an equal string outside EVM is no match, nor is a folded row', () => {
    const a = groupId('0xa');
    expect(q.sharedAccounts(a, 'near-thing/near:mainnet/n/token_balance').shared).toBe(0);
    // both of these hold a group:tail-1 row, with unrelated meanings
    expect(
      q.sharedAccounts(
        'near-thing/near:mainnet/n/token_balance',
        'sol-thing/solana:mainnet/s/token_balance',
      ).shared,
    ).toBe(0);
  });

  test('the list is capped; the count is not', () => {
    const r = q.sharedAccounts(groupId('0xa'), groupId('0xb'), { limit: 1 });
    expect(r.accounts).toHaveLength(1);
    expect(r.shared).toBe(2);
    expect(r.more).toBe(1);
  });

  test('one group at one date is refused, naming its dates', () => {
    const e = groupId('0xe');
    let caught: unknown;
    try {
      q.sharedAccounts(e, e);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RelationsError);
    expect((caught as RelationsError).code).toBe('bad_input');
    expect((caught as RelationsError).hint).toContain(`${e}@${shaOf(E1)}`);
  });

  test('two dates of one group can be asked for by name, and say so', () => {
    const e = groupId('0xe');
    const r = q.sharedAccounts(`${e}@${shaOf(E1)}`, `${e}@${shaOf(E2)}`);
    expect(r.same_group).toBe(true);
    expect(r.shared).toBe(1);
    expect(r.gap_seconds).toBe(14);
  });

  test('a snapshot hash names its main group, at that date', () => {
    const r = q.sharedAccounts(shaOf(E1), shaOf(A));
    expect(r.a.group_id).toBe(groupId('0xe'));
    expect(r.a.as_of).toBe('2026-02-01T00:00:00Z');
    expect(r.a.latest).toBe(false);
    expect(r.a.observations).toBe(2);
  });

  test('an unknown group is not_found, offering near matches', () => {
    expect(() => q.sharedAccounts('no-such-group', groupId('0xa'))).toThrow(/No group/);
    let caught: RelationsError | undefined;
    try {
      q.sharedAccounts('A HOLDERS', groupId('0xb'));
    } catch (err) {
      caught = err as RelationsError;
    }
    expect(caught?.code).toBe('not_found');
    expect(caught?.hint).toContain(groupId('0xa'));
  });
});

describe('relatedGroups', () => {
  test('never itself, and not its own other date', () => {
    const r = q.relatedGroups(groupId('0xe'));
    const ids = r.related.map((g) => g.group.group_id);
    expect(ids).not.toContain(groupId('0xe'));
    expect(r.group.as_of).toBe('2026-02-01T00:00:14Z');
    expect(r.basis).toMatch(/latest/);
  });

  test('by count and by share order differently, and each row keeps its facts', () => {
    const byCount = q.relatedGroups(groupId('0xa'), { by: 'count' });
    expect(byCount.related[0]).toMatchObject({
      shared: 2,
      group: { group_id: groupId('0xb') },
      at_least: true,
      match: { status: 'observed' },
      as_of_a: '2026-01-01T00:00:00Z',
      as_of_b: '2021-01-01T00:00:00Z',
    });
    expect(byCount.related[0]?.gap_days).toBeCloseTo(1826, 0);
    const byShare = q.relatedGroups(groupId('0xa'), { by: 'share' });
    // x alone holds 70 of A and half of C or E; y and z hold 30 of A and two thirds of B
    expect([groupId('0xc'), groupId('0xe')]).toContain(byShare.related[0]?.group.group_id);
    expect(byShare.related[0]?.weight).toBeCloseTo(0.5, 5);
    expect(byCount.related.map((g) => g.group.group_id)).not.toEqual(
      byShare.related.map((g) => g.group.group_id),
    );
  });

  test('a cross-chain relation is marked', () => {
    const r = q.relatedGroups(groupId('0xd', 'eip155:8453'));
    expect(r.related.length).toBeGreaterThan(0);
    for (const g of r.related) {
      expect(g.match).toEqual({ status: 'inferred', method: 'same_evm_address' });
    }
  });

  test('limit and total', () => {
    const r = q.relatedGroups(groupId('0xa'), { limit: 1 });
    expect(r.related).toHaveLength(1);
    expect(r.more).toBe(r.total - 1);
  });
});

describe('overview', () => {
  test('every group, once, at its latest date', () => {
    const r = q.overview();
    expect(r.groups).toHaveLength(7);
    const e = r.groups.find((g) => g.id === groupId('0xe'));
    expect(e).toMatchObject({ observations: 2, as_of: '2026-02-01T00:00:14Z' });
  });

  test('pairs above the threshold, each pair once', () => {
    const all = q.overview();
    const keys = all.pairs.map((p) => [p.a, p.b].sort().join(' '));
    expect(new Set(keys).size).toBe(keys.length);
    expect(all.pairs.every((p) => p.a !== p.b)).toBe(true);
    const two = q.overview({ minShared: 2 });
    expect(two.pairs.every((p) => p.shared >= 2)).toBe(true);
    expect(two.pairs.length).toBeLessThan(all.pairs.length);
    expect(two.pairs_total).toBe(two.pairs.length);
  });

  test('a capped list says how many it left out', () => {
    const r = q.overview({ limit: 1 });
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs_more).toBe(r.pairs_total - 1);
  });

  test('every pair carries its dates, gap and coverage verdict', () => {
    for (const p of q.overview().pairs) {
      expect(p.as_of_a).toBeTruthy();
      expect(p.as_of_b).toBeTruthy();
      expect(p.gap_seconds).toBeGreaterThanOrEqual(0);
      expect(typeof p.at_least).toBe('boolean');
    }
  });

  test('counts distinct addresses', () => {
    // x, y, z, w, evm(9), q.near and the Solana account: x on NEAR is another address string scope
    expect(q.overview().accounts).toBe(8);
  });
});

describe('accountGroups', () => {
  test('every group, with share, rank and date', () => {
    const r = q.accountGroups(`eip155:1:${y}`);
    expect(r.groups.map((g) => g.group.group_id)).toContain(groupId('0xa'));
    const a = r.groups.find((g) => g.group.group_id === groupId('0xa'));
    expect(a).toMatchObject({
      account: `eip155:1:${y}`,
      match: { status: 'observed' },
      amount: '20',
      share: 0.2,
      rank: 2,
      group: { as_of: '2026-01-01T00:00:00Z' },
    });
    expect(r.total).toBe(r.groups.length);
  });

  test('both dates of one group are both there', () => {
    const r = q.accountGroups(`eip155:1:${x}`);
    const e = r.groups.filter((g) => g.group.group_id === groupId('0xe'));
    expect(e.map((g) => g.group.as_of).sort()).toEqual([
      '2026-02-01T00:00:00Z',
      '2026-02-01T00:00:14Z',
    ]);
  });

  test('the same address on another EVM chain is inferred; elsewhere it isn’t found at all', () => {
    const r = q.accountGroups(`eip155:1:${z}`);
    const d = r.groups.find((g) => g.group.chain === 'eip155:8453');
    expect(d).toMatchObject({
      account: `eip155:8453:${z}`,
      match: { status: 'inferred', method: 'same_evm_address' },
    });
    const near = q.accountGroups(`eip155:1:${x}`);
    expect(near.groups.some((g) => g.group.chain === 'near:mainnet')).toBe(false);
  });

  test('a bare address stands for every chain, and only what one chain has is observed', () => {
    const many = q.accountGroups(z as string);
    expect(many.accounts).toEqual([`eip155:1:${z}`, `eip155:8453:${z}`]);
    expect(many.groups.every((g) => g.match.status === 'inferred')).toBe(true);
    const one = q.accountGroups('q.near');
    expect(one.groups[0]?.match).toEqual({ status: 'observed' });
  });

  test('an upper-case address finds the lower-case account', () => {
    const upper = `0x${(y as string).slice(2).toUpperCase()}`;
    expect(q.accountGroups(`eip155:1:${upper}`).total).toBe(q.accountGroups(y as string).total);
  });

  test('not seen is not proof: nothing found still says at_least', () => {
    const r = q.accountGroups('eip155:1:0x0000000000000000000000000000000000000000');
    expect(r.groups).toEqual([]);
    expect(r.at_least).toBe(true);
    expect(r.index.observations_partial).toBeGreaterThan(0);
    expect(r.absence).toMatch(/not seen/);
  });

  test('a stored label keeps its status, and no answer calls anyone anyone', () => {
    const r = q.accountGroups(`eip155:1:${x}`);
    const a = r.groups.find((g) => g.group.group_id === groupId('0xa'));
    expect(a?.identity).toEqual({ name: 'someone.eth', source: 's', status: 'self-declared' });
    const others = r.groups.filter((g) => g.group.group_id !== groupId('0xa'));
    expect(others.every((g) => g.identity === null)).toBe(true);
    const s = q.sharedAccounts(groupId('0xa'), groupId('0xc'));
    expect(s.accounts[0]?.identity_a).toEqual(a?.identity);
    expect(s.accounts[0]?.identity_b).toBeNull();
  });

  test('a folded row isn’t an account', () => {
    expect(q.accountGroups('group:tail-1').groups).toEqual([]);
  });
});

test('every relation states that it does not show coordination', () => {
  expect(NOT_COORDINATION).toMatch(/not coordination/);
  const a = groupId('0xa');
  for (const out of [
    q.accountGroups(x as string),
    q.sharedAccounts(a, groupId('0xb')),
    q.relatedGroups(a),
    q.overview(),
    q.path(`eip155:1:${x}`, `eip155:1:${y}`),
  ]) {
    expect(out.does_not_show).toBe(NOT_COORDINATION);
  }
});

test('the file holds public derived tables, and nothing about people', () => {
  const db = new DatabaseSync(index.path, { readOnly: true });
  const names = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => (r as { name: string }).name)
    .sort();
  db.close();
  expect(names).toEqual([
    'account',
    'adj',
    'group_overlap',
    'grp',
    'membership',
    'meta',
    'node',
    'observation',
    'snapshot',
  ]);
});
