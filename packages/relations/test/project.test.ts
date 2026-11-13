// T198: from one snapshot to its groups, and the traps the graph spike hit doing it by hand.
import { describe, expect, test } from 'vitest';
import { groupBase, groupsOf } from '../src/index.ts';
import { evm, snap } from './helpers.ts';

describe('a snapshot is not a group', () => {
  const delegated = snap({
    id: 'staking',
    chain: 'near:mainnet',
    population: 'validators',
    title: 'Staking',
    unit: 'NEAR',
    measure: 'pool_stake',
    coverageMeasure: 'delegated_stake',
    holders: [
      ['pool-a.near', '700'],
      ['pool-b.near', '300'],
    ],
    otherHoldings: [
      { participant: 'pool-a.near', measure: 'blocks', unit: 'blocks', amount: '5' },
      { participant: 'pool-b.near', measure: 'blocks', unit: 'blocks', amount: '5' },
      { participant: 'pool-b.near', measure: 'more_blocks', unit: 'blocks', amount: '5' },
    ],
    folded: [],
    delegations: [
      { from: 'x.near', to: 'pool-a.near', amount: '60' },
      { from: 'y.near', to: 'pool-a.near', amount: '40' },
      { from: 'y.near', to: 'pool-b.near', amount: '10' },
    ],
  });
  const groups = groupsOf(delegated);

  test('its delegators, in relationships, make one group per target', () => {
    expect(groups.map((g) => [g.kind, g.key])).toEqual([
      ['holdings', 'staking/near:mainnet/validators/pool_stake'],
      ['delegators', 'staking/near:mainnet/validators/delegators:pool-a.near'],
      ['delegators', 'staking/near:mainnet/validators/delegators:pool-b.near'],
    ]);
    const a = groups[1];
    expect(a?.anchor).toBe('pool-a.near');
    expect(a?.title).toBe('Delegators of pool-a.near');
    expect(a?.members.map((m) => [m.address, m.amount, m.share, m.rank])).toEqual([
      ['x.near', '60', 0.6, 1],
      ['y.near', '40', 0.4, 2],
    ]);
  });

  test('coverage names a measure with no rows: the unit decides, not a block count', () => {
    const holdings = groups[0];
    expect(holdings?.measure).toBe('pool_stake');
    expect(holdings?.members).toHaveLength(2);
    // the snapshot says nothing about how complete this measure is, so it can't claim to be
    expect(holdings?.coverage.members_total).toBeNull();
    expect(holdings?.coverage.complete).toBe(false);
    expect(holdings?.coverage.why_partial[0]).toMatch(/delegated_stake/);
  });
});

describe('a view made with compose_view', () => {
  test('is no group, so never a second observation of its base', () => {
    const base = snap({
      id: 'moloch-v3',
      chain: 'eip155:100',
      population: 'raidguild',
      title: 'RaidGuild',
      unit: 'shares',
      measure: 'shares',
      holders: [
        ['0xaa', '700'],
        ['0xbb', '300'],
      ],
    });
    expect(groupsOf(base).length).toBeGreaterThan(0);
    const view = { ...base, module: { id: 'compose', version: 'seam/v1' } };
    expect(groupsOf(view)).toEqual([]);
  });
});

describe('folded rows are no accounts', () => {
  test('counted as a tail, never as members, and shares still count their amount', () => {
    const [g] = groupsOf(
      snap({
        holders: [
          [evm(1), '50'],
          [evm(2), '30'],
        ],
        folded: [{ id: 'group:tail-1', count: 98, amount: '20' }],
      }),
    );
    expect(g?.members.map((m) => m.address)).toEqual([evm(1), evm(2)]);
    expect(g?.members[0]?.share).toBe(0.5);
    expect(g?.coverage).toMatchObject({
      members_named: 2,
      members_total: 100,
      tail_accounts: 98,
      amount_named: '80',
      amount_total: '100',
      named_share: 0.8,
      complete: false,
    });
  });

  test('a delegator folded under a pool counts in that pool’s tail', () => {
    const s = snap({
      chain: 'near:mainnet',
      folded: [{ id: 'group:p.near:other', count: 3 }],
      delegations: [
        { from: 'a.near', to: 'p.near', amount: '9' },
        { from: 'group:p.near:other', to: 'p.near', amount: '1' },
      ],
    });
    const g = groupsOf(s).find((x) => x.kind === 'delegators');
    expect(g?.members.map((m) => m.address)).toEqual(['a.near']);
    expect(g?.members[0]?.share).toBe(0.9);
    expect(g?.coverage).toMatchObject({ members_named: 1, members_total: 4, tail_accounts: 3 });
    expect(g?.coverage.complete).toBe(false);
  });

  test('a row stating no amount is said to be uncounted, not silently lost', () => {
    const g = groupsOf(
      snap({ chain: 'near:mainnet', delegations: [{ from: 'a.near', to: 'p.near' }] }),
    ).find((x) => x.kind === 'delegators');
    expect(g?.members).toHaveLength(0);
    expect(g?.coverage.why_partial.join()).toMatch(/state no amount/);
  });
});

