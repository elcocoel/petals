// T036: the live House of Stake module, on recorded responses (test/fixtures/hos/).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { InputError } from '../src/errors.ts';
import { modules } from '../src/index.ts';
import {
  HOUSE_OF_STAKE_DESCRIPTOR,
  isImplicit,
  nearHouseOfStake,
  VENEAR,
} from '../src/modules/near-house-of-stake.ts';
import { contribution, MILLI, ownedTotal, type VeAccount } from '../src/modules/venear.ts';
import { rpcPool } from '../src/rpc/pool.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';
import { expected, recording, replayedHos, unpaced } from './helpers/hos.ts';
import { snapshotProblems } from './helpers/schema.ts';

const at = { block_height: expected.block_height, as_of: expected.as_of };

// The recording is from 2026-11-04. A block more than a day old rightly goes to archival nodes, so
// replaying it against today's clock would change which endpoint answers. Pin the clock.
beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse('2026-11-04T20:00:00Z'), toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('near-house-of-stake on recorded responses', () => {
  test('is registered, live, cheap', () => {
    const d = modules['near-house-of-stake']?.descriptor;
    expect(d).toBe(HOUSE_OF_STAKE_DESCRIPTOR);
    expect(d).toMatchObject({
      id: 'near-house-of-stake',
      chain: 'near:mainnet',
      population: 'house-of-stake',
      live: true,
    });
    expect(d?.cost.calls).toBeLessThanOrEqual(20);
  });

  test('resolves latest to the final head', async () => {
    const { module } = replayedHos();
    expect(await module.resolveAt('latest')).toEqual(at);
  });

  test('reads holders, power, delegations, roles and proposals at one final block', async () => {
    const { module, replay } = replayedHos();
    const progress: { message: string; done?: number; total?: number }[] = [];
    const s = await module.fetch(at, undefined, (e) => progress.push(e));

    expect(replay.missing).toEqual([]);
    expect(replay.seen).toHaveLength(15); // + 1 block call in resolveAt = 16
    for (const k of replay.seen) expect(JSON.parse(k).params.block_id).toBe(at.block_height);

    expect(snapshotProblems(s)).toEqual([]);
    expect(s.snapshot).toMatchObject({
      block_height: at.block_height,
      as_of: at.as_of,
      final: true,
    });
    expect(s.snapshot.block_hash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
    expect(s.module).toEqual({ id: 'near-house-of-stake', version: 'live/1' });

    const holders = s.participants.filter((p) => p.roles?.includes('venear_holder'));
    expect(holders).toHaveLength(502);
    const power = s.holdings.filter((h) => h.measure === 'voting_power');
    expect(power).toHaveLength(502);
    // at one block the parts add up exactly to ft_total_supply
    expect(s.coverage).toMatchObject({
      measure: 'voting_power',
      unit: 'veNEAR',
      amount_total: expected.amount_total,
    });
    expect(s.coverage.amount_included).toBe(s.coverage.amount_total);
    const sum = power.reduce((a, h) => a + BigInt(h.amount_raw ?? '0'), 0n);
    expect(sum.toString()).toBe(
      (
        BigInt(expected.amount_total.split('.')[0] ?? '0') * 10n ** 24n +
        BigInt((expected.amount_total.split('.')[1] ?? '').padEnd(24, '0'))
      ).toString(),
    );

    const delegations = s.relationships.filter((r) => r.type === 'delegates_to');
    expect(delegations.length).toBeGreaterThan(100);
    for (const r of delegations) expect(r.bps).toBeGreaterThan(0);
    const roles = new Set(s.relationships.map((r) => r.type));
    for (const r of HOUSE_OF_STAKE_DESCRIPTOR.capabilities.relationships)
      expect(roles.has(r), r).toBe(true);
    expect(s.participants.find((p) => p.kind === 'treasury')?.id).toBe(
      'hos-deposits.sputnik-dao.near',
    );
    expect(s.events.filter((e) => e.type === 'proposal')).toHaveLength(30);

    // kinds and identities only where a source says so (data-model: unknown otherwise)
    for (const p of s.participants) {
      if (isImplicit(p.id)) {
        expect(p.identity).toBeNull();
        expect(p.label).toMatch(/^[0-9a-f]{8}…[0-9a-f]{4}$/);
      }
      if (p.id.endsWith('.sputnik-dao.near'))
        expect(['organisation', 'treasury']).toContain(p.kind);
      if (p.identity)
        expect(p.identity).toEqual({ name: p.id, source: 'account-id', status: 'self-declared' });
    }
    expect(new Set(s.participants.map((p) => p.kind))).toEqual(
      new Set(['unknown', 'organisation', 'treasury']),
    );

    // chain sources are pinned to the block and name the endpoint that answered
    for (const src of s.sources.filter((x) => x.kind === 'chain')) {
      expect(src).toMatchObject({
        url: 'https://near.drpc.org',
        fetched_at: at.as_of,
        block_height: at.block_height,
      });
      expect(src.method).toMatch(/at block_id \d+ \(final\)/);
    }
    // the descriptor's meanings cite sources the snapshot carries
    const ids = new Set(s.sources.map((x) => x.id));
    for (const [k, m] of Object.entries(HOUSE_OF_STAKE_DESCRIPTOR.capabilities.meanings))
      for (const src of m.sources) expect(ids.has(src), `${k} cites ${src}`).toBe(true);
    expect(HOUSE_OF_STAKE_DESCRIPTOR.sources.map((x) => x.id)).toEqual(s.sources.map((x) => x.id));

    // progress: one stage, counting up to the total
    expect(progress.length).toBeGreaterThan(5);
    expect(progress.at(-1)).toMatchObject({ done: 15, total: 15 });
    expect(progress.find((e) => e.message === 'veNEAR holders 502/502')).toBeDefined();
  });

  test('the same block gives the same bytes and sha256 (the recorded one)', async () => {
    const a = await replayedHos().module.fetch(at, undefined);
    const b = await replayedHos().module.fetch(at, undefined);
    const ea = encodeSnapshot(a);
    expect(encodeSnapshot(b).sha256).toBe(ea.sha256);
    expect(ea.sha256).toBe(expected.sha256);
    expect(ea.canonical.length).toBe(expected.bytes);
    expect({
      participants: a.participants.length,
      holdings: a.holdings.length,
      relationships: a.relationships.length,
      events: a.events.length,
    }).toEqual(expected.counts);
  });

  test('the ported power rule matches the contract (ft_balance_of at the same block)', async () => {
    const { rpc } = replayedHos();
    const pages = recording.calls.filter(
      (c) => (c.request.params as { method_name?: string }).method_name === 'get_accounts',
    );
    const accounts = pages.flatMap((c) =>
      (
        JSON.parse((c.response as { result: { result_text: string } }).result.result_text) as {
          account: VeAccount;
        }[]
      ).map((a) => a.account),
    );
    expect(expected.power_checks.length).toBeGreaterThanOrEqual(5);
    for (const check of expected.power_checks) {
      const acct = accounts.find((a) => a.account_id === check.account) as VeAccount;
      const v = await rpc.view<string>(
        VENEAR,
        'ft_balance_of',
        { account_id: check.account },
        { block_id: at.block_height },
      );
      expect(v.value).toBe(check.ft_balance_of);
      expect(ownedTotal(acct).power.toString()).toBe(v.value);
    }
  });

  test('a source that fails is named', async () => {
    const calls = recording.calls.filter(
      (c) => (c.request.params as { method_name?: string }).method_name !== 'get_proposals',
    );
    const err = (await replayedHos({ calls })
      .module.fetch(at, undefined)
      .catch((e) => e)) as InputError;
    expect(err).toBeInstanceOf(InputError);
    expect(err.code).toBe('source_failed');
    expect(err.message).toMatch(/^vote-proposals: vote\.dao\.get_proposals/);
    expect(err.message).toMatch(/drpc/);
  });

  test('no House of Stake before its contract existed: cannot_read, read on archival', async () => {
    const hosts: string[] = [];
    const rpc = rpcPool({
      fetch: (async (url: string) => {
        hosts.push(new URL(url).host);
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              name: 'HANDLER_ERROR',
              cause: { name: 'UNKNOWN_ACCOUNT', info: {} },
              message: 'Server error',
            },
          }),
        );
      }) as typeof fetch,
      endpoints: unpaced,
    });
    const err = await nearHouseOfStake({ rpc })
      .fetch({ block_height: 100, as_of: '2025-01-01T00:00:00Z' }, undefined)
      .catch((e) => e);
    expect(err).toMatchObject({ code: 'cannot_read' });
    expect(err.hint).toMatch(/2025-10-10/);
    expect(hosts).toEqual(['archival-rpc.mainnet.fastnear.com']);
  });
});

