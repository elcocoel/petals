// One map (Elco, 10 Nov: "the workspace and the agent don't seem to be connected to the global power map"):
// every view stored on the site, named and with who made it, searched by list_flowers and find_target before
// a fresh read, and handed over whole by GET /api/v1/map. On a real fixture snapshot, offline.
import { DEFAULT_VIEW, pictureQuery, sha256Hex } from '@petal/core';
import type { Spec } from '@petal/core/types';
import { modules } from '@petal/inputs';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import { httpApp } from '../src/http/app.ts';
import { mapViews, searchMap } from '../src/map.ts';
import { callTool } from '../src/registry.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

const MOLOCH = 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c';
const DAO = '0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1';

let r: TestRig;
const run = async (name: string, input: unknown) => (await callTool(name, input, r.ctx)) as Out;

/** A view drawn from the stored Moloch snapshot, named the way the night's run named its views. */
async function drawnView(name: string | null, by: string | null) {
  const proposed = await run('propose_spec', { network: 'moloch-v1', sha256: MOLOCH });
  const drawn = await run('render_flower', { spec: proposed.spec as Spec });
  const sha = drawn.spec_sha256 as string;
  if (name !== null || by !== null) {
    expect(await privateStore(r.ctx.config).draft.label(sha, { name, made_by: by })).toBe(true);
  }
  return sha;
}

beforeEach(async () => {
  r = await rig();
  r.ctx.modules = {
    ...r.ctx.modules,
    'moloch-v1': modules['moloch-v1'] as NonNullable<(typeof modules)[string]>,
  };
});

describe('the map', () => {
  test('a stored view is on it with its name, reading, address, date and maker', async () => {
    const sha = await drawnView('Founders Guild v1', 'mapping.petals.near');
    const [v] = await mapViews(r.ctx);
    expect(v).toMatchObject({
      sha,
      name: 'Founders Guild v1',
      network: 'moloch-v1',
      // what was read and where, in people's words, never the reader's id
      about: 'Moloch v1 members on Ethereum',
      chain: 'ethereum',
      address: DAO,
      snapshot: MOLOCH,
      made_by: 'mapping.petals.near',
      view_url: `https://petal.test/d/${sha}`,
    });
    expect(v?.count).toBeGreaterThan(0);
    expect(v?.reading.petals.length).toBeGreaterThan(0);
    expect(searchMap(await mapViews(r.ctx), 'founders guild')).toHaveLength(1);
    expect(searchMap(await mapViews(r.ctx), DAO.slice(0, 10))).toHaveLength(1);
    expect(searchMap(await mapViews(r.ctx), 'raidguild')).toHaveLength(0);
  });

  test('list_flowers finds it with q, says who made it, and without q says how many are there', async () => {
    await drawnView('Founders Guild v1', 'mapping.petals.near');
    const found = await run('list_flowers', { q: 'Founders Guild' });
    expect(found.views).toHaveLength(1);
    expect(found.views[0]).toMatchObject({
      name: 'Founders Guild v1',
      snapshot: MOLOCH,
      made_by: "Petals' own mapping (mapping.petals.near)",
    });
    const none = await run('list_flowers', {});
    expect(none.views).toBeUndefined();
    expect(none.views_total).toBe(1);
    expect(none.hint).toMatch(/pass q/);
    // a view nobody named is still found by its reading and reader, and says its maker isn't recorded
    const sha = found.views[0].view_url.split('/d/')[1];
    await privateStore(r.ctx.config).draft.label(sha, { name: null, made_by: null });
    const all = await run('list_flowers', { q: 'moloch' });
    expect(all.views[0]).toMatchObject({ name: null, made_by: 'not recorded' });
  });

  test('find_target answers a name from the map, with its stored snapshot, so no fresh read is needed', async () => {
    await drawnView('Founders Guild v1', 'mapping.petals.near');
    const out = await run('find_target', { query: 'Founders Guild' });
    const c = out.candidates.find((x: Out) => x.address === DAO);
    expect(c).toBeDefined();
    expect(c.sources.map((s: Out) => s.id)).toContain('petal-map');
    expect(c.draw[0]).toMatchObject({ module: 'moloch-v1', stored: { sha256: MOLOCH } });
  });

  test('GET /api/v1/map hands over the views, the groups and the pairs in one answer', async () => {
    await drawnView('Founders Guild v1', 'mapping.petals.near');
    const app = new Hono();
    app.route(
      '/',
      httpApp(r.ctx, { gate: { subjectOf: async () => null, refuseForeign: () => null } }),
    );
    const res = await app.request('/api/v1/map');
    expect(res.status).toBe(200);
    const map = (await res.json()) as Out;
    expect(map.views).toHaveLength(1);
    expect(map.views[0].name).toBe('Founders Guild v1');
    expect(Array.isArray(map.groups)).toBe(true);
    expect(Array.isArray(map.pairs)).toBe(true);
  });

  test('GET /api/v1/map/views lists the same views with their pictures, without readings', async () => {
    const sha = await drawnView('Founders Guild v1', 'mapping.petals.near');
    const app = new Hono();
    app.route(
      '/',
      httpApp(r.ctx, { gate: { subjectOf: async () => null, refuseForeign: () => null } }),
    );
    const whole = (await (await app.request('/api/v1/map')).json()) as Out;
    const res = await app.request('/api/v1/map/views');
    expect(res.status).toBe(200);
    const { views } = (await res.json()) as Out;
    const { reading: _r, ...row } = whole.views[0];
    expect(views).toEqual([row]);
    expect(views[0].reading).toBeUndefined();
    // the picture names the look and the view it's drawn with, so a cached one is never the old one
    expect(views[0].picture).toBe(
      `https://petal.test/api/v1/map/${sha}/svg?${pictureQuery(DEFAULT_VIEW)}`,
    );
  });

  test("a view's picture: drawn with the default view, kept a year, and nothing for a hash off the map", async () => {
    const sha = await drawnView('Founders Guild v1', 'mapping.petals.near');
    const app = new Hono();
    app.route(
      '/',
      httpApp(r.ctx, { gate: { subjectOf: async () => null, refuseForeign: () => null } }),
    );
    const res = await app.request(new URL((await mapViews(r.ctx))[0]?.picture as string).pathname);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^image\/svg\+xml/);
    expect(res.headers.get('cache-control')).toMatch(/immutable/);
    const spec = JSON.parse(
      (await privateStore(r.ctx.config).draft.get(sha))?.body as string,
    ) as Spec;
    const viewed = await run('render_flower', { spec, view: DEFAULT_VIEW });
    expect(sha256Hex(await res.text())).toBe(viewed.render_sha256);
    expect(res.headers.get('etag')).toBe(`"${viewed.render_sha256}"`);
    // its keys are that picture's colours, as its legend has them: colour's, then the tail's
    const keysOf = (p: string) =>
      (viewed.legend as Out[]).filter((i) => i.primitive === p).flatMap((i) => i.keys ?? []);
    const keys = [...keysOf('colour'), ...keysOf('tail')];
    expect(keys.length).toBeGreaterThan(0);
    expect((await mapViews(r.ctx))[0]?.keys).toEqual(keys);
    expect((await app.request(`/api/v1/map/${'0'.repeat(64)}/svg`)).status).toBe(404);
    expect((await app.request('/api/v1/map/nope/svg')).status).toBe(404);
  });
});
