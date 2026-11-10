// T052: the HTTP tool routes (http-api.md): status per code, open CORS, per-IP limits, SSE for
// long tools, health, snapshot bodies with immutable cache headers, the flower SVG, /mcp.

import { gunzipSync } from 'node:zlib';
import { canonicalJson, sha256Hex } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { httpApp } from '../src/http/app.ts';
import { flow, progressOf, rig, validatorsFixture } from './helpers.ts';

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

async function setup() {
  const r = await rig();
  const app = httpApp(r.ctx);
  const call = async (path: string, init?: RequestInit) => {
    const res = await app.request(path, init);
    return {
      res,
      body: (await res.json()) as Record<string, unknown> & { error?: { code: string } },
    };
  };
  const run = async (name: string, input: unknown) => {
    const routes: Record<string, string> = {
      get_snapshot: '/api/v1/snapshots',
      propose_spec: '/api/v1/specs/propose',
      render_flower: '/api/v1/render',
    };
    return (await call(routes[name] as string, json(input))).body;
  };
  return { r, app, call, run };
}

describe('tool routes', () => {
  test('GET networks and a network; query params become params', async () => {
    const { call } = await setup();
    const list = await call('/api/v1/networks?query=validators');
    expect(list.res.status).toBe(200);
    expect(list.body.tools_version).toBe('tools/v2');
    const one = await call('/api/v1/networks/near-validators');
    expect((one.body.network as { id: string }).id).toBe('near-validators');
    const params = await call('/api/v1/networks/near-validators?dao=x.sputnik-dao.near');
    expect(params.res.status).toBe(400);
    expect(params.body.error?.code).toBe('bad_input');
  });

  test('status per error code: bad_input 400, not_found 404, cannot_read 422, invalid_spec 422', async () => {
    const { call } = await setup();
    expect((await call('/api/v1/figures', json({ sha256: 'x' }))).res.status).toBe(400);
    expect(
      (await call('/api/v1/figures', { method: 'POST', body: '{nope' })).body.error?.code,
    ).toBe('bad_input');
    expect((await call(`/api/v1/snapshots/${'d'.repeat(64)}/describe`)).res.status).toBe(404);
    expect((await call('/api/v1/networks/bitcoin')).res.status).toBe(422);
    const spec = { petal: 'spec/v1' };
    const render = await call('/api/v1/render', json({ spec }));
    expect(render.res.status).toBe(422);
    expect(render.body.error?.code).toBe('invalid_spec');
    const nowhere = await call('/api/v1/agent/chat', json({}));
    expect(nowhere.res.status).toBe(404); // agent routes live in @petal/agent
  });

  test('describe ?top= is read as a number', async () => {
    const { call } = await setup();
    const { sha256 } = validatorsFixture();
    const out = await call(`/api/v1/snapshots/${sha256}/describe?top=2`);
    expect(out.body.top).toHaveLength(2);
    expect((await call(`/api/v1/snapshots/${sha256}/describe?top=lots`)).res.status).toBe(400);
  });

  test('render: include_svg defaults to true over HTTP; ?format=svg returns image/svg+xml', async () => {
    const { app, run } = await setup();
    const { spec } = await flow(run);
    const out = await run('render_flower', { spec });
    expect(out.svg).toMatch(/^<svg /);
    const res = await app.request('/api/v1/render?format=svg', json({ spec }));
    expect(res.headers.get('content-type')).toMatch(/^image\/svg\+xml/);
    const svg = await res.text();
    expect(sha256Hex(svg)).toBe(out.render_sha256);
  });

  test('render: a reading comes over HTTP only when asked', async () => {
    const { app, run } = await setup();
    const { spec } = await flow(run);
    const plain = await app.request('/api/v1/render', json({ spec }));
    expect(await plain.json()).not.toHaveProperty('reading');
    const asked = await app.request('/api/v1/render', json({ spec, include_reading: true }));
    const { reading } = (await asked.json()) as { reading: { title: string; petals: unknown[] } };
    expect(reading.title).toEqual(expect.any(String));
    expect(reading.petals.length).toBeGreaterThan(0);
  });

  test('CORS is open', async () => {
    const { app } = await setup();
    const res = await app.request('/api/v1/networks', {
      headers: { origin: 'https://elsewhere.example' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const pre = await app.request('/api/v1/figures', {
      method: 'OPTIONS',
      headers: { origin: 'https://elsewhere.example', 'access-control-request-method': 'POST' },
    });
    expect(pre.status).toBe(204);
  });

  test('60 tool calls a minute per IP, then 429 rate_limited with retry_after_s', async () => {
    const { app } = await setup();
    const from = (ip: string) => ({ headers: { 'cf-connecting-ip': ip } });
    for (let i = 0; i < 60; i++)
      expect((await app.request('/api/v1/networks', from('1.2.3.4'))).status).toBe(200);
    const over = await app.request('/api/v1/networks', from('1.2.3.4'));
    expect(over.status).toBe(429);
    const body = (await over.json()) as { error: { code: string; retry_after_s: number } };
    expect(body.error.code).toBe('rate_limited');
    expect(body.error.retry_after_s).toBeGreaterThan(0);
    expect(over.headers.get('retry-after')).toBe(String(body.error.retry_after_s));
    expect((await app.request('/api/v1/networks', from('5.6.7.8'))).status).toBe(200);
    expect((await app.request('/api/v1/health', from('1.2.3.4'))).status).toBe(200);
  });
});

describe('SSE, bodies, health', () => {
  test('a long tool streams progress events, then the result event', async () => {
    const { app } = await setup();
    const res = await app.request(
      '/api/v1/snapshots',
      json({ network: 'test-live' }, { accept: 'text/event-stream' }),
    );
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const text = await res.text();
    const events = [...text.matchAll(/event: (\w+)\ndata: (.*)\n/g)].map((m) => ({
      event: m[1],
      data: JSON.parse(m[2] as string),
    }));
    // exactly the events the tool reports in process, in order, then the result
    const inProcess = await progressOf('get_snapshot', { network: 'test-live' });
    expect(events.map((e) => e.event)).toEqual([...inProcess.map(() => 'progress'), 'result']);
    expect(events.slice(0, -1).map((e) => e.data)).toEqual(inProcess);
    expect(inProcess).toContainEqual({
      stage: 'fetching',
      message: 'reading holders',
      done: 1,
      total: 2,
    });
    expect(events.at(-1)?.data).toMatchObject({ reused: false, tools_version: 'tools/v2' });
  });

  test('the snapshot body: canonical bytes, gzip, immutable cache, ETag, 304', async () => {
    const { app } = await setup();
    const { s, sha256 } = validatorsFixture();
    const res = await app.request(`/api/v1/snapshots/${sha256}`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const bytes = gunzipSync(Buffer.from(await res.arrayBuffer()));
    expect(sha256Hex(new Uint8Array(bytes))).toBe(sha256);
    expect(bytes.toString('utf8')).toBe(canonicalJson(s));
    const again = await app.request(`/api/v1/snapshots/${sha256}`, {
      headers: { 'if-none-match': `"${sha256}"` },
    });
    expect(again.status).toBe(304);
    expect((await app.request(`/api/v1/snapshots/${'d'.repeat(64)}`)).status).toBe(404);
  });

  test('health: ok, map mirror on the fake map, llm recorded without a key', async () => {
    const { call } = await setup();
    const out = await call('/api/v1/health');
    expect(out.body).toEqual({
      ok: true,
      map: 'mirror',
      llm: 'recorded',
      version: 'api/v1',
      tools_version: 'tools/v2',
      commit: null,
      // the brain every door serves (step 4): its index hash, then its commit
      brain_version: expect.stringMatching(/^[0-9a-f]{16}@([0-9a-f]{12}|unknown)$/),
      public: false,
    });
  });

  test('health reports the deployed commit, so a deploy can witness it', async () => {
    const { call } = await setup();
    process.env.PETAL_COMMIT = 'abc123def456';
    try {
      expect((await call('/api/v1/health')).body).toMatchObject({ commit: 'abc123def456' });
    } finally {
      delete process.env.PETAL_COMMIT;
    }
  });

  test("a published flower's SVG, immutable", async () => {
    const { app, r, run, call } = await setup();
    const f = await flow(run);
    const prep = (await call('/api/v1/publish/prepare', json({ entry: f.draft }))).body;
    const proof = r.signer.sign({
      message: prep.message as string,
      nonce: prep.nonce as string,
      recipient: prep.recipient as string,
    });
    const pub = await call('/api/v1/publish', json({ entry_sha256: prep.entry_sha256, proof }));
    expect(pub.res.status).toBe(200);
    const res = await app.request(`/api/v1/flowers/${pub.body.id}/svg`);
    expect(res.headers.get('content-type')).toMatch(/^image\/svg\+xml/);
    expect(res.headers.get('cache-control')).toMatch(/immutable/);
    expect(sha256Hex(await res.text())).toBe(f.rendered.render_sha256);
    const bad = await call('/api/v1/publish', json({ entry_sha256: prep.entry_sha256, proof }));
    expect(bad.res.status).toBe(401);
  });
});
