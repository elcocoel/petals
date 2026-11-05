// T156: the Ethereum reader, offline. Log paging, multicall encoding, failover and pacing.
import { describe, expect, test } from 'vitest';
import { InputError } from '../src/errors.ts';
import { addressOf, encodeCall, eventTopic, selector, stringAt, wordAt } from '../src/evm/abi.ts';
import {
  decodeAggregate,
  EVM_ENDPOINTS,
  type EvmLog,
  encodeAggregate3,
  encodeTryAggregate,
  evmReader,
  MULTICALL2,
  MULTICALL3,
} from '../src/evm/reader.ts';
import { noSleep } from './helpers/recordings.ts';

type Answer = { result?: unknown; error?: unknown; status?: number };
interface Sent {
  url: string;
  method: string;
  params: unknown[];
}

function rig(answer: (s: Sent) => Answer) {
  const sent: Sent[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      id: string;
      method: string;
      params: unknown[];
    };
    const s: Sent = { url: String(input), method: body.method, params: body.params };
    sent.push(s);
    const a = answer(s);
    if (a.status && a.status !== 200) return new Response('no', { status: a.status });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, ...a }), { status: 200 });
  };
  return { sent, reader: evmReader({ fetch, sleep: noSleep }) };
}

const logAt = (block: number, index = 0): EvmLog => ({
  address: '0xabc',
  topics: ['0x01'],
  data: '0x',
  blockNumber: `0x${block.toString(16)}`,
  transactionHash: '0xdead',
  logIndex: `0x${index.toString(16)}`,
});

/** The result word layout `(bool,bytes)[]` of aggregate3 and tryAggregate. */
function encodeResults(rows: { ok: boolean; data: string }[]): string {
  const word = (n: number) => n.toString(16).padStart(64, '0');
  const tuples = rows.map((r) => {
    const hex = r.data.slice(2);
    return `${word(r.ok ? 1 : 0)}${word(0x40)}${word(hex.length / 2)}${hex.padEnd(Math.ceil(hex.length / 64) * 64, '0')}`;
  });
  let offset = tuples.length * 32;
  const offsets = tuples.map((t) => {
    const here = offset;
    offset += t.length / 2;
    return word(here);
  });
  return `0x${word(0x20)}${word(rows.length)}${offsets.join('')}${tuples.join('')}`;
}

describe('abi', () => {
  test('selectors and topics are keccak-256', () => {
    expect(selector('totalShares()')).toBe('0x3a98ef39');
    expect(selector('aggregate3((address,bool,bytes)[])')).toBe('0x82ad56cb');
    expect(selector('tryAggregate(bool,(address,bytes)[])')).toBe('0xbce38bd7');
    expect(eventTopic('Transfer(address,address,uint256)')).toBe(
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    );
  });

  test('encodes static arguments and reads words back', () => {
    const data = encodeCall('members(address)', '0xABCDEF0000000000000000000000000000000001');
    expect(data).toBe('0x08ae4b0c000000000000000000000000abcdef0000000000000000000000000000000001');
    const words = `0x${'00'.repeat(31)}05${'00'.repeat(12)}${'ab'.repeat(20)}`;
    expect(wordAt(words, 0)).toBe(5n);
    expect(addressOf(words)).toBe(`0x${'ab'.repeat(20)}`);
    expect(() => wordAt(words, 2)).toThrow(RangeError);
  });

  test('reads a dynamic string by its offset word', () => {
    const text = Buffer.from('Membership Proposal: X', 'utf8').toString('hex');
    const encoded = `0x${(0x20).toString(16).padStart(64, '0')}${(text.length / 2)
      .toString(16)
      .padStart(64, '0')}${text.padEnd(64, '0')}`;
    expect(stringAt(encoded, 0)).toBe('Membership Proposal: X');
  });
});

