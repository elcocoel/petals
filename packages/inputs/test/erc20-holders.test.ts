// T162: erc20-holders, offline. The parts on small made-up data; the stored Ethereum, Arbitrum and
// Base data sets against recordings of their real state reads.
import { computeFigures, validateSnapshot } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { encodeCall, eventTopic } from '../src/evm/abi.ts';
import { ARBITRUM, BASE, ETHEREUM, type EvmChain } from '../src/evm/chains.ts';
import { hypersyncLogPages } from '../src/evm/hypersync.ts';
import { decodeAggregate, type EvmLog, type EvmReader, evmReader } from '../src/evm/reader.ts';
import { fileStore, getSnapshot, InputError, modules } from '../src/index.ts';
import {
  applyTransfers,
  DEFAULT_WINDOW_DAYS,
  ERC20_HOLDERS_DESCRIPTOR,
  erc20Holders,
  HOLDERS_KEPT,
  type HolderTarget,
  holdersTarget,
  newTransferReplay,
  pullErc20Holders,
  REPLAY_LOG_BUDGET,
  tailSlices,
  tokenText,
} from '../src/modules/erc20-holders.ts';
import { type Recording, replayFetch } from '../src/rpc/recording.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';
import { loadRecording, noSleep, rowFor, storedSnapshot } from './helpers/recordings.ts';
import { FIXTURES, tmp } from './helpers/snapshots.ts';
import { BANK, DPX, SEAM } from './helpers/targets.ts';

const word = (n: bigint) => n.toString(16).padStart(64, '0');
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const topicOf = (a: string) => `0x${a.slice(2).padStart(64, '0')}`;
const TRANSFER = eventTopic('Transfer(address,address,uint256)');
const ZERO = addr(0);
const transfer = (from: string, to: string, value: bigint): EvmLog => ({
  address: '0xtoken',
  topics: [TRANSFER, topicOf(from), topicOf(to)],
  data: `0x${word(value)}`,
  blockNumber: '0x1',
  logIndex: '0x0',
  transactionHash: '0xt',
});

const TOKEN = addr(0xaa);
const target = (chain: EvmChain): HolderTarget => ({
  chain,
  token: TOKEN,
  population: `erc20-holders-test-${TOKEN}`,
});

function fakeReader(
  balances: Record<string, bigint>,
  supply: bigint,
  pages: EvmLog[][] = [],
  head = 100,
  ranges: [number, number][] = [],
): EvmReader {
  const text = Buffer.from('TT').toString('hex').padEnd(64, '0');
  const answers = new Map<string, string>([
    [encodeCall('symbol()'), `0x${word(0x20n)}${word(2n)}${text}`],
    [encodeCall('decimals()'), `0x${word(0n)}`],
    [encodeCall('totalSupply()'), `0x${word(supply)}`],
    ...Object.entries(balances).map(
      ([a, v]) => [encodeCall('balanceOf(address)', a), `0x${word(v)}`] as [string, string],
    ),
  ]);
  return {
    block: async (ref) => ({
      number: typeof ref === 'number' ? ref : head,
      hash: '0xh',
      timestamp: 86400,
      as_of: '1970-01-02T00:00:00Z',
    }),
    call: async () => '0x',
    multicall: async (calls) =>
      calls.map((c) => ({ ok: answers.has(c.data), data: answers.get(c.data) ?? '0x' })),
    logPages: async function* (_filter, from, to) {
      ranges.push([from, to]);
      yield* pages;
    },
    logs: async () => pages.flat(),
    servedBy: () => 'https://rpc.test',
    stats: () => ({ calls: {}, http_429: {}, failures: {} }),
  };
}

/** A Blockscout that lists these holders, one row a page. */
function fakeBlockscout(
  rows: { hash: string; value: bigint; is_contract?: boolean }[],
  holders: number,
  supply: bigint,
): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    fetch: async (input) => {
      const url = new URL(String(input));
      urls.push(url.toString());
      if (!url.pathname.endsWith('/holders'))
        return Response.json({ holders_count: String(holders), total_supply: supply.toString() });
      const i = Number(url.searchParams.get('n') ?? 0);
      const row = rows[i];
      return Response.json({
        items: row
          ? [
              {
                address: {
                  hash: row.hash.toUpperCase().replace('0X', '0x'),
                  is_contract: row.is_contract ?? false,
                },
                value: row.value.toString(),
              },
            ]
          : [],
        next_page_params: i + 1 < rows.length ? { n: i + 1 } : null,
      });
    },
  };
}

/** What a recording says the chain answered: balanceOf per address, and totalSupply. */
function recordedState(rec: Recording): { balances: Map<string, bigint>; supply?: bigint } {
  const out: { balances: Map<string, bigint>; supply?: bigint } = { balances: new Map() };
  for (const c of rec.calls) {
    if (c.request.method !== 'eth_call') continue;
    const data = (c.request.params as [{ data: string }])[0].data;
    const rows = decodeAggregate((c.response as { result: string }).result);
    const asked = [...data.matchAll(/70a08231000000000000000000000000([0-9a-f]{40})/g)];
    asked.forEach((m, i) => {
      out.balances.set(`0x${m[1]}`, BigInt(rows[i]?.data ?? '0x0'));
    });
    if (asked.length === 0) out.supply = BigInt(rows[2]?.data ?? '0x0'); // symbol, decimals, supply
  }
  return out;
}

describe('tailSlices', () => {
  test('adds up exactly, in pieces no larger than the floor', () => {
    const s = tailSlices(1001n, 500, 10n);
    expect(s).toHaveLength(101);
    expect(s.reduce((a, x) => a + x.amount, 0n)).toBe(1001n);
    expect(s.reduce((a, x) => a + x.count, 0)).toBe(500);
    for (const x of s) expect(x.amount).toBeLessThanOrEqual(10n);
  });

  test('stops at the cap, and never makes more slices than holders', () => {
    const capped = tailSlices(1_000_000n, 1_000_000, 1n, 50);
    expect(capped).toHaveLength(50);
    expect(capped.reduce((a, x) => a + x.amount, 0n)).toBe(1_000_000n);
    expect(tailSlices(1000n, 3, 1n)).toHaveLength(3);
  });

  test('nothing left means no slices; an unknown count still gives a valid row', () => {
    expect(tailSlices(0n, 10, 5n)).toEqual([]);
    expect(tailSlices(9n, 0, 5n)).toEqual([{ amount: 9n, count: 1 }]);
    const unknown = tailSlices(10n, null, 5n);
    expect(unknown).toEqual([
      { amount: 5n, count: 1 },
      { amount: 5n, count: 1 },
    ]);
  });
});

