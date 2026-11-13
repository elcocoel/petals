// A public site (PETAL_PUBLIC=1): it does no work for a visitor that reaches outside it. No chain reads,
// web reads, searches, payment quotes or chain writes: a person's own agent does those on their machine
// and posts what it made. The shared map is the copies of published rows the site ships.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { configFromEnv, createContext } from '../src/context.ts';
import { httpApp } from '../src/http/app.ts';
import { callTool, registry } from '../src/registry.ts';
import type { ToolContext } from '../src/types.ts';
import { REPO, rig, testFixture } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

const FIRST_FLOWER = '9ac16c8917aa5ca579c8421a';

/** The tools that reach outside the site, write a chain, or keep a person's own work (005): a public site refuses each. */
const ON_THEIR_MACHINE = [
  'add_layer',
  'compose_view',
  'find_target',
  'get_snapshot',
  'look_up',
  'prepare_publish',
  'publish_flower',
  'quote_payment',
  'read_chain',
  'read_page',
  'search',
];

/** Every call that would leave this process, refused and counted. */
let outside: string[];
beforeEach(async () => {
  outside = [];
  vi.stubGlobal('fetch', async (u: unknown) => {
    outside.push(String(u instanceof Request ? u.url : u));
    throw new Error('a public site called out');
  });
});
afterEach(async () => vi.unstubAllGlobals());

/** The site as the container runs it: the real context from the environment, on a fresh data folder. */
function publicSite(): ToolContext {
  const env = {
    PETAL_PUBLIC: '1',
    NEAR_AI_API_KEY: 'sk-never-used',
    PETAL_MAP_NETWORK: 'testnet',
    PETAL_MAP_RECEIVER: 'petals.testnet',
    PETAL_WRITER_ACCOUNT: 'petals-writer.testnet',
    PETAL_API: 'https://petals.example',
    PETAL_STATE_DIR: mkdtempSync(join(tmpdir(), 'petal-public-')),
  };
  return createContext(configFromEnv(env, REPO));
}

describe('a public site holds no key and reads nothing outside', () => {
  test('PETAL_PUBLIC=1 sets public, and carries the model key for the paid agent', async () => {
    const ctx = publicSite();
    expect(ctx.config.public).toBe(true);
    expect(ctx.config.nearAiApiKey).toBe('sk-never-used');
    expect(ctx.map.writer).toBeNull();
    expect(configFromEnv({}, REPO).public).toBeUndefined();
  });

  test("exactly the tools that reach outside or keep the person's work are marked as running on their machine", async () => {
    const marked = registry
      .filter((t) => (t as { onTheirMachine?: boolean }).onTheirMachine)
      .map((t) => t.name)
      .sort();
    expect(marked).toEqual(ON_THEIR_MACHINE);
  });

  test.each(ON_THEIR_MACHINE)('%s is refused, and nothing is read', async (name) => {
    const out = (await callTool(name, {}, publicSite())) as Out;
    expect(out.error).toMatchObject({
      code: 'not_on_this_site',
      message: expect.stringContaining(name),
      hint: expect.stringContaining('https://petals.example/skill.md'),
    });
    expect(outside).toEqual([]);
  });

  test('the same tools still run on a site that is not public', async () => {
    const r = await rig();
    const out = (await callTool('get_snapshot', { network: 'near-validators' }, r.ctx)) as Out;
    expect(out.error).toBeUndefined();
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the first flower on NEAR answers from the copy it ships, with its transaction', async () => {
    const ctx = publicSite();
    const got = (await callTool('get_flower', { id: FIRST_FLOWER }, ctx)) as Out;
    expect(got).toMatchObject({
      where: 'map',
      tx_hash: 'Bs8E4tJ3mFvkLaENbbY82hkAj5hWofZU5R4yVuh5UzXu',
      verified: { entry_hash: true, maker_signature: true },
    });
    const list = (await callTool('list_flowers', {}, ctx)) as Out;
    expect(list.flowers.map((f: Out) => f.id)).toContain(FIRST_FLOWER);
    const net = (await callTool('get_network', { id: 'near-validators' }, ctx)) as Out;
    expect(net.error).toBeUndefined();
    expect(outside).toEqual([]);
  });

  test('over HTTP: the landing picture draws, health says so, and refusals are 403', async () => {
    const app = httpApp(publicSite());
    const svg = await app.request(`/api/v1/flowers/${FIRST_FLOWER}/svg`);
    expect(svg.status).toBe(200);
    expect(await svg.text()).toContain('<svg');
    const health = (await (await app.request('/api/v1/health')).json()) as Out;
    // the paid agent's model; the agent's own health says who may use it
    expect(health).toMatchObject({ map: 'held', llm: 'up', public: true });
    for (const path of [
      '/api/v1/find?query=moloch',
      '/api/v1/look-up?query=moloch',
      '/api/v1/read-page?url=https://example.com',
      '/api/v1/web-search?query=moloch',
    ]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(403);
      expect(((await res.json()) as Out).error.code).toBe('not_on_this_site');
    }
    const fresh = await app.request('/api/v1/snapshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ network: 'near-validators', fresh: true }),
    });
    expect(fresh.status).toBe(403);
    expect(outside).toEqual([]);
  });

  test("its /mcp doesn't list what it would refuse", async () => {
    const app = httpApp(publicSite());
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    const text = await res.text();
    const json = JSON.parse(
      text.includes('data:') ? (text.split('data:')[1] as string) : text,
    ) as Out;
    const names = (json.result.tools as Out[]).map((t) => t.name);
    expect(names).toContain('save_step');
    expect(names).toContain('render_flower');
    for (const n of ON_THEIR_MACHINE) expect(names).not.toContain(n);
  });
});