describe('multicall', () => {
  const calls = [
    { to: '0x1111111111111111111111111111111111111111', data: '0x3a98ef39' },
    { to: '0x2222222222222222222222222222222222222222', data: '0x3a98ef390102' },
  ];

  test('aggregate3 and tryAggregate carry each call, in ABI layout', () => {
    const three = encodeAggregate3(calls);
    expect(three.startsWith('0x82ad56cb')).toBe(true);
    // offset to the array, length 2, then two offsets from the array's first element
    expect(three.slice(10, 10 + 64 * 2)).toBe(
      `${(0x20).toString(16).padStart(64, '0')}${'2'.padStart(64, '0')}`,
    );
    expect(three).toContain('3a98ef390102');
    const two = encodeTryAggregate(calls);
    expect(two.startsWith('0xbce38bd7')).toBe(true);
    expect(wordAt(`0x${two.slice(10)}`, 0)).toBe(0n); // requireSuccess false
    expect(wordAt(`0x${two.slice(10)}`, 1)).toBe(0x40n);
  });

  test('decodes success flags and return data', () => {
    const rows = [
      { ok: true, data: `0x${'00'.repeat(31)}07` },
      { ok: false, data: '0x' },
    ];
    expect(decodeAggregate(encodeResults(rows))).toEqual(rows);
  });

  test('picks the contract that exists at the block', async () => {
    const { reader, sent } = rig((s) => {
      const [{ to }] = s.params as [{ to: string }];
      return {
        result:
          to === calls[0]?.to
            ? `0x${'00'.repeat(31)}01`
            : encodeResults([{ ok: true, data: `0x${'00'.repeat(32)}` }]),
      };
    });
    await reader.multicall(calls.slice(0, 1), MULTICALL3.from);
    await reader.multicall(calls.slice(0, 1), MULTICALL3.from - 1);
    const before = sent.length;
    const old = await reader.multicall(calls.slice(0, 1), MULTICALL2.from - 1);
    const targets = sent.map((s) => (s.params as [{ to: string }])[0].to);
    expect(targets[0]).toBe(MULTICALL3.address);
    expect(targets[1]).toBe(MULTICALL2.address);
    expect(targets[before]).toBe(calls[0]?.to); // no multicall contract yet: one by one
    expect(old[0]?.ok).toBe(true);
  });

  test('batches, and pins every call to the block', async () => {
    const { reader, sent } = rig(() => ({
      result: encodeResults([{ ok: true, data: `0x${'00'.repeat(32)}` }]),
    }));
    await reader.multicall(Array(3).fill(calls[0]), MULTICALL3.from + 5, 1);
    expect(sent).toHaveLength(3);
    for (const s of sent) expect(s.params[1]).toBe(`0x${(MULTICALL3.from + 5).toString(16)}`);
  });

  test('asks again when an old-state call returns no data, then says so', async () => {
    let n = 0;
    const once = rig(() => (++n === 1 ? { result: '0x' } : { result: encodeResults([]) }));
    await expect(once.reader.multicall([], MULTICALL3.from)).resolves.toEqual([]);
    const always = rig(() => ({ result: '0x' }));
    const err = await always.reader
      .multicall(calls.slice(0, 1), MULTICALL3.from)
      .catch((e) => e as InputError);
    expect(err).toBeInstanceOf(InputError);
    expect(always.sent).toHaveLength(3);
  });

  test('refuses an answer with the wrong number of rows', async () => {
    const { reader } = rig(() => ({ result: encodeResults([]) }));
    await expect(reader.multicall(calls, MULTICALL3.from)).rejects.toMatchObject({
      code: 'source_failed',
    });
  });
});