describe('applyTransfers', () => {
  test('mints, moves and burns; the zero address holds nothing', () => {
    const r = newTransferReplay();
    applyTransfers(r, [transfer(ZERO, addr(1), 10n), transfer(addr(1), addr(2), 4n)]);
    applyTransfers(r, [transfer(addr(2), ZERO, 1n)]);
    expect(r.balances.get(addr(1))).toBe(6n);
    expect(r.balances.get(addr(2))).toBe(3n);
    expect(r.balances.has(ZERO)).toBe(false);
    expect(r.logs).toBe(3);
  });

  test('skips what is not an ERC-20 Transfer', () => {
    const r = newTransferReplay();
    const nft = {
      ...transfer(ZERO, addr(1), 1n),
      data: '0x',
      topics: [TRANSFER, topicOf(ZERO), topicOf(addr(1)), topicOf(addr(7))],
    };
    applyTransfers(r, [nft]);
    expect(r).toMatchObject({ logs: 0, skipped: 1 });
  });
});

test('tokenText reads a string or an old bytes32 symbol', () => {
  const text = Buffer.from('ABC').toString('hex').padEnd(64, '0');
  expect(tokenText(`0x${word(0x20n)}${word(3n)}${text}`)).toBe('ABC');
  expect(tokenText(`0x${text}`)).toBe('ABC');
});

