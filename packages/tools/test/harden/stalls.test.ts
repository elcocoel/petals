// T300, finding 3: one process that can't be stalled. Bodies have a limit, fresh reads take turns and
// have an end, a stored snapshot is served as stored, and power_path can't walk for long.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, runSignal, sha256Hex } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { freshGate } from '../../src/fresh.ts';
import { httpApp } from '../../src/http/app.ts';
import { callTool } from '../../src/registry.ts';
import type { ToolContext } from '../../src/types.ts';
import {
  FIXTURES,
  httpMcpClient,
  liveSnapshot,
  moduleOf,
  rig,
  type TestRig,
  testDescriptor,
  validatorsFixture,
} from '../helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

let r: TestRig;

beforeEach(async () => {
  r = await rig();
});

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

let caller = 0;
const fromSomeone = () => ({ 'cf-connecting-ip': `198.51.100.${(caller++ % 250) + 1}` });

describe('body limit', () => {
  const big = 300 * 1024;
  const paths = [
    '/api/v1/figures',
    '/api/v1/specs/validate',
    '/api/v1/render',
    '/api/v1/publish/prepare',
    '/api/v1/publish',
    '/api/v1/quote',
    '/api/v1/snapshots',
    '/mcp',
  ];

  test.each(paths)('%s: over 256 KiB is refused, with a length or as a stream', async (path) => {
    const app = httpApp(r.ctx);
    const declared = await app.request(path, {
      method: 'POST',
      headers: { 'content-length': String(big) },
      body: 'x'.repeat(big),
    });
    expect(declared.status).toBe(400);
    expect(((await declared.json()) as Out).error.message).toMatch(/256 KiB/);
    const stream = new Blob(['x'.repeat(big)]).stream();
    const undeclared = await app.request(path, {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(undeclared.status).toBe(400);
  });

  test('what fits goes through', async () => {
    const res = await httpApp(r.ctx).request('/api/v1/figures', json({ sha256: 'x' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as Out).error.message).not.toMatch(/KiB/);
  });
});

/** A live module whose fetch waits for the test, or for the read's own signal. */
function heldModule() {
  const live = liveSnapshot();
  const waiting: { go: () => void; signal?: AbortSignal }[] = [];
  let block = 0;
  const base = moduleOf(testDescriptor(live, { live: true }), live);
  const resolved = { calls: 0 };
  const module = {
    ...base,
    async resolveAt() {
      resolved.calls++;
      return { block_height: 300_000_000 + block++, as_of: live.snapshot.as_of };
    },
    async fetch(at: { block_height: number; as_of: string }) {
      const signal = runSignal();
      await new Promise<void>((go, stop) => {
        waiting.push({ go, ...(signal ? { signal } : {}) });
        signal?.addEventListener('abort', () => stop(signal.reason));
      });
      return { ...live, snapshot: { ...live.snapshot, block_height: at.block_height } } as Snapshot;
    },
  };
  return { module, waiting, resolved };
}

async function until(f: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end && !f()) await new Promise((res) => setTimeout(res, 5));
  expect(f()).toBe(true);
}

describe('fresh reads at the doors', () => {
  const read = (app: ReturnType<typeof httpApp>) =>
    app.request('/api/v1/snapshots', json({ network: 'test-live' }, fromSomeone()));

  test('two at a time across HTTP and MCP, and a plain refusal for the third', async () => {
    const h = heldModule();
    r.ctx.modules['test-live'] = h.module;
    const app = httpApp(r.ctx);
    const one = read(app);
    const client = await httpMcpClient(app, fromSomeone);
    const two = client.callTool({ name: 'get_snapshot', arguments: { network: 'test-live' } });
    await until(() => h.waiting.length === 2);

    const third = await read(app);
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBeTruthy();
    const body = (await third.json()) as Out;
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.message).toMatch(/busy|at a time/);
    expect(h.waiting).toHaveLength(2);

    // stored data doesn't wait for them
    const stored = await app.request(
      '/api/v1/snapshots',
      json({ network: 'near-validators' }, fromSomeone()),
    );
    expect(stored.status).toBe(200);

    for (const w of h.waiting) w.go();
    expect((await one).status).toBe(200);
    expect(((await two) as Out).structuredContent.reused).toBe(false);

    // the slots came back
    const again = app.request(
      '/api/v1/snapshots',
      json({ network: 'test-live', fresh: true }, fromSomeone()),
    );
    await until(() => h.waiting.length === 3);
    h.waiting[2]?.go();
    expect((await again).status).toBe(200);
    await client.close();
  });

  test('an overall timeout: the read is aborted, the caller is told, the slot comes back', async () => {
    (r.ctx.config as Out).limits = { freshMaxS: 0.05 };
    const h = heldModule();
    r.ctx.modules['test-live'] = h.module;
    const app = httpApp(r.ctx);
    const res = await read(app);
    expect(res.status).toBe(502);
    expect(((await res.json()) as Out).error.message).toMatch(/too long|longer than/);
    expect(h.waiting[0]?.signal?.aborted).toBe(true);

    const next = read(app);
    await until(() => h.waiting.length === 2);
    h.waiting[1]?.go();
    (r.ctx.config as Out).limits = {};
    expect([200, 502]).toContain((await next).status);
  });

  test('a low daily limit for anonymous callers; only real reads count, and it ends at midnight', async () => {
    (r.ctx.config as Out).limits = { freshPerDay: 2 };
    const h = heldModule();
    h.module.fetch = async (at) =>
      ({
        ...liveSnapshot(),
        snapshot: { ...liveSnapshot().snapshot, block_height: at.block_height },
      }) as Snapshot;
    r.ctx.modules['test-live'] = h.module;
    const app = httpApp(r.ctx);
    const stored = () =>
      app.request('/api/v1/snapshots', json({ network: 'near-validators' }, fromSomeone()));
    for (let i = 0; i < 5; i++) expect((await stored()).status).toBe(200);
    const fresh = () =>
      app.request('/api/v1/snapshots', json({ network: 'test-live', fresh: true }, fromSomeone()));
    expect((await fresh()).status).toBe(200);
    expect((await fresh()).status).toBe(200);
    const over = await fresh();
    expect(over.status).toBe(429);
    const body = (await over.json()) as Out;
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.retry_after_s).toBeGreaterThan(0);
    expect((await stored()).status).toBe(200);
    r.clock.set('2026-11-05T00:00:01.000Z');
    expect((await fresh()).status).toBe(200);
  });

  test('a target with nothing stored is refused before it costs a public source a call', async () => {
    (r.ctx.config as Out).limits = { freshPerDay: 0 };
    const h = heldModule();
    r.ctx.modules['test-live'] = h.module;
    expect((await read(httpApp(r.ctx))).status).toBe(429);
    expect(h.resolved.calls).toBe(0);
  });

  test('in process, with no door, nothing is gated: a local command reads what it is told', async () => {
    (r.ctx.config as Out).limits = { freshPerDay: 0 };
    const out = (await callTool('get_snapshot', { network: 'test-live' }, r.ctx)) as Out;
    expect(out.reused).toBe(false);
  });

  test('the doors and the agent’s runs take turns apart, so strangers can’t starve a run', async () => {
    const h = heldModule();
    r.ctx.modules['test-live'] = h.module;
    const app = httpApp(r.ctx);
    const reads = [read(app), read(app)];
    await until(() => h.waiting.length === 2);
    expect((await read(app)).status).toBe(429);

    const run: ToolContext = { ...r.ctx, fresh: freshGate(r.ctx, 'run') };
    const asked = callTool('get_snapshot', { network: 'test-live', fresh: true }, run);
    await until(() => h.waiting.length === 3);
    for (const w of h.waiting) w.go();
    expect(((await asked) as Out).reused).toBe(false);
    await Promise.all(reads);
  });

  test('fingerprints have their own daily cap, so fresh reads can’t drain the writer', async () => {
    (r.ctx.config as Out).limits = { fingerprintsPerDay: 1 };
    const h = heldModule();
    h.module.fetch = async (at) =>
      ({
        ...liveSnapshot(),
        snapshot: { ...liveSnapshot().snapshot, block_height: at.block_height },
      }) as Snapshot;
    r.ctx.modules['test-live'] = h.module;
    const write = vi.spyOn(r.map, 'write');
    const app = httpApp(r.ctx);
    const fresh = () =>
      app.request('/api/v1/snapshots', json({ network: 'test-live', fresh: true }, fromSomeone()));
    for (let i = 0; i < 3; i++) expect((await fresh()).status).toBe(200);
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('a stored snapshot’s body', () => {
  test('gzip is the stored file itself, not made again per request', async () => {
    const { sha256, s } = validatorsFixture();
    const stored = readFileSync(join(FIXTURES, 'snapshots', `${sha256}.json.gz`));
    const get = vi.spyOn(r.store, 'get');
    const app = httpApp(r.ctx);
    const res = await app.request(`/api/v1/snapshots/${sha256}`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(Buffer.from(await res.arrayBuffer()).equals(stored)).toBe(true);
    const again = await app.request(`/api/v1/snapshots/${sha256}`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(Buffer.from(await again.arrayBuffer()).equals(stored)).toBe(true);
    expect(get.mock.calls.length).toBeLessThanOrEqual(1);
    // a client that can't take gzip still gets the canonical bytes
    const plain = await app.request(`/api/v1/snapshots/${sha256}`);
    expect(sha256Hex(new Uint8Array(await plain.arrayBuffer()))).toBe(sha256);
    expect(canonicalJson(s).length).toBeGreaterThan(0);
  });
});

describe('power_path', () => {
  test('the public maximum is low enough not to hold the event loop', async () => {
    const asked = { account_a: 'a.near', account_b: 'b.near' };
    const out = (await callTool('power_path', { ...asked, budget: 20_000_000 }, r.ctx)) as Out;
    expect(out.error?.code).toBe('bad_input');
    expect(out.error?.message).toMatch(/budget/);
    const def = (await callTool('power_path', { ...asked, budget: 200_000 }, r.ctx)) as Out;
    expect(def.error).toBeUndefined();
    expect(def.budget).toBe(200_000);
    const fallback = (await callTool('power_path', asked, r.ctx)) as Out;
    expect(fallback.budget).toBeLessThanOrEqual(200_000);
  });
});
