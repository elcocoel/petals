// Resolving `at` on NEAR: latest, a fixed height, or the last block at or before a date.
import { describe, expect, test } from 'vitest';
import { parseAt } from '../src/modules/at.ts';
import { resolveNearAt } from '../src/modules/chain.ts';
import { DEFAULT_ENDPOINTS, nsToIso, rpcPool } from '../src/rpc/pool.ts';

const HEAD = 1_000_000;
const BLOCK_MS = 610;

/** A made-up chain: one block every 610 ms up to HEAD, every 97th height skipped. */
function chain() {
  const headMs = Date.now() - 2_000;
  const msOf = (h: number) => headMs - (HEAD - h) * BLOCK_MS;
  const hosts: string[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    hosts.push(new URL(url).host);
    const { params } = JSON.parse(String(init?.body)) as { params: { block_id?: number } };
    const h = params.block_id ?? HEAD;
    if (h > HEAD || h % 97 === 0)
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_BLOCK' }, message: 'x' },
        }),
      );
    const ns = BigInt(msOf(h)) * 1_000_000n;
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        result: {
          header: {
            height: h,
            hash: `h${h}`,
            timestamp: Number(ns),
            timestamp_nanosec: ns.toString(),
          },
        },
      }),
    );
  }) as typeof globalThis.fetch;
  const pool = rpcPool({
    fetch,
    endpoints: DEFAULT_ENDPOINTS.map((e) => ({ ...e, intervalMs: 0 })),
  });
  return { pool, hosts, msOf, headMs };
}

describe('resolveNearAt', () => {
  test('latest is the final head', async () => {
    const c = chain();
    expect(await resolveNearAt(c.pool, 'latest')).toEqual({
      block_height: HEAD,
      as_of: nsToIso(BigInt(c.headMs) * 1_000_000n),
    });
    expect(await resolveNearAt(c.pool, undefined)).toMatchObject({ block_height: HEAD });
  });

  test('a fixed height, if it exists and is final', async () => {
    const c = chain();
    expect(await resolveNearAt(c.pool, { block_height: HEAD - 10 })).toMatchObject({
      block_height: HEAD - 10,
    });
    await expect(resolveNearAt(c.pool, { block_height: 97 * 10_000 })).rejects.toMatchObject({
      code: 'bad_input',
    });
    await expect(resolveNearAt(c.pool, { block_height: HEAD + 5 })).rejects.toMatchObject({
      code: 'bad_input',
    });
  });

  test('a datetime: the last block at or before it, found in a few calls', async () => {
    const c = chain();
    const target = c.headMs - 3_600_000 + 123;
    const r = await resolveNearAt(c.pool, new Date(target).toISOString());
    const got = c.msOf(r.block_height);
    expect(got).toBeLessThanOrEqual(target);
    expect(target - got).toBeLessThan(2_000);
    expect(c.hosts.length).toBeLessThanOrEqual(10);
    expect(c.hosts.every((h) => h === 'near.drpc.org')).toBe(true);
  });

  test('a date days ago is read on the archival node', async () => {
    const c = chain();
    const target = c.headMs - 3 * 86_400_000;
    const r = await resolveNearAt(c.pool, new Date(target).toISOString());
    expect(target - c.msOf(r.block_height)).toBeLessThan(2_000);
    expect(c.hosts.slice(1).every((h) => h === 'archival-rpc.mainnet.fastnear.com')).toBe(true);
  });

  test('the future is refused; a bare date for today means the head', async () => {
    const c = chain();
    await expect(resolveNearAt(c.pool, '2999-01-01T00:00:00Z')).rejects.toMatchObject({
      code: 'bad_input',
    });
    const today = new Date().toISOString().slice(0, 10);
    expect(await resolveNearAt(c.pool, today)).toMatchObject({ block_height: HEAD });
  });
});

describe('parseAt', () => {
  test('latest, blocks, dates and datetimes', () => {
    expect(parseAt('latest')).toEqual({ kind: 'latest' });
    expect(parseAt(undefined)).toEqual({ kind: 'latest' });
    expect(parseAt({ block_height: 7 })).toEqual({ kind: 'block', block_height: 7 });
    expect(parseAt('2026-11-03')).toEqual({
      kind: 'date',
      ms: Date.parse('2026-11-03T23:59:59Z'),
      iso: '2026-11-03',
    });
    expect(parseAt('2026-11-03T12:00:00+02:00')).toMatchObject({
      kind: 'date',
      ms: Date.parse('2026-11-03T10:00:00Z'),
    });
  });
  test('anything else is bad_input', () => {
    for (const bad of [
      'yesterday',
      '2026-13-45',
      '03/11/2026',
      { block_height: -1 },
      { block_height: 1.5 },
      {},
    ])
      expect(() => parseAt(bad as never), JSON.stringify(bad)).toThrow(
        expect.objectContaining({ code: 'bad_input' }),
      );
  });
});