describe('pullErc20Holders, through a holders list', () => {
  const rows = [
    { hash: addr(1), value: 500n, is_contract: true },
    { hash: addr(2), value: 300n },
    { hash: addr(3), value: 100n },
  ];
  const balances = { [addr(1)]: 500n, [addr(2)]: 300n, [addr(3)]: 100n };

  test('builds a valid snapshot: top holders plus a declared tail equal the supply', async () => {
    const { fetch } = fakeBlockscout(rows, 13, 1000n);
    const { snapshot: s, checks } = await pullErc20Holders(target(ETHEREUM), {
      reader: fakeReader(balances, 1000n),
      fetch,
      sleep: noSleep,
    });
    expect(validateSnapshot(s).ok).toBe(true);
    expect(checks).toMatchObject({
      list: 'blockscout',
      holders_total: 13,
      listed: 3,
      tail_raw: '100',
      drawn_vs_supply_raw: '0',
      balance_differences: 0,
      source_supply_difference_raw: '0',
    });
    expect(s.holdings.reduce((a, h) => a + BigInt(h.amount_raw ?? '0'), 0n)).toBe(1000n);
    expect(s.coverage).toMatchObject({ participants_total: 13, amount_total: '1000', unit: 'TT' });
    expect(s.coverage.grouped?.[0]).toMatchObject({ rows_folded: 10, amount: '100' });
    expect(s.participants[0]).toMatchObject({ id: addr(1), kind: 'contract', identity: null });
    expect(s.participants[1]?.kind).toBe('unknown');
    expect(s.snapshot.final).toBe(false); // the list is not pinned to the block
    expect(s.network).toMatchObject({
      id: 'erc20-holders',
      title: 'TT holders, Ethereum',
      params: { chain: 'ethereum', token: TOKEN, window_days: '7' },
    });
    expect(s.coverage.note).toMatch(/by construction/);
  });

  test('amounts come from the chain; a list that differs is stated', async () => {
    const { fetch } = fakeBlockscout(rows, 13, 1007n);
    const { snapshot: s, checks } = await pullErc20Holders(target(ETHEREUM), {
      reader: fakeReader({ ...balances, [addr(3)]: 90n }, 1000n),
      fetch,
      sleep: noSleep,
    });
    expect(checks).toMatchObject({
      balance_differences: 1,
      balance_difference_raw: '10',
      source_supply_difference_raw: '7',
    });
    expect(s.holdings.find((h) => h.participant === addr(3))?.amount_raw).toBe('90');
    expect(s.coverage.note).toMatch(/differs from totalSupply\(\) by 7/);
    expect(s.coverage.note).toMatch(/for 1 of 3 holders, by 10 in all/);
  });

  test('a slice never outranks a listed holder', async () => {
    const { fetch } = fakeBlockscout(rows, 1000, 5000n);
    const { snapshot: s, checks } = await pullErc20Holders(target(ETHEREUM), {
      reader: fakeReader(balances, 5000n),
      fetch,
      sleep: noSleep,
    });
    expect(checks.no_slice_outranks).toBe(3);
    const f = computeFigures(s, { measure: 'token_balance', petals: 3 });
    expect(f.shares.map((x) => x.id)).toEqual([addr(1), addr(2), addr(3)]);
    expect(f.tail.share).toBeCloseTo(0.82, 2);
  });

  test('refuses a list that cannot be the top, and more than the supply', async () => {
    const big = fakeBlockscout(rows, 4, 1_000_000n);
    await expect(
      pullErc20Holders(target(ETHEREUM), {
        reader: fakeReader(balances, 1_000_000n),
        fetch: big.fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/the list is not the top/);
    await expect(
      pullErc20Holders(target(ETHEREUM), {
        reader: fakeReader(balances, 10n),
        fetch: fakeBlockscout(rows, 3, 10n).fetch,
        sleep: noSleep,
      }),
    ).rejects.toThrow(/over totalSupply/);
  });

  test('says plainly when the chain does not answer as an ERC-20', async () => {
    const reader = { ...fakeReader({}, 1n), multicall: async () => [] };
    await expect(pullErc20Holders(target(ETHEREUM), { reader })).rejects.toMatchObject({
      code: 'cannot_read',
    });
  });

  test('follows the paging the source gives', async () => {
    const { fetch, urls } = fakeBlockscout(rows, 13, 1000n);
    await pullErc20Holders(target(ETHEREUM), {
      reader: fakeReader(balances, 1000n),
      fetch,
      sleep: noSleep,
    });
    expect(urls[0]).toBe(`https://eth.blockscout.com/api/v2/tokens/${TOKEN}`);
    expect(urls.slice(1)).toEqual([
      `https://eth.blockscout.com/api/v2/tokens/${TOKEN}/holders`,
      `https://eth.blockscout.com/api/v2/tokens/${TOKEN}/holders?n=1`,
      `https://eth.blockscout.com/api/v2/tokens/${TOKEN}/holders?n=2`,
    ]);
  });

  test('when Blockscout is down and was not asked for by name, a replay answers', async () => {
    const lost: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const pages = [[transfer(ZERO, addr(1), 500n), transfer(ZERO, addr(2), 500n)]];
    const said: string[] = [];
    const { checks } = await pullErc20Holders(target(ETHEREUM), {
      reader: fakeReader({ [addr(1)]: 500n, [addr(2)]: 500n }, 1000n, pages),
      fetch: lost,
      sleep: noSleep,
      onProgress: (e) => said.push(e.message),
    });
    expect(checks).toMatchObject({ list: 'replay', window: { days: 7 }, tail_raw: '0' });
    expect(said.join(' ')).toMatch(/did not answer.*reading the Transfer logs instead/);
    await expect(
      pullErc20Holders(target(ETHEREUM), {
        list: 'blockscout',
        reader: fakeReader({}, 1000n, pages),
        fetch: lost,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ code: 'source_failed' });
  });

  test('a 403 and a lost connection are told apart', async () => {
    const forbidden: typeof fetch = async () => new Response('Just a moment...', { status: 403 });
    await expect(
      pullErc20Holders(target(ETHEREUM), {
        list: 'blockscout',
        reader: fakeReader(balances, 1000n),
        fetch: forbidden,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ code: 'cannot_read', message: expect.stringContaining('403') });
    const lost: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(
      pullErc20Holders(target(ETHEREUM), {
        list: 'blockscout',
        reader: fakeReader(balances, 1000n),
        fetch: lost,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ code: 'source_failed' });
  });
});

describe('pullErc20Holders, a full replay (the offline flag)', () => {
  const pages = [
    [transfer(ZERO, addr(1), 600n), transfer(ZERO, addr(2), 300n)],
    [transfer(ZERO, addr(3), 100n), transfer(addr(1), addr(4), 50n)],
  ];
  const balances = { [addr(1)]: 550n, [addr(2)]: 300n, [addr(3)]: 100n, [addr(4)]: 50n };
  const arb = target(ARBITRUM);

  test('keyless where the chain has wide logs: the sum is a real check', async () => {
    const { snapshot: s, checks } = await pullErc20Holders(arb, {
      full: true,
      reader: fakeReader(balances, 1000n, pages),
    });
    expect(checks).toMatchObject({
      list: 'replay',
      logs: 4,
      holders_total: 4,
      replay_vs_supply_raw: '0',
      tail_raw: '0',
      slices: 0,
    });
    expect(s.snapshot.final).toBe(true);
    expect(s.coverage.note).toMatch(/equal to totalSupply/);
    expect(validateSnapshot(s).ok).toBe(true);
  });

  test('keeps the top and folds the rest', async () => {
    const { checks, snapshot: s } = await pullErc20Holders(arb, {
      full: true,
      reader: fakeReader(balances, 1000n, pages),
      keep: 2,
    });
    expect(checks).toMatchObject({ listed: 2, tail_raw: '150', holders_total: 4 });
    expect(s.coverage.grouped?.[0]).toMatchObject({ rows_folded: 2, amount: '150' });
  });

  test('a small difference from the supply is stated; a large one throws', async () => {
    const { checks, snapshot: s } = await pullErc20Holders(arb, {
      full: true,
      reader: fakeReader({ [addr(1)]: 1_000_000n }, 1_000_001n, [
        [transfer(ZERO, addr(1), 1_000_000n)],
      ]),
      keep: 1,
    });
    expect(checks.replay_vs_supply_raw).toBe('-1');
    expect(s.coverage.note).toMatch(/1 below totalSupply/);
    await expect(
      pullErc20Holders(arb, { full: true, reader: fakeReader(balances, 2000n, pages) }),
    ).rejects.toThrow(/the replay sums to 1000/);
  });

  test('on a chain with no keyless logs, it says so and asks for no key silently', async () => {
    const err = (await pullErc20Holders(target(BASE), {
      full: true,
      reader: fakeReader(balances, 1000n, pages),
    }).catch((e) => e)) as InputError;
    expect(err).toBeInstanceOf(InputError);
    expect(err.code).toBe('cannot_read');
    expect(err.message).toMatch(/no keyless route/);
    expect(err.message).toMatch(/403/);
    expect(err.hint).toMatch(/ENVIO_API_TOKEN/);
  });

  test('with a token, Base goes through HyperSync and the snapshot says so', async () => {
    const secret = 'not-a-real-token-1234';
    const headers: string[] = [];
    const hypersyncFetch: typeof fetch = async (input, init) => {
      expect(String(input)).toBe('https://base.hypersync.xyz/query');
      headers.push(new Headers(init?.headers).get('authorization') ?? '');
      return Response.json({
        data: [
          {
            logs: [
              {
                block_number: 5,
                log_index: 0,
                topic0: TRANSFER,
                topic1: topicOf(ZERO),
                topic2: topicOf(addr(1)),
                data: `0x${word(1000n)}`,
              },
            ],
          },
        ],
        next_block: 101,
      });
    };
    const { snapshot: s, checks } = await pullErc20Holders(target(BASE), {
      full: true,
      reader: fakeReader({ [addr(1)]: 1000n }, 1000n),
      hypersyncToken: secret,
      hypersyncFetch,
    });
    expect(headers).toEqual([`Bearer ${secret}`]);
    expect(checks).toMatchObject({ logs: 1, replay_vs_supply_raw: '0', hypersync: { queries: 1 } });
    const list = s.sources.find((x) => x.id === 'erc20-holder-list');
    expect(list).toMatchObject({ url: 'https://base.hypersync.xyz', kind: 'api' });
    expect(list?.method).toMatch(/not keyless/);
    expect(JSON.stringify(s)).not.toContain(secret);
  });
});

describe('pullErc20Holders, the default: a window of Transfer logs', () => {
  const seen = [
    [transfer(addr(1), addr(2), 5n), transfer(addr(3), addr(4), 1n)],
    [transfer(addr(4), addr(5), 1n)],
  ];
  // addr(4) passed its tokens on, so it has moved tokens and holds none
  const balances = {
    [addr(1)]: 300n,
    [addr(2)]: 400n,
    [addr(3)]: 50n,
    [addr(4)]: 0n,
    [addr(5)]: 1n,
  };
  const HEAD = 1_000_000;

  test("reads only the last 7 days, by the chain's block time", async () => {
    expect(DEFAULT_WINDOW_DAYS).toBe(7);
    for (const [chain, blocks] of [
      [ETHEREUM, 50_400],
      [BASE, 302_400],
    ] as const) {
      const ranges: [number, number][] = [];
      await pullErc20Holders(target(chain), {
        list: 'replay',
        reader: fakeReader(balances, 1000n, seen, HEAD, ranges),
      });
      expect(ranges).toEqual([[HEAD - blocks, HEAD]]);
    }
    const ranges: [number, number][] = [];
    await pullErc20Holders(target(ARBITRUM), {
      windowDays: 1,
      reader: fakeReader(balances, 1000n, seen, 100_000_000, ranges),
    });
    expect(ranges).toEqual([[100_000_000 - 345_600, 100_000_000]]);
  });

  test('participants are addresses seen in the window, with balanceOf; the rest is not read', async () => {
    const { snapshot: s, checks } = await pullErc20Holders(target(BASE), {
      reader: fakeReader(balances, 1000n, seen, HEAD),
    });
    expect(validateSnapshot(s).ok).toBe(true);
    expect(checks).toMatchObject({
      list: 'replay',
      holders_total: null,
      window: { days: 7, from_block: HEAD - 302_400, with_balance: 4 },
      listed: 4,
      tail_raw: '249',
      drawn_vs_supply_raw: '0',
    });
    expect(s.holdings.map((h) => [h.participant, h.amount_raw])).toEqual([
      [addr(2), '400'],
      [addr(1), '300'],
      [addr(3), '50'],
      [addr(5), '1'],
      ['group:not-read', '249'],
    ]);
    expect(s.holdings.reduce((a, h) => a + BigInt(h.amount_raw ?? '0'), 0n)).toBe(1000n);
    expect(s.coverage).toMatchObject({
      participants_total: 4,
      participants_included: 4,
      amount_total: '1000',
      amount_included: '751',
    });
    expect(s.coverage.grouped?.[0]).toMatchObject({ rows_folded: 0, amount: '249' });
    expect(s.participants.at(-1)).toMatchObject({ id: 'group:not-read', kind: 'group', count: 1 });
    expect(s.snapshot.final).toBe(true);
    expect(s.network.params).toEqual({ chain: 'base', token: TOKEN, window_days: '7' });
    const note = s.coverage.note ?? '';
    expect(note).toMatch(/only addresses in a Transfer log between block 697,600/);
    expect(note).toMatch(/not every holder/i);
    expect(note).toMatch(/it was not read, it is not attributed to anyone/);
    expect(note).toMatch(/how many addresses hold it is not known/);
  });

  test('keeps the largest of what it saw', async () => {
    const { snapshot: s, checks } = await pullErc20Holders(target(BASE), {
      reader: fakeReader(balances, 1000n, seen, HEAD),
      keep: 2,
    });
    expect(checks).toMatchObject({ listed: 2, tail_raw: '300' });
    expect(s.coverage).toMatchObject({ participants_total: 4, participants_included: 2 });
  });

  test('Base needs no token for a window, and uses HyperSync when there is one', async () => {
    const keyless = await pullErc20Holders(target(BASE), {
      reader: fakeReader(balances, 1000n, seen, HEAD),
    });
    expect(keyless.snapshot.sources.find((x) => x.id === 'erc20-holder-list')?.kind).toBe('chain');
    const hypersyncFetch: typeof fetch = async () =>
      Response.json({
        data: [
          {
            logs: [
              {
                topic0: TRANSFER,
                topic1: topicOf(addr(1)),
                topic2: topicOf(addr(2)),
                data: `0x${word(5n)}`,
              },
            ],
          },
        ],
        next_block: HEAD + 1,
      });
    const { snapshot } = await pullErc20Holders(target(BASE), {
      reader: fakeReader(balances, 1000n, [], HEAD),
      hypersyncToken: 'not-a-real-token',
      hypersyncFetch,
    });
    const list = snapshot.sources.find((x) => x.id === 'erc20-holder-list');
    expect(list).toMatchObject({ url: BASE.hypersync, kind: 'api' });
  });

  test('the budget stops a replay early and says why and what it would take', async () => {
    const pages = [[transfer(addr(1), addr(2), 1n)], [transfer(addr(1), addr(2), 1n)]];
    let read = 0;
    const counted = fakeReader(balances, 1000n, pages, HEAD);
    const reader: EvmReader = {
      ...counted,
      logPages: async function* () {
        for (const p of pages) {
          read++;
          yield p;
        }
      },
    };
    const err = (await pullErc20Holders(target(ARBITRUM), { reader, maxLogs: 0 }).catch(
      (e) => e,
    )) as InputError;
    expect(err).toBeInstanceOf(InputError);
    expect(err.code).toBe('cannot_read');
    expect(err.message).toMatch(/more than 0 Transfer logs in the last 7 days/);
    expect(err.hint).toMatch(/shorter window_days/);
    expect(err.hint).toMatch(/pull-module\.ts --full/);
    expect(read).toBe(1); // stopped at the first page over the budget
    expect(REPLAY_LOG_BUDGET.rpc).toBeLessThanOrEqual(200_000);
    expect(REPLAY_LOG_BUDGET.hypersync).toBeLessThanOrEqual(30_000);
  });

  test('only the offline flag lifts the budget', async () => {
    const pages = [[transfer(ZERO, addr(1), 1000n)]];
    const { checks } = await pullErc20Holders(target(ARBITRUM), {
      reader: fakeReader({ [addr(1)]: 1000n }, 1000n, pages, HEAD),
      maxLogs: 0,
      full: true,
    });
    expect(checks.replay_vs_supply_raw).toBe('0');
  });

  test('too many addresses, or too many keyless calls, stop it too', async () => {
    const crowd = Array.from({ length: 20_001 }, (_, i) => transfer(ZERO, addr(i + 1), 1n));
    await expect(
      pullErc20Holders(target(ARBITRUM), { reader: fakeReader({}, 1000n, [crowd], HEAD) }),
    ).rejects.toMatchObject({ code: 'cannot_read', message: expect.stringContaining('20,001') });
    await expect(
      pullErc20Holders(target(BASE), {
        reader: fakeReader({}, 1000n, [], HEAD),
        windowDays: 30,
      }),
    ).rejects.toMatchObject({
      code: 'cannot_read',
      message: expect.stringContaining('keyless log calls'),
    });
  });
});

describe('hypersyncLogPages', () => {
  const secret = 'not-a-real-token-5678';
  const filter = { address: TOKEN, topics: [TRANSFER] };
  const page = (next: number) =>
    Response.json({
      data: [
        {
          logs: [
            {
              block_number: 1,
              log_index: 2,
              topic0: TRANSFER,
              topic1: '0xa',
              topic2: '0xb',
              data: '0xc',
            },
          ],
        },
      ],
      next_block: next,
    });

  test('walks to the block asked for, and maps fields to logs', async () => {
    const bodies: { from_block: number; to_block: number }[] = [];
    const fetch: typeof globalThis.fetch = async (_u, init) => {
      const b = JSON.parse(String(init?.body));
      bodies.push(b);
      return page(b.from_block === 0 ? 50 : 11);
    };
    const pages = [];
    for await (const p of hypersyncLogPages(BASE, filter, 0, 10, { token: secret, fetch }))
      pages.push(p);
    expect(pages[0]?.[0]).toEqual({
      address: TOKEN,
      topics: [TRANSFER, '0xa', '0xb'],
      data: '0xc',
      blockNumber: '0x1',
      logIndex: '0x2',
      transactionHash: '',
    });
    expect(bodies[0]).toMatchObject({
      from_block: 0,
      to_block: 11,
      logs: [{ address: [TOKEN], topics: [[TRANSFER]] }],
    });
    expect(pages).toHaveLength(1); // next_block 50 is past the block asked for
  });

  test('waits out a 429 for as long as the server says', async () => {
    const waits: number[] = [];
    let n = 0;
    const fetch: typeof globalThis.fetch = async () =>
      ++n === 1
        ? new Response('', { status: 429, headers: { 'x-ratelimit-reset': '7' } })
        : page(11);
    const stats = { queries: 0, rate_limit_waits: 0 };
    for await (const _ of hypersyncLogPages(BASE, filter, 0, 10, {
      token: secret,
      fetch,
      stats,
      sleep: async (ms) => {
        waits.push(ms);
      },
    })) {
      /* drain */
    }
    expect(waits).toEqual([8000]);
    expect(stats).toEqual({ queries: 2, rate_limit_waits: 1 });
  });

  test('a refused token never appears in the error', async () => {
    const fetch: typeof globalThis.fetch = async () => new Response('no', { status: 403 });
    const err = await (async () => {
      for await (const _ of hypersyncLogPages(BASE, filter, 0, 10, { token: secret, fetch })) {
        /* drain */
      }
    })().catch((e) => e as InputError);
    expect((err as InputError).code).toBe('source_failed');
    expect(`${(err as InputError).message} ${(err as InputError).hint}`).not.toContain(secret);
  });

  test('asks again after a lost connection, then gives up without the token', async () => {
    let n = 0;
    const flaky: typeof globalThis.fetch = async () => {
      if (++n === 1) throw new TypeError('fetch failed');
      return page(11);
    };
    const got = [];
    for await (const p of hypersyncLogPages(BASE, filter, 0, 10, {
      token: secret,
      fetch: flaky,
      sleep: noSleep,
    }))
      got.push(p);
    expect(got).toHaveLength(1);
    const down: typeof globalThis.fetch = async () => {
      throw new TypeError(`fetch failed`);
    };
    const err = await (async () => {
      for await (const _ of hypersyncLogPages(BASE, filter, 0, 10, {
        token: secret,
        fetch: down,
        sleep: noSleep,
      })) {
        /* drain */
      }
    })().catch((e) => e as InputError);
    expect((err as InputError).code).toBe('source_failed');
    expect((err as InputError).message).not.toContain(secret);
  });

  test('stops on a walk that does not advance', async () => {
    const stuck: typeof globalThis.fetch = async () => page(0);
    await expect(
      (async () => {
        for await (const _ of hypersyncLogPages(BASE, filter, 0, 10, {
          token: secret,
          fetch: stuck,
        })) {
          /* drain */
        }
      })(),
    ).rejects.toThrow(/did not advance/);
  });
});

describe('the reader on other chains', () => {
  const answer = (urls: string[], result: unknown): typeof fetch =>
    (async (input, init) => {
      urls.push(String(input));
      return Response.json({ jsonrpc: '2.0', id: JSON.parse(String(init?.body)).id, result });
    }) as typeof fetch;

  test.each([
    [BASE, 'https://base.gateway.tenderly.co'],
    [ARBITRUM, 'https://arbitrum.gateway.tenderly.co'],
    [ETHEREUM, 'https://mainnet.gateway.tenderly.co'],
  ])('$name reads from its own endpoint', async (chain, url) => {
    const urls: string[] = [];
    const reader = evmReader({
      chain,
      sleep: noSleep,
      fetch: answer(urls, { number: '0x1', hash: '0xh', timestamp: '0x1' }),
    });
    await reader.block(1);
    expect(urls).toEqual([url]);
    expect(reader.servedBy('state')).toBe(url);
  });

  test('walks a narrow endpoint in chunks it accepts, in block order', async () => {
    const ranges: [string, string][] = [];
    const fetch: typeof globalThis.fetch = async (_u, init) => {
      const b = JSON.parse(String(init?.body));
      ranges.push([b.params[0].fromBlock, b.params[0].toBlock]);
      return Response.json({ jsonrpc: '2.0', id: b.id, result: [] });
    };
    const reader = evmReader({ chain: BASE, fetch, sleep: noSleep });
    await reader.logs({ address: TOKEN }, 0, 2499);
    expect(ranges).toEqual([
      ['0x0', '0x3e7'],
      ['0x3e8', '0x7cf'],
      ['0x7d0', '0x9c3'],
    ]);
  });

  test('before Multicall3 on an L2 it reads one by one: no Multicall2 there', async () => {
    const seen: string[] = [];
    const fetch: typeof globalThis.fetch = async (_u, init) => {
      const b = JSON.parse(String(init?.body));
      seen.push(b.params[0].to);
      return Response.json({ jsonrpc: '2.0', id: b.id, result: `0x${word(1n)}` });
    };
    const reader = evmReader({ chain: BASE, fetch, sleep: noSleep });
    await reader.multicall([{ to: TOKEN, data: '0x01' }], BASE.multicall3_from - 1);
    expect(seen).toEqual([TOKEN]);
  });
});

describe('the list path on real recorded chain data', () => {
  // BANK's real balances and supply, recorded, with a Blockscout that lists the same holders: the
  // list path end to end, because Blockscout itself stopped answering this client mid-build.
  const row = rowFor('erc20-holders', BANK);
  const s = storedSnapshot(row);
  const recording = loadRecording('erc20-holders-ethereum-bank');
  const listed = s.holdings.filter((h) => !h.participant.startsWith('group:'));

  const blockscout = (values: (raw: string) => string, supply: string): typeof fetch =>
    (async (input, init) => {
      if (init?.method === 'POST') return replayFetch(recording).fetch(input, init);
      const url = new URL(String(input));
      if (!url.pathname.endsWith('/holders'))
        return Response.json({ holders_count: '5571', total_supply: supply });
      const from = Number(url.searchParams.get('n') ?? 0);
      return Response.json({
        items: listed.slice(from, from + 50).map((h) => ({
          address: { hash: h.participant, is_contract: from === 0 },
          value: values(h.amount_raw ?? '0'),
        })),
        next_page_params: from + 50 < listed.length ? { n: from + 50 } : null,
      });
    }) as typeof fetch;
  const supply = '1000000000000000000000000000';

  test('gives the same amounts as the replay, marked not final', async () => {
    const { snapshot, checks } = await pullErc20Holders(holdersTarget(BANK), {
      list: 'blockscout',
      fetch: blockscout((raw) => raw, supply),
      sleep: noSleep,
    });
    expect(checks).toMatchObject({
      list: 'blockscout',
      listed: 300,
      holders_total: 5571,
      drawn_vs_supply_raw: '0',
      balance_differences: 0,
      source_supply_difference_raw: '0',
    });
    expect(snapshot.snapshot.final).toBe(false);
    expect(snapshot.holdings.slice(0, 300)).toEqual(listed);
    expect(snapshot.participants[0]?.kind).toBe('contract');
    expect(validateSnapshot(snapshot).ok).toBe(true);
    const list = snapshot.sources.find((x) => x.id === 'erc20-holder-list');
    expect(list).toMatchObject({ kind: 'api', url: 'https://eth.blockscout.com' });
  });

  test('the chain wins over the list, and the difference is stated', async () => {
    const { snapshot, checks } = await pullErc20Holders(holdersTarget(BANK), {
      list: 'blockscout',
      fetch: blockscout((raw) => (BigInt(raw) + 1n).toString(), '1000000000000000000000000005'),
      sleep: noSleep,
    });
    expect(checks).toMatchObject({ balance_differences: 300, balance_difference_raw: '300' });
    expect(checks.source_supply_difference_raw).toBe('5');
    expect(snapshot.holdings.slice(0, 300)).toEqual(listed);
    expect(snapshot.coverage.note).toMatch(/for 300 of 300 holders/);
  });
});

describe('erc20-holders, any token', () => {
  test('takes a chain and a token, and checks them', () => {
    expect(ERC20_HOLDERS_DESCRIPTOR.live).toBe(true);
    expect(ERC20_HOLDERS_DESCRIPTOR.params.chain?.required).toBe(true);
    expect(ERC20_HOLDERS_DESCRIPTOR.params.token?.required).toBe(true);
    expect(
      holdersTarget({ chain: 'base', token: TOKEN.toUpperCase().replace('0X', '0x') }),
    ).toMatchObject({ chain: BASE, token: TOKEN });
    for (const params of [
      { chain: 'polygon', token: TOKEN },
      { chain: 'base', token: '0x12' },
      undefined,
    ])
      expect(() => holdersTarget(params)).toThrow(/needs a chain and a token/);
  });

  test('a chat can pick a window, and can never start a whole history', async () => {
    const mod = modules['erc20-holders'];
    if (!mod?.keyFor) throw new Error('not registered');
    expect(ERC20_HOLDERS_DESCRIPTOR.params.window_days?.required).toBe(false);
    expect(Object.keys(ERC20_HOLDERS_DESCRIPTOR.params).sort()).toEqual([
      'chain',
      'token',
      'window_days',
    ]);
    const seven = mod.keyFor({ chain: 'base', token: TOKEN });
    expect(mod.keyFor({ chain: 'base', token: TOKEN, window_days: '7' })).toEqual(seven);
    expect(mod.keyFor({ chain: 'base', token: TOKEN, window_days: '2' })).not.toEqual(seven);
    const store = fileStore({ fixtures: FIXTURES, cache: tmp('holders-full') });
    const refused: Record<string, string>[] = [
      { chain: 'base', token: TOKEN, full: 'true' },
      { chain: 'base', token: TOKEN, window_days: '31' },
    ];
    for (const params of refused)
      await expect(
        getSnapshot({ network: 'erc20-holders', params }, { store }),
      ).rejects.toMatchObject({ code: 'bad_input' });
  });

  test('reads only the latest block, unless a fixture holds another', async () => {
    const mod = erc20Holders({ sleep: noSleep });
    await expect(
      mod.resolveAt({ block_height: 5 }, { chain: 'ethereum', token: TOKEN }),
    ).rejects.toMatchObject({ code: 'cannot_read' });
    const row = rowFor('erc20-holders', DPX);
    await expect(mod.resolveAt({ block_height: row.block_height as number }, DPX)).resolves.toEqual(
      {
        block_height: row.block_height,
        as_of: row.as_of,
      },
    );
  });

  test('two tokens read at the same block are not taken for one another', async () => {
    const block = 777;
    const make = (token: string): Snapshot =>
      ({
        ...storedSnapshot(rowFor('erc20-holders', DPX)),
        network: {
          id: 'erc20-holders',
          chain: 'eip155:1',
          population: `erc20-token-ethereum-${token}-7d`,
          title: 'x',
          params: { chain: 'ethereum', token },
        },
        snapshot: { as_of: '2026-11-05T00:00:00Z', block_height: block, final: true },
      }) as Snapshot;
    const fetched: string[] = [];
    const mod = {
      ...erc20Holders(),
      resolveAt: async () => ({ block_height: block, as_of: '2026-11-05T00:00:00Z' }),
      fetch: async (_at: unknown, params: { token?: string } | undefined) => {
        fetched.push(params?.token ?? '');
        return make(params?.token ?? '');
      },
    };
    const store = fileStore({ fixtures: FIXTURES, cache: tmp('holders-key') });
    const deps = { store, modules: { 'erc20-holders': mod as never } };
    const a = addr(1);
    const b = addr(2);
    const first = await getSnapshot(
      { network: 'erc20-holders', params: { chain: 'ethereum', token: a } },
      deps,
    );
    const second = await getSnapshot(
      { network: 'erc20-holders', params: { chain: 'ethereum', token: b } },
      deps,
    );
    const again = await getSnapshot(
      { network: 'erc20-holders', params: { chain: 'ethereum', token: a } },
      deps,
    );
    expect(fetched).toEqual([a, b]);
    expect(second.sha256).not.toBe(first.sha256);
    expect(again).toMatchObject({ sha256: first.sha256, reused: true });
  });
});

/** One answer of a string, as a contract gives it. */
const stringAnswer = (text: string) => {
  const hex = Buffer.from(text).toString('hex');
  return `${word(32n)}${word(BigInt(text.length))}${hex.padEnd(64, '0')}`;
};
/** What Multicall3 answers: (bool, bytes)[], each call successful. */
function aggregateAnswer(answers: string[]): string {
  const tuples = answers.map((a) => `${word(1n)}${word(64n)}${word(BigInt(a.length / 2))}${a}`);
  let offset = tuples.length * 32;
  const offsets = tuples.map((t) => {
    const here = offset;
    offset += t.length / 2;
    return word(BigInt(here));
  });
  return `0x${word(32n)}${word(BigInt(tuples.length))}${offsets.join('')}${tuples.join('')}`;
}

describe('in a chat, whole history first where a chain serves wide logs', () => {
  const GNOSIS_TOKEN = addr(77);
  const params = { chain: 'gnosis', token: GNOSIS_TOKEN };
  const block = 30_000_000;
  const OVER_CAP = { error: { code: -32602, message: 'Query returned more than 50000 results.' } };

  /** One fake node: the logs it serves over a whole range, and the balances it answers. */
  function node(o: {
    whole?: unknown;
    recent?: EvmLog[];
    balances?: Record<string, bigint>;
    supply?: bigint;
  }) {
    const queries: { from: number; to: number }[] = [];
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      const {
        id,
        method,
        params: p,
      } = JSON.parse(String(init?.body)) as {
        id: string;
        method: string;
        params: never[];
      };
      const reply = (r: object) => Response.json({ jsonrpc: '2.0', id, ...r });
      if (method === 'eth_getBlockByNumber')
        return reply({
          result: { number: `0x${block.toString(16)}`, hash: '0xh', timestamp: '0x5f5e100' },
        });
      if (method === 'eth_getLogs') {
        const q = p[0] as { fromBlock: string; toBlock: string };
        const from = Number(q.fromBlock);
        queries.push({ from, to: Number(q.toBlock) });
        if (from === 0 && o.whole !== undefined)
          return reply('error' in (o.whole as object) ? (o.whole as object) : { result: o.whole });
        return reply({ result: o.recent ?? [] });
      }
      if (method === 'eth_call') {
        const data = (p[0] as { data: string }).data;
        // a Multicall3 aggregate3: symbol, decimals, totalSupply, or a balanceOf for each address
        const calls = Number(BigInt(`0x${data.slice(74, 138)}`));
        const answers: string[] = [];
        for (let i = 0; i < calls; i++) {
          const at = 138 + 2 * Number(BigInt(`0x${data.slice(138 + 64 * i, 202 + 64 * i)}`));
          const call = data.slice(at + 64 * 4, at + 64 * 4 + 72);
          if (call.startsWith('95d89b41')) answers.push(stringAnswer('RG'));
          else if (call.startsWith('313ce567')) answers.push(word(0n));
          else if (call.startsWith('18160ddd')) answers.push(word(o.supply ?? 1000n));
          else answers.push(word(o.balances?.[`0x${call.slice(32)}`] ?? 0n));
        }
        return reply({ result: aggregateAnswer(answers) });
      }
      return reply({ error: { code: -32601, message: `no ${method}` } });
    };
    return { fetch, queries };
  }
  const read = async (mod: ReturnType<typeof erc20Holders>, p: Record<string, string> = params) =>
    mod.fetch({ block_height: block, as_of: '2026-11-06T00:00:00Z' }, p);

  test('a quiet token is read whole, in one query, with every holder and no unread petal', async () => {
    const n = node({
      whole: [transfer(ZERO, addr(1), 600n), transfer(ZERO, addr(2), 400n)],
      balances: { [addr(1)]: 600n, [addr(2)]: 400n },
    });
    const s = await read(erc20Holders({ fetch: n.fetch, sleep: noSleep }));
    expect(n.queries).toEqual([{ from: 0, to: block }]);
    expect(s.holdings.map((h) => h.participant)).toEqual([addr(1), addr(2)]);
    expect(s.participants.some((p) => p.id === 'group:not-read')).toBe(false);
    expect(s.network.params).toEqual({ ...params, window_days: 'full' });
    expect(s.network.title).toBe('RG holders, Gnosis');
    expect(s.coverage.note).toMatch(/Who: every Transfer log/);
    expect(s.coverage.note).not.toMatch(/Only a window/);
    expect(validateSnapshot(s).ok).toBe(true);
  });

  test.each([
    ['the node refuses the range', OVER_CAP],
    [
      'it comes back over the budget',
      Array.from({ length: 20_001 }, () => transfer(addr(1), addr(2), 0n)),
    ],
  ])('a busy token gets the window, and says so plainly: %s', async (_why, whole) => {
    const n = node({
      whole,
      recent: [transfer(addr(1), addr(2), 5n)],
      balances: { [addr(1)]: 300n, [addr(2)]: 400n },
    });
    const s = await read(erc20Holders({ fetch: n.fetch, sleep: noSleep }));
    expect(n.queries[0]).toEqual({ from: 0, to: block });
    expect(n.queries.length).toBeGreaterThan(1);
    expect(s.network.params).toEqual({ ...params, window_days: '7' });
    expect(s.network.population).toMatch(/-7d$/);
    expect(s.coverage.note).toMatch(/^Only a window, not every holder: the last 7 days/);
    expect(s.coverage.note).toMatch(/its history is too long to read whole/);
    expect(s.network.description).toMatch(/^Only a window, not every holder/);
    expect(s.participants.at(-1)?.id).toBe('group:not-read');
  });

  test('a whole read that does not add up gets the window too, and says why', async () => {
    const n = node({
      whole: [transfer(ZERO, addr(1), 10n)],
      recent: [transfer(ZERO, addr(1), 10n)],
      balances: { [addr(1)]: 10n },
      supply: 1000n,
    });
    const s = await read(erc20Holders({ fetch: n.fetch, sleep: noSleep }));
    expect(s.network.params?.window_days).toBe('7');
    expect(s.coverage.note).toMatch(/whole history could not be read/);
    expect(s.coverage.note).toMatch(/the replay sums to/);
  });

  test('a window asked for by name is that window: no whole read is tried', async () => {
    const n = node({ recent: [transfer(addr(1), addr(2), 5n)], balances: { [addr(2)]: 5n } });
    const s = await read(erc20Holders({ fetch: n.fetch, sleep: noSleep }), {
      ...params,
      window_days: '2',
    });
    expect(n.queries.every((q) => q.from > 0)).toBe(true);
    expect(s.network.params?.window_days).toBe('2');
    expect(s.coverage.note).toMatch(/^Only a window/);
    expect(s.coverage.note).not.toMatch(/because/);
  });

  test('whole history asked for by name is that, or a refusal that says why', async () => {
    const n = node({ whole: OVER_CAP });
    await expect(
      read(erc20Holders({ fetch: n.fetch, sleep: noSleep }), { ...params, window_days: 'full' }),
    ).rejects.toMatchObject({
      code: 'cannot_read',
      message: expect.stringContaining('too long to read whole'),
      hint: expect.stringContaining('window_days'),
    });
    expect(n.queries).toHaveLength(1);
  });

  test('whole history asked for on a narrow chain is refused, and says what would work', async () => {
    const n = node({});
    await expect(
      read(erc20Holders({ fetch: n.fetch, sleep: noSleep }), {
        chain: 'base',
        token: TOKEN,
        window_days: 'full',
      }),
    ).rejects.toMatchObject({ code: 'cannot_read', hint: expect.stringContaining('--full') });
    expect(n.queries).toEqual([]);
  });

  test('keyed as what it tries: whole on a wide chain, a window on a narrow one or with an explorer', () => {
    const mod = erc20Holders();
    expect(mod.keyFor?.(params).population).toMatch(/-full$/);
    expect(mod.keyFor?.({ chain: 'arbitrum', token: TOKEN }).population).toMatch(/-full$/);
    expect(mod.keyFor?.({ chain: 'base', token: TOKEN }).population).toMatch(/-7d$/);
    expect(mod.keyFor?.({ chain: 'ethereum', token: TOKEN }).population).toMatch(/-7d$/);
  });
});

describe.each([
  { name: 'erc20-holders-ethereum-bank', params: BANK, chain: ETHEREUM, mode: 'full' },
  { name: 'erc20-holders-arbitrum-dpx', params: DPX, chain: ARBITRUM, mode: 'full' },
  { name: 'erc20-holders-base-seam', params: SEAM, chain: BASE, mode: 'window' },
])('$name as test parameters, stored', ({ name, params, chain, mode }) => {
  const row = rowFor('erc20-holders', params);
  const s = storedSnapshot(row);
  const recording = loadRecording(name);
  const checks = recording.checks as Record<string, string | number>;

  test('answers the same parameters, valid, on the right chain', async () => {
    const mod = modules['erc20-holders'];
    if (!mod) throw new Error('not registered');
    expect(validateSnapshot(s).ok).toBe(true);
    expect(s.network.chain).toBe(chain.caip2);
    expect(s.network.params).toEqual(params);
    expect(mod.keyFor?.(params).population).toBe(row.population);
    expect(s.snapshot.final).toBe(true);
    const at = await mod.resolveAt('latest', params);
    expect(encodeSnapshot(await mod.fetch(at, params)).sha256).toBe(row.sha256);
  });

  test('check: drawn holdings plus the tail equal totalSupply, from the recording', () => {
    const state = recordedState(recording);
    expect(state.supply).toBe(BigInt(checks.total_supply_raw as string));
    const sum = s.holdings.reduce((a, h) => a + BigInt(h.amount_raw ?? '0'), 0n);
    expect(sum).toBe(state.supply);
    if (mode === 'full') expect(s.coverage.amount_total).toBe(s.coverage.amount_included);
    expect(checks.drawn_vs_supply_raw).toBe('0');
  });

  test('check: every listed amount is balanceOf at the block, from the recording', () => {
    const state = recordedState(recording);
    const listed = s.holdings.filter((h) => !h.participant.startsWith('group:'));
    if (mode === 'full') expect(listed.length).toBe(HOLDERS_KEPT);
    expect(listed.length).toBeGreaterThan(60);
    expect(state.balances.size).toBeGreaterThanOrEqual(listed.length);
    for (const h of listed)
      expect(state.balances.get(h.participant)).toBe(BigInt(h.amount_raw ?? '-1'));
  });

  test('states how it was read and what the check can and cannot show', () => {
    const note = s.coverage.note ?? '';
    expect(checks.list).toBe('replay');
    if (mode === 'window') {
      expect(note).toMatch(/only addresses in a Transfer log between block/);
      expect(note).toMatch(/the last 7 days/);
      expect(note).toMatch(/This is not every holder/);
      expect(note).toMatch(/it was not read, it is not attributed to anyone/);
      expect(checks.window).toBeDefined();
      expect(s.participants.filter((p) => p.kind === 'group').map((p) => p.id)).toEqual([
        'group:not-read',
      ]);
    } else {
      expect(note).toMatch(/every Transfer log up to this block/);
      expect(note).toMatch(/equal to totalSupply/);
      expect(checks.replay_vs_supply_raw).toBe('0');
      expect(checks.balance_differences).toBe(0);
    }
    expect(note).toMatch(/No labels/);
    expect(note).toMatch(/Not known: who controls an address/);
    expect(note).not.toMatch(/insider|team wallet|whale|dump|rug/i);
    for (const p of s.participants) expect(p.identity).toBeNull();
  });

  test('the tail is declared', () => {
    const f = computeFigures(s, { measure: 'token_balance', petals: 60 });
    expect(f.participants_total).toBe(s.coverage.participants_total);
    if (mode === 'full') {
      for (const r of f.shares) expect(r.id.startsWith('group:')).toBe(false);
      const bands = s.participants.filter((p) => p.kind === 'group');
      expect(s.coverage.grouped?.[0]?.rows_folded).toBe(
        bands.reduce((a, b) => a + (b.count ?? 0), 0),
      );
    } else {
      expect(s.coverage.grouped?.[0]?.rows_folded).toBe(0);
      expect(f.shares.some((r) => r.id === 'group:not-read')).toBe(true);
    }
  });

  test('the recording holds no token', () => {
    const text = JSON.stringify(recording);
    expect(text).not.toMatch(/bearer|authorization|ENVIO/i);
  });
});

describe("Ankr's holder list (12 Nov, Elco's free key)", () => {
  const balances = { [addr(1)]: 500n, [addr(2)]: 300n, [addr(3)]: 100n };
  /** An Ankr that lists these holders, largest first, two a page. */
  const fakeAnkr = (calls: { url: string; body: Record<string, unknown> }[]) =>
    (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url: String(input), body });
      const all = [
        [addr(1), 500n],
        [addr(2), 300n],
        [addr(3), 100n],
      ] as const;
      const from = Number(body.params.pageToken ?? 0);
      const page = all.slice(from, from + 2);
      return Response.json({
        result: {
          holders: page.map(([a, v]) => ({
            holderAddress: a.toUpperCase().replace('0X', '0x'),
            balanceRawInteger: v.toString(),
          })),
          holdersCount: 13,
          nextPageToken: from + 2 < all.length ? String(from + 2) : '',
          syncStatus: { blockNumber: 99 },
        },
      });
    }) as typeof fetch;

  test('every holder, largest first, with its count: the top plus a declared tail equal the supply, and the key is nowhere in the snapshot', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const { snapshot: s, checks } = await pullErc20Holders(target(ETHEREUM), {
      reader: fakeReader(balances, 1000n),
      fetch: fakeAnkr(calls),
      list: 'ankr',
      ankrKey: 'k-secret',
    });
    expect(validateSnapshot(s).ok).toBe(true);
    expect(checks).toMatchObject({
      list: 'ankr',
      holders_total: 13,
      listed: 3,
      drawn_vs_supply_raw: '0',
      balance_differences: 0,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toMatchObject({
      method: 'ankr_getTokenHolders',
      params: { blockchain: 'eth', contractAddress: TOKEN },
    });
    expect(JSON.stringify(s)).not.toContain('k-secret');
    expect(s.sources[0]).toMatchObject({ url: 'https://rpc.ankr.com/multichain', kind: 'api' });
    expect(s.snapshot.final).toBe(false);
    expect(s.network.params).toMatchObject({ window_days: 'full' });
    expect(s.coverage.note).toMatch(/Ankr's token holder list/);
  });

  test('without a key, or on a chain Ankr does not list, it says so', async () => {
    await expect(
      pullErc20Holders(target(ETHEREUM), { reader: fakeReader(balances, 1000n), list: 'ankr' }),
    ).rejects.toThrow(/no key/);
  });
});