describe("a reading made on the person's machine, posted so the site can draw it", () => {
  let ctx: ToolContext;
  let app: Hono;
  let reading: Snapshot;
  let sha: string;

  beforeEach(async () => {
    const r = await rig();
    ctx = { ...r.ctx, config: { ...r.ctx.config, public: true } };
    app = new Hono();
    app.route(
      '/',
      httpApp(ctx, {
        gate: {
          subjectOf: async (c) => c.req.header('x-test-subject') ?? null,
          refuseForeign: () => null,
        },
      }),
    );
    // A reading this site has never held: the tiny test network, a day later.
    const base = testFixture('tiny-backers').s;
    reading = { ...base, snapshot: { ...base.snapshot, as_of: '2026-11-08T12:00:00Z' } };
    sha = sha256Hex(canonicalJson(reading));
  });

  const start = async (subject?: string) => {
    const res = await app.request('/api/v1/explorations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(subject ? { 'x-test-subject': subject } : {}),
      },
      body: JSON.stringify({ question: 'who holds it?' }),
    });
    return (await res.json()) as Out;
  };
  const put = (
    ref: string,
    name: string,
    body: string | Uint8Array,
    headers: Record<string, string> = {},
  ) =>
    app.request(`/api/v1/explorations/${encodeURIComponent(ref)}/snapshots/${name}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });

  test('a continue link posts it, the site serves it, and posting again changes nothing', async () => {
    const started = await start();
    const ref = started.link.url as string;
    expect((await app.request(`/api/v1/snapshots/${sha}`)).status).toBe(404);

    const first = await put(ref, sha, JSON.stringify(reading));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      exploration: started.exploration,
      sha256: sha,
      stored: true,
      origin: 'their_machine',
    });
    const served = await app.request(`/api/v1/snapshots/${sha}`);
    expect(served.status).toBe(200);
    expect(sha256Hex(canonicalJson(await served.json()))).toBe(sha);

    const again = await put(ref, sha, JSON.stringify(reading));
    expect(await again.json()).toMatchObject({ stored: false, origin: 'their_machine' });
    expect(outside).toEqual([]);
  });

  test('then a spec over it is proposed, drawn and saved as a step, on a public site', async () => {
    const started = await start('prs_a');
    const subject = { 'x-test-subject': 'prs_a' };
    const gz = gzipSync(Buffer.from(canonicalJson(reading)));
    const posted = await put(started.exploration, sha, gz, {
      ...subject,
      'content-encoding': 'gzip',
    });
    expect(posted.status).toBe(200);
    const proposed = (await callTool(
      'propose_spec',
      { network: 'test-tiny-backers', sha256: sha },
      ctx,
    )) as Out;
    expect(proposed.error).toBeUndefined();
    const step = await app.request(`/api/v1/explorations/${started.exploration}/steps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...subject },
      body: JSON.stringify({ spec: proposed.spec }),
    });
    expect(step.status).toBe(200);
    const drawn = await app.request('/api/v1/render?format=svg', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec: proposed.spec }),
    });
    expect(drawn.status).toBe(200);
    expect(outside).toEqual([]);
  });

  test('one already held says where it came from', async () => {
    const held = testFixture('tiny-backers');
    const started = await start();
    const res = await put(started.link.url, held.sha256, JSON.stringify(held.s));
    expect(await res.json()).toMatchObject({ stored: false, origin: 'this_site' });
  });

  test('refused: a wrong name, a body that is no snapshot, too large, or nobody to post it', async () => {
    const started = await start();
    const ref = started.link.url as string;
    const wrong = await put(ref, 'a'.repeat(64), JSON.stringify(reading));
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as Out).error.message).toContain('sha256');

    const junk = { hello: 'world' };
    const notOne = await put(ref, sha256Hex(canonicalJson(junk)), JSON.stringify(junk));
    expect(notOne.status).toBe(400);
    expect(((await notOne.json()) as Out).error.message).toContain('valid snapshot');

    const big = await put(ref, sha, 'x'.repeat(2 * 1024 * 1024 + 1));
    expect(big.status).toBe(400);
    expect(((await big.json()) as Out).error.message).toContain('2 MiB');

    const bomb = gzipSync(Buffer.alloc(40 * 1024 * 1024, 32));
    const inflated = await put(ref, sha, bomb, { 'content-encoding': 'gzip' });
    expect(inflated.status).toBe(400);
    expect(((await inflated.json()) as Out).error.message).toContain('32 MiB');

    const mine = await start('prs_a');
    const theirs = await put(mine.exploration, sha, JSON.stringify(reading), {
      'x-test-subject': 'prs_b',
    });
    expect(theirs.status).toBe(404);
    const nobody = await put(mine.exploration, sha, JSON.stringify(reading));
    expect(nobody.status).toBe(404);
    expect((await app.request(`/api/v1/snapshots/${sha}`)).status).toBe(404);
  });

  test('the other routes keep their 256 KiB limit', async () => {
    const res = await app.request('/api/v1/explorations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'x'.repeat(300 * 1024) }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Out).error.message).toContain('256 KiB');
  });
});
