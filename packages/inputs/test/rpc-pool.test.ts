// T034: the keyless RPC pool, on a fake fetch and a fake clock.
import { describe, expect, test } from 'vitest';
import { InputError } from '../src/errors.ts';
import { DEFAULT_ENDPOINTS, nsToIso, RpcError, rpcPool } from '../src/rpc/pool.ts';

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | 'hang';
interface Sent {
  url: string;
  at: number;
  body: { method: string; params: Record<string, unknown> };
  headers: Record<string, string>;
}

/** A fake network: `route(url, body)` answers each request; the clock only moves on sleep. */
function harness(route: (url: string, body: Sent['body']) => Reply) {
  let t = 0;
  const sent: Sent[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body));
    sent.push({ url, at: t, body, headers: init?.headers as Record<string, string> });
    const r = route(url, body);
    if (r === 'hang')
      return new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    return new Response(JSON.stringify(r.body ?? {}), {
      status: r.status ?? 200,
      headers: r.headers ?? {},
    });
  }) as typeof globalThis.fetch;
  const pool = (o: Parameters<typeof rpcPool>[0] = {}) =>
    rpcPool({
      fetch,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      ...o,
    });
  return { sent, pool, hosts: () => sent.map((s) => new URL(s.url).host) };
}

const ok = (result: unknown) => ({ body: { jsonrpc: '2.0', id: 'petal', result } });
const final = { finality: 'final' as const };
const viewParams = { request_type: 'view_account', account_id: 'a.near', ...final };

