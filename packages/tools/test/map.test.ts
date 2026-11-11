// One map (Elco, 10 Nov: "the workspace and the agent don't seem to be connected to the global power map"):
// every view stored on the site, named and with who made it, searched by list_flowers and find_target before
// a fresh read, and handed over whole by GET /api/v1/map. On a real fixture snapshot, offline.
import {
  canonicalJson,
  DEFAULT_VIEW,
  DEFAULT_VIEW_V1,
  pictureQuery,
  sha256Hex,
  viewHash,
} from '@petal/core';
import type { Spec } from '@petal/core/types';
import { modules } from '@petal/inputs';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import { httpApp } from '../src/http/app.ts';
import { type MapView, mapsOf, mapViews, searchMap } from '../src/map.ts';
import { markMaps } from '../src/marks.ts';
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

describe('one map per address (Elco, 10 Nov)', () => {
  /** A drawing on the map, with only what grouping reads. */
  const drawing = (
    sha: string,
    map: string,
    snapshot: string,
    as_of: string,
    more: Partial<MapView> = {},
  ) =>
    ({
      sha,
      map,
      name: null,
      title: `title ${sha}`,
      network: 'erc20-holders',
      about: 'ERC-20 token holders on Gnosis',
      chain: 'gnosis',
      address: map.split(':').at(-1) as string,
      count: 3,
      as_of,
      snapshot,
      params: {},
      view_url: `https://petal.test/d/${sha}`,
      picture: `https://petal.test/api/v1/map/${sha}/svg`,
      keys: [],
      made_by: 'mapping.petals.near',
      reading: { title: '', petals: [] },
      ...more,
    }) as MapView;

  test('holders and delegates are two readings of one map, twins two drawings of one reading', () => {
    const rg = 'eip155:100:0x372f';
    const maps = mapsOf([
      drawing('a', rg, 'holders', '2026-11-09T01:00:00Z', { name: 'RaidGuild v3' }),
      drawing('b', 'eip155:100:0xother', 'other', '2026-11-09T01:00:00Z'),
      drawing('c', rg, 'delegates', '2026-11-09T02:00:00Z', { network: 'erc20-votes' }),
      drawing('d', rg, 'holders', '2026-11-09T01:00:00Z', { made_by: null }),
    ]);
    // newest first, by its newest drawing
    expect(maps.map((m) => m.id)).toEqual([rg, 'eip155:100:0xother']);
    const [card] = maps;
    // the newest drawing's picture and link, the newest named drawing's name
    expect(card).toMatchObject({
      name: 'RaidGuild v3',
      picture: 'https://petal.test/api/v1/map/d/svg',
    });
    expect(card?.view_url).toBe('https://petal.test/d/d');
    // its readings, the newest first by date; each with its maker and its drawings, the oldest first
    expect(card?.readings.map((r) => [r.snapshot, r.network, r.made_by])).toEqual([
      ['delegates', 'erc20-votes', 'mapping.petals.near'],
      ['holders', 'erc20-holders', 'mapping.petals.near'],
    ]);
    expect(card?.readings[1]?.drawings.map((d) => d.sha)).toEqual(['a', 'd']);
    // nobody named the other one
    expect(maps[1]?.name).toBeNull();
  });

  test("a map's card carries its mark (board #85): each part with where it came from, its logo on this site", async () => {
    await drawnView('Founders Guild v1', 'mapping.petals.near');
    const store = privateStore(r.ctx.config);
    const at = '2026-11-11T13:00:00.000Z';
    const logo = 'a'.repeat(64);
    const mark = {
      petal: 'mark/v1',
      about: `eip155:1:${DAO}`,
      name: {
        value: 'Moloch DAO',
        status: 'self-declared',
        source: 'daohaus',
        ref: `https://data.daohaus.club/dao/${DAO}`,
        at,
      },
      symbol: null,
      logo: {
        sha256: logo,
        media_type: 'image/png',
        status: 'self-declared',
        source: 'daohaus',
        ref: 'ipfs://Qm…',
        at,
      },
      read_at: at,
    };
    await store.mark.put({ about: mark.about, body: JSON.stringify(mark), read_at: at });
    // a stored mark that isn't one is left off, never shown half
    await store.mark.put({ about: 'eip155:1:0xbroken', body: '{"petal":"mark/v1"}', read_at: at });
    const app = new Hono();
    app.route(
      '/',
      httpApp(r.ctx, { gate: { subjectOf: async () => null, refuseForeign: () => null } }),
    );
    const { maps } = (await (await app.request('/api/v1/maps')).json()) as Out;
    expect(maps[0].mark).toEqual({
      name: mark.name,
      symbol: null,
      logo: {
        ...mark.logo,
        url: `${(r.ctx.config.apiBase ?? '').replace(/\/+$/, '')}/api/v1/media/${logo}.png`,
      },
      read_at: at,
    });
    const one = await app.request(`/api/v1/maps/${encodeURIComponent(`eip155:1:${DAO}`)}`);
    expect(((await one.json()) as Out).map.mark).toEqual(maps[0].mark);
  });

  test("the run over the shared map keeps each map's mark and its logo; --dry keeps nothing", async () => {
    await drawnView('Founders Guild v1', 'mapping.petals.near');
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://data.daohaus.club/dao/'))
        return new Response(
          JSON.stringify([{ name: 'Moloch DAO', avatarImg: 'https://img.example/moloch.png' }]),
        );
      if (url === 'https://img.example/moloch.png') return new Response(PNG);
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    const store = privateStore(r.ctx.config);
    const dry = await markMaps(r.ctx, { save: false, fetch: fetchImpl });
    expect(dry).toMatchObject({ maps: 1, saved: 0, named: 1, logos: 1 });
    expect(await store.mark.get(`eip155:1:${DAO}`)).toBeFalsy();

    const done = await markMaps(r.ctx, { fetch: fetchImpl });
    expect(done).toMatchObject({ maps: 1, saved: 1, named: 1, symbols: 0, logos: 1 });
    const row = await store.mark.get(`eip155:1:${DAO}`);
    const mark = JSON.parse(row?.body ?? '{}');
    expect(mark.name).toMatchObject({
      value: 'Moloch DAO',
      source: 'daohaus',
      status: 'self-declared',
    });
    const picture = await store.media.get(mark.logo.sha256);
    expect(picture).toMatchObject({ type: 'image/png', person: null });
    expect(Buffer.from(picture?.body ?? '', 'base64')).toEqual(Buffer.from(PNG));
  });

  test('a map with no mark read yet says so: null', async () => {
    await drawnView('Founders Guild v1', 'mapping.petals.near');
    expect(mapsOf(await mapViews(r.ctx))[0]?.mark).toBeNull();
  });

  test('GET /api/v1/maps gives one card per address, and each drawing says its map', async () => {
    const sha = await drawnView('Founders Guild v1', 'mapping.petals.near');
    const app = new Hono();
    app.route(
      '/',
      httpApp(r.ctx, { gate: { subjectOf: async () => null, refuseForeign: () => null } }),
    );
    const { views } = (await (await app.request('/api/v1/map/views')).json()) as Out;
    expect(views[0].map).toBe(`eip155:1:${DAO}`);
    const res = await app.request('/api/v1/maps');
    expect(res.status).toBe(200);
    const { maps } = (await res.json()) as Out;
    expect(maps).toHaveLength(1);
    expect(maps[0]).toMatchObject({
      id: views[0].map,
      name: 'Founders Guild v1',
      address: DAO,
      about: 'Moloch v1 members on Ethereum',
    });
    // one map's card by its id, encoded, in any case of its address
    const mixed = (views[0].map as string).replace(
      /0x([0-9a-f]+)$/,
      (_, h) => `0x${h.toUpperCase()}`,
    );
    const one = await app.request(`/api/v1/maps/${encodeURIComponent(mixed)}`);
    expect(one.status).toBe(200);
    expect(((await one.json()) as Out).map).toEqual(maps[0]);
    expect(
      (await app.request(`/api/v1/maps/${encodeURIComponent('eip155:1:0xnothing')}`)).status,
    ).toBe(404);
    expect(maps[0].readings).toEqual([
      expect.objectContaining({
        snapshot: MOLOCH,
        made_by: 'mapping.petals.near',
        drawings: [expect.objectContaining({ sha, name: 'Founders Guild v1' })],
      }),
    ]);
  });
});
describe("through the viewer's view (one-source.md, step 2)", () => {
  const IDENTITY = {
    ...DEFAULT_VIEW,
    dimensions: { ...DEFAULT_VIEW.dimensions, colour: { data: 'identity' } },
  };
  const appOf = () => {
    const app = new Hono();
    app.route(
      '/',
      httpApp(r.ctx, { gate: { subjectOf: async () => null, refuseForeign: () => null } }),
    );
    return app;
  };
  const keep = (view: typeof IDENTITY) =>
    privateStore(r.ctx.config).viewDoc.put(
      viewHash(view),
      canonicalJson(view),
      new Date().toISOString(),
    );
  const specOf = async (sha: string) =>
    JSON.parse((await privateStore(r.ctx.config).draft.get(sha))?.body as string) as Spec;

  test('a list asked for a view gives its pictures, keys and readings through it; an unknown one is refused', async () => {
    await drawnView('Founders Guild v1', 'mapping.petals.near');
    await keep(IDENTITY);
    const hash = viewHash(IDENTITY);
    const app = appOf();
    const plain = (await (await app.request('/api/v1/map/views')).json()) as Out;
    const through = (await (await app.request(`/api/v1/map/views?view=${hash}`)).json()) as Out;
    expect(plain.views[0].picture).toContain(`view=${viewHash(DEFAULT_VIEW)}`);
    expect(through.views[0].picture).toContain(`view=${hash}`);
    expect(through.views[0].keys).not.toEqual(plain.views[0].keys);
    const whole = (await (await app.request(`/api/v1/map?view=${hash}`)).json()) as Out;
    const viewed = await run('render_flower', {
      spec: await specOf(through.views[0].sha),
      view: IDENTITY,
      include_reading: true,
    });
    expect(whole.views[0].reading).toEqual(viewed.reading);
    for (const path of ['/api/v1/maps', '/api/v1/map/views', '/api/v1/map']) {
      expect((await app.request(`${path}?view=${'1'.repeat(64)}`)).status).toBe(404);
    }
  });

  test("a picture is drawn with the view its address names; the v1 default's hash and twelve characters are still the default", async () => {
    await drawnView('Founders Guild v1', 'mapping.petals.near');
    await keep(IDENTITY);
    const app = appOf();
    const [v] = await mapViews(r.ctx, IDENTITY);
    const spec = await specOf(v?.sha as string);
    const drawn = async (address: string) => sha256Hex(await (await app.request(address)).text());
    const path = new URL(v?.picture as string).pathname;
    expect(await drawn(`${path}?view=${viewHash(IDENTITY)}`)).toBe(
      (await run('render_flower', { spec, view: IDENTITY })).render_sha256,
    );
    const theDefault = (await run('render_flower', { spec, view: DEFAULT_VIEW })).render_sha256;
    expect(await drawn(path)).toBe(theDefault);
    // addresses made before view/v2 name the v1 default, which draws the same (annotation-layer.md, step 6)
    expect(await drawn(`${path}?view=${viewHash(DEFAULT_VIEW_V1).slice(0, 12)}`)).toBe(theDefault);
    expect(await drawn(`${path}?view=${viewHash(DEFAULT_VIEW_V1)}`)).toBe(theDefault);
    expect(await drawn(`${path}?view=${viewHash(DEFAULT_VIEW)}`)).toBe(theDefault);
    expect((await app.request(`${path}?view=${'1'.repeat(64)}`)).status).toBe(404);
  });

  test("render_flower draws with the view given, else the viewer's, else the default; never the spec's own", async () => {
    const spec = await specOf(await drawnView(null, null));
    const theDefault = await run('render_flower', { spec, view: DEFAULT_VIEW });
    expect((await run('render_flower', { spec })).render_sha256).toBe(theDefault.render_sha256);
    const viewer = (await callTool('render_flower', { spec }, { ...r.ctx, view: IDENTITY })) as Out;
    expect(viewer.render_sha256).toBe(
      (await run('render_flower', { spec, view: IDENTITY })).render_sha256,
    );
    expect(viewer.render_sha256).not.toBe(theDefault.render_sha256);
  });
});