describe('veNEAR math', () => {
  const acct = (
    near: bigint,
    extra: bigint,
    delegations: VeAccount['delegations'],
    inNear = 0n,
    inExtra = 0n,
  ): VeAccount => ({
    account_id: 'x.near',
    update_timestamp: '0',
    balance: { near_balance: near.toString(), extra_venear_balance: extra.toString() },
    delegated_balance: {
      near_balance: inNear.toString(),
      extra_venear_balance: inExtra.toString(),
    },
    delegations,
  });
  const N = 10n ** 24n;

  test('own balance, minus delegations out, plus delegations in', () => {
    expect(ownedTotal(acct(10n * N, 2n * N, [])).power).toBe(12n * N);
    expect(ownedTotal(acct(10n * N, 2n * N, [{ account_id: 'd.near', bps: 10000 }])).power).toBe(
      0n,
    );
    const half = ownedTotal(
      acct(10n * N, 2n * N, [{ account_id: 'd.near', bps: 5000 }], 3n * N, N),
    );
    expect(half.delegations).toEqual([{ to: 'd.near', bps: 5000, amount: 6n * N }]);
    expect(half.power).toBe(6n * N + 4n * N);
    expect(half.out_total).toBe(6n * N);
  });

  test('delegated NEAR is truncated to milli-NEAR, as the contract does', () => {
    const [near, extra] = contribution(1234567890123456789012345n, 0n, 3333);
    expect(near % MILLI).toBe(0n);
    expect(extra).toBe(0n);
    expect(contribution(MILLI - 1n, 5n, 10000)).toEqual([0n, 0n]);
  });

  test('the V0 shape delegates the whole balance', () => {
    const v0 = { ...acct(4n * N, N, undefined), delegation: { account_id: 'd.near' } };
    delete (v0 as Partial<VeAccount>).delegations;
    expect(ownedTotal(v0).power).toBe(0n);
  });
});
