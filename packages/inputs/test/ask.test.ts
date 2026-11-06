// T330: a chain's first endpoint being down must not read as anything about the address.
import { describe, expect, test } from 'vitest';
import { ASK_TIMEOUT_MS, askChain, ChainDown, inHealthOrder, Reverted } from '../src/evm/ask.ts';
import { ETHEREUM, type EvmChain } from '../src/evm/chains.ts';
import { identifyContracts } from '../src/evm/identify.ts';

const chain: EvmChain = ETHEREUM;
const [first, second] = chain.endpoints.map((e) => e.url) as [string, string];

const answering = (byUrl: Record<string, () => Response | Promise<Response>>) => {
  const asked: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = String(input);
    asked.push(url);
    const reply = byUrl[url];
    if (!reply) throw new Error('fetch failed');
    return reply();
  };
  return { fetch, asked };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('askChain', () => {
  test('falls through to the next endpoint, and names who answered', async () => {
    const { fetch, asked } = answering({ [second]: () => json({ result: '0x1' }) });
    await expect(askChain(chain, 'eth_blockNumber', [], { fetch })).resolves.toEqual({
      result: '0x1',
      url: second,
    });
    expect(asked).toEqual([first, second]);
  });

  test('a 5xx, a 429 and an answer with nothing in it all move on', async () => {
    for (const bad of [
      () => json({}, 500),
      () => json({}, 429),
      () => json({ error: { message: 'internal' } }),
      () => new Response('<html>'),
      () => json({ result: null }),
    ]) {
      const { fetch } = answering({ [first]: bad, [second]: () => json({ result: '0x2' }) });
      await expect(askChain(chain, 'eth_blockNumber', [], { fetch })).resolves.toMatchObject({
        url: second,
      });
    }
  });

  test('none answering is ChainDown, naming each: never an empty answer', async () => {
    const { fetch } = answering({ [first]: () => json({}, 503) });
    const out = await askChain(chain, 'eth_blockNumber', [], { fetch }).catch((e: unknown) => e);
    expect(out).toBeInstanceOf(ChainDown);
    const down = out as ChainDown;
    expect(down.failures.map((f) => f.url)).toEqual([first, second]);
    expect(down.message).toMatch(/Ethereum did not answer just now/);
    expect(down.message).toMatch(/HTTP 503/);
  });

  test('a revert is an answer: no other endpoint is asked', async () => {
    const { fetch, asked } = answering({
      [first]: () => json({ error: { message: 'execution reverted' } }),
    });
    await expect(askChain(chain, 'eth_call', [], { fetch })).rejects.toBeInstanceOf(Reverted);
    expect(asked).toEqual([first]);
  });

  test('accept can refuse an empty answer', async () => {
    const { fetch, asked } = answering({
      [first]: () => json({ result: '0x' }),
      [second]: () => json({ result: '0xabcd' }),
    });
    const out = await askChain<string>(chain, 'eth_call', [], {
      fetch,
      accept: (r) => r !== '0x',
    });
    expect(out.result).toBe('0xabcd');
    expect(asked).toEqual([first, second]);
  });

  test('an endpoint known to be down is asked last, and each gets its own time limit', async () => {
    const health = new Map([[first, Date.now() + 60_000]]);
    expect(inHealthOrder(chain.endpoints, health).map((e) => e.url)).toEqual([second, first]);
    const { fetch, asked } = answering({ [second]: () => json({ result: '0x3' }) });
    await askChain(chain, 'eth_blockNumber', [], { fetch, health });
    expect(asked).toEqual([second]);
    expect(ASK_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  test('a failed connection is remembered for the next ask', async () => {
    const health = new Map<string, number>();
    const { fetch } = answering({ [second]: () => json({ result: '0x4' }) });
    await askChain(chain, 'eth_blockNumber', [], { fetch, health });
    expect(health.get(first)).toBeGreaterThan(Date.now());
    expect(health.has(second)).toBe(false);
  });
});

describe('identifyContracts', () => {
  test('still identifies an address when the first endpoint is down, and says who answered', async () => {
    // an aggregate3 answer in which nothing answered: enough to show the second endpoint served it
    const part = `${'0'.repeat(63)}1${'0'.repeat(62)}40${'0'.repeat(64)}`;
    const calls = 11;
    const head = `${(32).toString(16).padStart(64, '0')}${calls.toString(16).padStart(64, '0')}`;
    const offsets = Array.from({ length: calls }, (_, i) =>
      (calls * 32 + i * 96).toString(16).padStart(64, '0'),
    ).join('');
    const failed = part.replace(/^0+1/, '0'.repeat(64));
    const result = `0x${head}${offsets}${failed.repeat(calls)}`;
    const { fetch, asked } = answering({ [second]: () => json({ result }) });
    const [id] = await identifyContracts(chain, ['0x000000000000000000000000000000000000dead'], {
      fetch,
    });
    expect(asked).toEqual([first, second]);
    expect(id).toMatchObject({ ledger: null, answered: [], served_by: second });
  });

  test('every endpoint down throws ChainDown', async () => {
    const { fetch } = answering({});
    await expect(
      identifyContracts(chain, ['0x000000000000000000000000000000000000dead'], { fetch }),
    ).rejects.toBeInstanceOf(ChainDown);
  });
});
