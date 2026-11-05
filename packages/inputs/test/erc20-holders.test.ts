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
  BANK_ETHEREUM,
  DPX_ARBITRUM,
  ERC20_HOLDERS_DESCRIPTOR,
  erc20HoldersLive,
  HOLDERS_KEPT,
  type HolderTarget,
  liveTarget,
  newTransferReplay,
  pullErc20Holders,
  tailSlices,
  tokenText,
} from '../src/modules/erc20-holders.ts';
import { type Recording, replayFetch } from '../src/rpc/recording.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';
import { indexRows, loadRecording, noSleep, storedSnapshot } from './helpers/recordings.ts';
import { FIXTURES, tmp } from './helpers/snapshots.ts';

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
  id: 'test-holders',
  chain,
  token: TOKEN,
  title: 'TT holders, Test',
  population: `erc20-holders-test-${TOKEN}`,
});

function fakeReader(
  balances: Record<string, bigint>,
  supply: bigint,
  pages: EvmLog[][] = [],
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
    block: async () => ({
      number: 100,
      hash: '0xh',
      timestamp: 86400,
      as_of: '1970-01-02T00:00:00Z',
    }),
    call: async () => '0x',
    multicall: async (calls) =>
      calls.map((c) => ({ ok: answers.has(c.data), data: answers.get(c.data) ?? '0x' })),
    logPages: async function* () {
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
    expect(s.network.params).toEqual({ chain: 'ethereum', token: TOKEN });
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
    expect(checks).toMatchObject({ list: 'replay', replay_vs_supply_raw: '0' });
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

describe('pullErc20Holders, through a replay', () => {
  const pages = [
    [transfer(ZERO, addr(1), 600n), transfer(ZERO, addr(2), 300n)],
    [transfer(ZERO, addr(3), 100n), transfer(addr(1), addr(4), 50n)],
  ];
  const balances = { [addr(1)]: 550n, [addr(2)]: 300n, [addr(3)]: 100n, [addr(4)]: 50n };
  const arb = target(ARBITRUM);

  test('keyless where the chain has wide logs: the sum is a real check', async () => {
    const { snapshot: s, checks } = await pullErc20Holders(arb, {
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
      reader: fakeReader(balances, 1000n, pages),
      keep: 2,
    });
    expect(checks).toMatchObject({ listed: 2, tail_raw: '150', holders_total: 4 });
    expect(s.coverage.grouped?.[0]).toMatchObject({ rows_folded: 2, amount: '150' });
  });

  test('a small difference from the supply is stated; a large one throws', async () => {
    const { checks, snapshot: s } = await pullErc20Holders(arb, {
      reader: fakeReader({ [addr(1)]: 1_000_000n }, 1_000_001n, [
        [transfer(ZERO, addr(1), 1_000_000n)],
      ]),
      keep: 1,
    });
    expect(checks.replay_vs_supply_raw).toBe('-1');
    expect(s.coverage.note).toMatch(/1 below totalSupply/);
    await expect(
      pullErc20Holders(arb, { reader: fakeReader(balances, 2000n, pages) }),
    ).rejects.toThrow(/the replay sums to 1000/);
  });

  test('on a chain with no keyless logs, it says so and asks for no key silently', async () => {
    const err = (await pullErc20Holders(target(BASE), {
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

  test('stops at a query budget, and on a walk that does not advance', async () => {
    const fetch: typeof globalThis.fetch = async (_u, init) =>
      page(JSON.parse(String(init?.body)).from_block + 1);
    await expect(
      (async () => {
        for await (const _ of hypersyncLogPages(BASE, filter, 0, 10, {
          token: secret,
          fetch,
          maxQueries: 2,
        })) {
          /* drain */
        }
      })(),
    ).rejects.toThrow(/stopped after 2 queries/);
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
  const row = indexRows(BANK_ETHEREUM.id)[0];
  if (!row) throw new Error('no stored BANK');
  const s = storedSnapshot(row);
  const recording = loadRecording(BANK_ETHEREUM.id);
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
    const { snapshot, checks } = await pullErc20Holders(BANK_ETHEREUM, {
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
    const { snapshot, checks } = await pullErc20Holders(BANK_ETHEREUM, {
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
      liveTarget({ chain: 'base', token: TOKEN.toUpperCase().replace('0X', '0x') }),
    ).toMatchObject({
      chain: BASE,
      token: TOKEN,
    });
    for (const params of [
      { chain: 'polygon', token: TOKEN },
      { chain: 'base', token: '0x12' },
      undefined,
    ])
      expect(() => liveTarget(params)).toThrow(/needs a chain and a token/);
  });

  test('a live read is never mistaken for a stored data set of the same token', () => {
    const live = liveTarget({ chain: 'ethereum', token: BANK_ETHEREUM.token });
    expect(live.population).not.toBe(BANK_ETHEREUM.population);
    expect(live.id).not.toBe(BANK_ETHEREUM.id);
  });

  test('reads only the latest block', async () => {
    const mod = erc20HoldersLive({ sleep: noSleep });
    await expect(
      mod.resolveAt({ block_height: 5 }, { chain: 'ethereum', token: TOKEN }),
    ).rejects.toMatchObject({ code: 'cannot_read' });
  });

  test('two tokens read at the same block are not taken for one another', async () => {
    const block = 777;
    const make = (token: string): Snapshot =>
      ({
        ...storedSnapshot(indexRows(DPX_ARBITRUM.id)[0] as never),
        network: {
          id: 'erc20-holders',
          chain: 'eip155:1',
          population: `erc20-token-ethereum-${token}`,
          title: 'x',
          params: { chain: 'ethereum', token },
        },
        snapshot: { as_of: '2026-11-05T00:00:00Z', block_height: block, final: true },
      }) as Snapshot;
    const fetched: string[] = [];
    const mod = {
      ...erc20HoldersLive(),
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

describe.each([
  { target: BANK_ETHEREUM, chain: ETHEREUM, list: 'replay', final: true },
  { target: DPX_ARBITRUM, chain: ARBITRUM, list: 'replay', final: true },
])('$target.id, stored', ({ target: t, chain, list, final }) => {
  const row = indexRows(t.id)[0];
  if (!row) throw new Error(`no stored ${t.id}`);
  const s = storedSnapshot(row);
  const recording = loadRecording(t.id);
  const checks = recording.checks as Record<string, string | number>;

  test('is registered and valid, on the right chain', async () => {
    const mod = modules[t.id];
    if (!mod) throw new Error('not registered');
    expect(mod.descriptor).toMatchObject({ chain: chain.caip2, live: false });
    expect(validateSnapshot(s).ok).toBe(true);
    expect(s.network.chain).toBe(chain.caip2);
    expect(s.network.params).toEqual({ chain: chain.id, token: t.token });
    expect(s.snapshot.final).toBe(final);
    const at = await mod.resolveAt('latest');
    expect(encodeSnapshot(await mod.fetch(at, undefined)).sha256).toBe(row.sha256);
  });

  test('check: drawn holdings plus the tail equal totalSupply, from the recording', () => {
    const state = recordedState(recording);
    expect(state.supply).toBe(BigInt(checks.total_supply_raw as string));
    const sum = s.holdings.reduce((a, h) => a + BigInt(h.amount_raw ?? '0'), 0n);
    expect(sum).toBe(state.supply);
    expect(s.coverage.amount_total).toBe(s.coverage.amount_included);
    expect(checks.drawn_vs_supply_raw).toBe('0');
  });

  test('check: every listed amount is balanceOf at the block, from the recording', () => {
    const state = recordedState(recording);
    const listed = s.holdings.filter((h) => !h.participant.startsWith('group:'));
    expect(listed.length).toBe(HOLDERS_KEPT);
    expect(state.balances.size).toBe(HOLDERS_KEPT);
    for (const h of listed)
      expect(state.balances.get(h.participant)).toBe(BigInt(h.amount_raw ?? '-1'));
  });

  test('states the list source and what the check can and cannot show', () => {
    expect(checks.list).toBe(list);
    const note = s.coverage.note ?? '';
    if (list === 'blockscout') {
      expect(note).toMatch(/by construction/);
      expect(note).toMatch(/not pinned to it/);
      expect(s.sources.find((x) => x.id === 'erc20-holder-list')?.url).toBe(chain.blockscout);
    } else {
      expect(note).toMatch(/every Transfer log up to this block/);
      expect(checks.replay_vs_supply_raw).toBe('0');
      expect(checks.balance_differences).toBe(0);
      expect(note).toMatch(/equal to totalSupply/);
    }
    expect(note).toMatch(/No labels/);
    expect(note).toMatch(/Not known: who controls an address/);
    expect(note).not.toMatch(/insider|team wallet|whale|dump|rug/i);
    for (const p of s.participants) expect(p.identity).toBeNull();
  });

  test('the top petals are holders, and the tail is declared', () => {
    const f = computeFigures(s, { measure: 'token_balance', petals: 60 });
    for (const r of f.shares) expect(r.id.startsWith('group:')).toBe(false);
    expect(f.participants_total).toBe(s.coverage.participants_total);
    const bands = s.participants.filter((p) => p.kind === 'group');
    if (bands.length > 0) {
      const g = s.coverage.grouped?.[0];
      expect(g?.rows_folded).toBe(bands.reduce((a, b) => a + (b.count ?? 0), 0));
    }
  });

  test('the recording holds no token', () => {
    const text = JSON.stringify(recording);
    expect(text).not.toMatch(/bearer|authorization|ENVIO/i);
  });
});