describe('identity over time is the module and its parameters', () => {
  const network = (params: Record<string, string>) =>
    snap({ id: 'erc20-holders', chain: 'eip155:8453', params }).network;

  test('the read window is how a group was read, not which group it is', () => {
    expect(groupBase(network({ token: '0xABC', chain: 'base', window_days: '7' }))).toBe(
      groupBase(network({ window_days: 'full', chain: 'base', token: '0xabc' })),
    );
    expect(groupBase(network({ token: '0xabc', chain: 'base' }))).toBe(
      'erc20-holders/eip155:8453/token:0xabc',
    );
  });

  test('other parameters are other groups, and so is another chain', () => {
    expect(groupBase(network({ token: '0xabc' }))).not.toBe(groupBase(network({ token: '0xdef' })));
    expect(groupBase(snap({ chain: 'eip155:1' }).network)).not.toBe(
      groupBase(snap({ chain: 'eip155:10' }).network),
    );
  });

  test('a module with no parameters is its population', () => {
    expect(groupBase(snap({ id: 'm', population: 'pop' }).network)).toBe('m/eip155:1/pop');
  });
});

describe('amounts and addresses', () => {
  test('past what a double holds, amounts stay exact and rank exactly', () => {
    const big = '1000000000000000000000000000001';
    const smaller = '1000000000000000000000000000000';
    const [g] = groupsOf(
      snap({
        holders: [
          [evm(1), smaller],
          [evm(2), big],
        ],
      }),
    );
    expect(g?.members.map((m) => [m.address, m.amount, m.rank])).toEqual([
      [evm(2), big, 1],
      [evm(1), smaller, 2],
    ]);
    expect(Number(big)).toBe(Number(smaller));
  });

  test('an EVM address in two cases is one account, and its rows add up', () => {
    const lower = evm(1);
    const mixed = `0x${lower.slice(2).toUpperCase()}`;
    const [g] = groupsOf(
      snap({
        holders: [
          [lower, '1'],
          [mixed, '2'],
          [evm(2), '2'],
        ],
      }),
    );
    expect(g?.members.map((m) => [m.address, m.amount])).toEqual([
      [lower, '3'],
      [evm(2), '2'],
    ]);
  });

  test('base58 and NEAR names keep their case', () => {
    const [g] = groupsOf(
      snap({
        chain: 'solana:mainnet',
        holders: [
          ['AbCd', '1'],
          ['abcd', '1'],
        ],
      }),
    );
    expect(g?.members.map((m) => m.address).sort()).toEqual(['AbCd', 'abcd']);
  });

  test('a holder of nothing is no member, as compute_figures counts it', () => {
    const [g] = groupsOf(
      snap({
        holders: [
          [evm(1), '0'],
          [evm(2), '5'],
        ],
        participantsTotal: 1,
      }),
    );
    expect(g?.members.map((m) => m.address)).toEqual([evm(2)]);
  });

  test('a label travels with its status, unchanged', () => {
    const identity = { name: 'someone.eth', source: 's', status: 'self-declared' };
    const [g] = groupsOf(snap({ holders: [[evm(1), '1']], identities: { [evm(1)]: identity } }));
    expect(g?.members[0]?.identity).toEqual(identity);
  });
});

describe('what a read could not see', () => {
  test.each([
    ['a window', { params: { window_days: '7' } }, /last 7 days/],
    ['failed sources', { partial: true }, /sources failed/],
    ['unnamed accounts', { participantsTotal: 9 }, /1 of 9 accounts/],
    ['an amount no one was named for', { amountTotal: '100' }, /not attributed/],
  ])('%s is partial', (_what, o, why) => {
    const [g] = groupsOf(snap({ holders: [[evm(1), '50']], ...o }));
    expect(g?.coverage.complete).toBe(false);
    expect(g?.coverage.why_partial.join()).toMatch(why);
  });

  test('a full read of everyone is complete, and a full window is no window', () => {
    const [g] = groupsOf(snap({ holders: [[evm(1), '50']], params: { window_days: 'full' } }));
    expect(g?.coverage).toMatchObject({ complete: true, window: null, why_partial: [] });
  });
});

test('a date that is no date is refused, so nothing half-written follows', () => {
  expect(() => groupsOf(snap({ as_of: 'yesterday', holders: [[evm(1), '1']] }))).toThrow(/date/);
});