describe('log paging', () => {
  const capped = (limit: number, hint: boolean) => {
    const blocks = [10, 20, 30, 40, 50, 60];
    return rig((s) => {
      const q = (s.params as [{ fromBlock: string; toBlock: string }])[0];
      const a = Number.parseInt(q.fromBlock, 16);
      const b = Number.parseInt(q.toBlock, 16);
      const rows = blocks.filter((x) => x >= a && x <= b);
      if (rows.length <= limit) return { result: rows.reverse().map((x) => logAt(x)) };
      const last = rows[limit - 1] as number;
      return {
        error: {
          code: -32602,
          message: 'invalid params',
          data: hint
            ? `Query returned more than ${limit} results. Try with this block range [0x${a.toString(16)}, 0x${last.toString(16)}].`
            : `Query returned more than ${limit} results.`,
        },
      };
    });
  };

  test('follows the range the provider suggests, in block order', async () => {
    const { reader, sent } = capped(2, true);
    const logs = await reader.logs({ address: '0xabc' }, 0, 70);
    expect(logs.map((l) => Number.parseInt(l.blockNumber, 16))).toEqual([10, 20, 30, 40, 50, 60]);
    // full range refused, then 0..20 fits; rest refused, 21..40 fits; rest fits: 5 calls
    expect(sent.filter((s) => s.method === 'eth_getLogs')).toHaveLength(5);
  });

  test('halves when the error names no range', async () => {
    const { reader } = capped(2, false);
    const logs = await reader.logs({ address: '0xabc' }, 0, 70);
    expect(logs.map((l) => Number.parseInt(l.blockNumber, 16))).toEqual([10, 20, 30, 40, 50, 60]);
  });

  test('sorts inside a page by block and log index', async () => {
    const { reader } = rig(() => ({ result: [logAt(5, 2), logAt(5, 1), logAt(4, 9)] }));
    const logs = await reader.logs({ address: '0xabc' }, 0, 9);
    expect(logs.map((l) => [l.blockNumber, l.logIndex])).toEqual([
      ['0x4', '0x9'],
      ['0x5', '0x1'],
      ['0x5', '0x2'],
    ]);
  });

  test('stops on one block that cannot fit, and on a runaway walk', async () => {
    const { reader } = rig(() => ({ error: { code: -32602, data: 'more than 5 results' } }));
    await expect(reader.logs({ address: '0xabc' }, 7, 7)).rejects.toThrow(/block 7 alone/);
    const fetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { code: -32602, data: 'more than 5 results' } }));
    const walk = evmReader({ fetch, sleep: noSleep, maxLogCalls: 3 });
    await expect(walk.logs({ address: '0xabc' }, 0, 1000)).rejects.toThrow(/over 3 calls/);
  });
});

describe('the pool underneath', () => {
  test('state reads fail over to the next endpoint and name who answered', async () => {
    const { reader, sent } = rig((s) =>
      s.url === EVM_ENDPOINTS[0]?.url
        ? { status: 500 }
        : { result: { number: '0x10', hash: '0xh', timestamp: '0x5' } },
    );
    await expect(reader.block(16)).resolves.toMatchObject({
      number: 16,
      as_of: '1970-01-01T00:00:05Z',
    });
    expect(sent.map((s) => s.url)).toEqual(EVM_ENDPOINTS.map((e) => e.url));
    expect(reader.servedBy('state')).toBe(EVM_ENDPOINTS[1]?.url);
    expect(reader.stats().failures).toEqual({ tenderly: 1 });
  });

  test('log reads never move to the next endpoint', async () => {
    const { reader, sent } = rig(() => ({ status: 500 }));
    await expect(reader.logs({ address: '0xabc' }, 0, 1)).rejects.toMatchObject({
      code: 'source_failed',
      hint: expect.stringContaining('Ethereum'),
    });
    expect(new Set(sent.map((s) => s.url))).toEqual(new Set([EVM_ENDPOINTS[0]?.url]));
  });

  test('a revert is an answer: no failover', async () => {
    const { reader, sent } = rig(() => ({
      error: { code: 3, message: 'execution reverted' },
    }));
    await expect(reader.call('0xabc', '0x12', 5)).rejects.toThrow(/execution reverted/);
    expect(sent).toHaveLength(1);
  });

  test('a rate limit is not mistaken for a range cap', async () => {
    let n = 0;
    const { reader, sent } = rig(() =>
      ++n === 1
        ? { error: { code: -32005, message: 'rate limit exceeded' } }
        : { result: [logAt(1)] },
    );
    await expect(reader.logs({ address: '0xabc' }, 0, 100)).resolves.toHaveLength(1);
    const ranges = sent.map((s) => (s.params as [{ toBlock: string }])[0].toBlock);
    expect(ranges).toEqual(['0x64', '0x64']); // the same range again, not a split
  });
});