describe('rpcPool', () => {
  test('dRPC first, then FastNEAR, then Shitzu; archival only on request', () => {
    expect(DEFAULT_ENDPOINTS.map((e) => e.id)).toEqual([
      'drpc',
      'fastnear',
      'shitzu',
      'fastnear-archival',
    ]);
    expect(DEFAULT_ENDPOINTS.find((e) => e.id === 'shitzu')?.headers?.['User-Agent']).toMatch(
      /petal/,
    );
  });

  test('a call goes to dRPC and returns its result', async () => {
    const h = harness(() => ok({ amount: '1' }));
    const r = await h.pool().call('query', viewParams);
    expect(r.result).toEqual({ amount: '1' });
    expect(r.endpoint.id).toBe('drpc');
    expect(h.hosts()).toEqual(['near.drpc.org']);
    expect(h.sent[0]?.body).toMatchObject({ jsonrpc: '2.0', method: 'query', params: viewParams });
    expect(h.sent[0]?.headers['User-Agent']).toMatch(/petal/);
  });

  test('paced to the measured limit: dRPC at most one call per 400 ms', async () => {
    const h = harness(() => ok({}));
    const pool = h.pool();
    for (let i = 0; i < 4; i++) await pool.call('query', viewParams);
    expect(h.sent.map((s) => s.at)).toEqual([0, 400, 800, 1200]);
  });

  test('concurrent calls queue for their slots (real timers)', async () => {
    const times: number[] = [];
    const pool = rpcPool({
      endpoints: [{ id: 'drpc', url: 'https://near.drpc.org', intervalMs: 40 }],
      fetch: (async () => {
        times.push(Date.now());
        return new Response(JSON.stringify(ok({}).body));
      }) as typeof fetch,
    });
    await Promise.all([1, 2, 3].map(() => pool.call('query', viewParams)));
    expect(times).toHaveLength(3);
    for (let i = 1; i < times.length; i++)
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(35);
  });

  test('a 429 pauses that endpoint and the call moves on to the next', async () => {
    let drpcCalls = 0;
    const h = harness((url) => {
      if (url.includes('drpc')) {
        drpcCalls++;
        return { status: 429, headers: { 'retry-after': '5' } };
      }
      return ok({ v: 1 });
    });
    const pool = h.pool();
    const r = await pool.call('query', viewParams);
    expect(r.endpoint.id).toBe('fastnear');
    // within the pause, the next call skips dRPC
    await pool.call('query', viewParams);
    expect(drpcCalls).toBe(1);
    expect(pool.stats().http_429).toEqual({ drpc: 1 });
    expect(h.hosts()).toEqual([
      'near.drpc.org',
      'rpc.mainnet.fastnear.com',
      'rpc.mainnet.fastnear.com',
    ]);
  });

  test('5xx, broken answers and timeouts fail over too', async () => {
    const h = harness((url) =>
      url.includes('drpc') ? { status: 503 } : url.includes('fastnear') ? 'hang' : ok({ v: 2 }),
    );
    const r = await h.pool({ timeoutMs: 20 }).call('query', viewParams);
    expect(r.endpoint.id).toBe('shitzu');
    expect(h.sent.at(-1)?.headers['User-Agent']).toMatch(/petal/);
  });

  test('a JSON-RPC handler error is an answer: thrown at once, no failover', async () => {
    const h = harness(() => ({
      body: {
        jsonrpc: '2.0',
        error: {
          name: 'HANDLER_ERROR',
          cause: { name: 'UNKNOWN_BLOCK', info: {} },
          message: 'Server error',
          data: 'DB Not Found',
        },
      },
    }));
    const err = await h
      .pool()
      .call('block', { block_id: 5 })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect(err.cause_name).toBe('UNKNOWN_BLOCK');
    expect(err.endpoint).toBe('drpc');
    expect(h.sent).toHaveLength(1);
  });

  test('a definitive JSON-RPC error is an answer even with a 4xx status', async () => {
    const h = harness(() => ({
      status: 400,
      body: {
        jsonrpc: '2.0',
        error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCOUNT' }, message: 'x' },
      },
    }));
    await expect(h.pool().call('query', viewParams)).rejects.toMatchObject({
      cause_name: 'UNKNOWN_ACCOUNT',
    });
    expect(h.sent).toHaveLength(1);
  });

  test('a JSON-RPC internal error fails over', async () => {
    const h = harness((url) =>
      url.includes('drpc')
        ? {
            body: {
              jsonrpc: '2.0',
              error: { name: 'INTERNAL_ERROR', cause: { name: 'INTERNAL_ERROR' }, message: 'x' },
            },
          }
        : ok({ v: 3 }),
    );
    expect((await h.pool().call('query', viewParams)).endpoint.id).toBe('fastnear');
  });

  test('when every endpoint fails, the error names each one and why', async () => {
    const h = harness((url) => (url.includes('shitzu') ? { status: 403 } : { status: 502 }));
    const err = (await h
      .pool()
      .call('query', viewParams)
      .catch((e) => e)) as InputError;
    expect(err).toBeInstanceOf(InputError);
    expect(err.code).toBe('source_failed');
    expect(err.message).toMatch(/drpc \(https:\/\/near\.drpc\.org\): HTTP 502/);
    expect(err.message).toMatch(/fastnear .*HTTP 502/);
    expect(err.message).toMatch(/shitzu .*HTTP 403/);
    expect(new Set(err.failures?.map((f) => f.endpoint))).toEqual(
      new Set(['drpc', 'fastnear', 'shitzu']),
    );
    expect(err.toToolError().error.code).toBe('source_failed');
  });

  test('when every endpoint rate limits: rate_limited with retry_after_s', async () => {
    const h = harness(() => ({ status: 429 }));
    const err = (await h
      .pool({ rounds: 1 })
      .call('query', viewParams)
      .catch((e) => e)) as InputError;
    expect(err.code).toBe('rate_limited');
    expect(err.retry_after_s).toBe(30);
  });

  test('FastNEAR is skipped once its call cap is used up', async () => {
    const h = harness((url) => (url.includes('drpc') ? { status: 500 } : ok({})));
    const pool = h.pool({
      endpoints: [
        { id: 'drpc', url: 'https://near.drpc.org', intervalMs: 0 },
        {
          id: 'fastnear',
          url: 'https://rpc.mainnet.fastnear.com',
          intervalMs: 0,
          cap: 2,
          group: 'fastnear',
        },
        { id: 'shitzu', url: 'https://rpc.shitzuapes.xyz', intervalMs: 0 },
      ],
      rounds: 1,
    });
    for (let i = 0; i < 4; i++) await pool.call('query', viewParams);
    expect(pool.stats().calls).toEqual({ drpc: 4, fastnear: 2, shitzu: 2 });
  });

  test('reads are pinned: finality "final" or a fixed block_id, never optimistic', async () => {
    const h = harness(() => ok({}));
    const pool = h.pool();
    await expect(pool.call('query', { ...viewParams, finality: 'optimistic' })).rejects.toThrow(
      TypeError,
    );
    await expect(
      pool.call('query', { request_type: 'view_account', account_id: 'a' }),
    ).rejects.toThrow(/final/);
    await expect(pool.call('block', { finality: 'final', block_id: 3 })).rejects.toThrow(TypeError);
    await pool.call('block', { block_id: 3 });
    await pool.query({
      request_type: 'view_access_key',
      account_id: 'a.near',
      public_key: 'ed25519:x',
    });
    expect(h.sent.map((s) => s.body.params)).toEqual([
      { block_id: 3 },
      {
        request_type: 'view_access_key',
        account_id: 'a.near',
        public_key: 'ed25519:x',
        finality: 'final',
      },
    ]);
  });

  test('view encodes args, decodes the result, and reports a contract error', async () => {
    const h = harness((_u, body) => {
      const p = body.params as { method_name: string; args_base64: string };
      if (p.method_name === 'boom')
        return ok({ error: 'wasm execution failed with error: MethodNotFound', block_height: 9 });
      const args = JSON.parse(Buffer.from(p.args_base64, 'base64').toString('utf8'));
      return ok({
        result: [...Buffer.from(JSON.stringify({ echo: args }))],
        block_height: 9,
        block_hash: 'H',
      });
    });
    const pool = h.pool();
    const v = await pool.view('venear.dao', 'get_accounts', { from_index: 0 }, { block_id: 9 });
    expect(v).toMatchObject({
      value: { echo: { from_index: 0 } },
      block_height: 9,
      block_hash: 'H',
    });
    expect(h.sent[0]?.body.params).toMatchObject({
      request_type: 'call_function',
      account_id: 'venear.dao',
      method_name: 'get_accounts',
      block_id: 9,
    });
    const err = await pool.view('venear.dao', 'boom', {}, { block_id: 9 }).catch((e) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect(err.cause_name).toBe('CONTRACT_EXECUTION_ERROR');
  });

  test('archival calls go only to archival endpoints; block() reads the exact timestamp', async () => {
    const h = harness(() =>
      ok({
        header: {
          height: 7,
          hash: 'B',
          timestamp: 1793812384123456800,
          timestamp_nanosec: '1793812384123456789',
        },
      }),
    );
    const b = await h.pool().block({ block_id: 7 }, { archival: true });
    expect(h.hosts()).toEqual(['archival-rpc.mainnet.fastnear.com']);
    expect(b).toMatchObject({
      height: 7,
      hash: 'B',
      timestamp_ns: 1793812384123456789n,
      as_of: '2026-11-04T17:13:04Z',
    });
    expect(nsToIso('1793812384999999999')).toBe('2026-11-04T17:13:04Z');
  });
});
