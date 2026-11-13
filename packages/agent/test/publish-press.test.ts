// One press, many publications (specs/005-mapping-brain/composition.md, section 2b): a person's whole contribution,
// however many maps, is one signature over a manifest; what it adds to each map is that map's own publication/v1;
// the record takes all of them or none. And Petals' own base data, signed by petals.near over the import, through
// the same press. Through petalApp, signed in with test wallets, on two real fixtures. No model is called.
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  compose,
  IMPORTED_AUTHOR,
  type Layer,
  layerHash,
  manifestHash,
  manifestText,
  PETALS_AUTHOR,
  pressedWith,
  unsignedHash,
} from '@petal/core';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import {
  appendPublication,
  callTool,
  createContext,
  creditFor,
  importRecord,
  layersOf,
  preparePress,
  privateStore,
  recordOf,
  type ToolContext,
} from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { scriptedLlm, tmpRoot } from './helpers.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const VALIDATORS = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';
const MOLOCH = 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c';
const alice = testSigner('alice.near');
const petals = testSigner('petals.near');
const ALICE = 'near:mainnet:alice.near';
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

/** A site whose Power Map holds NEAR's validators and a Moloch DAO, each drawn by Petals' mapping. */
async function setup() {
  const stateDir = tmpRoot();
  const cfg = { root: REPO, stateDir, apiBase: SITE, fake: true, llmDailyUsd: 5 };
  const ctx: ToolContext = createContext(cfg as never);
  const store = privateStore(ctx.config);
  const maps: string[] = [];
  for (const [network, sha256, query] of [
    ['near-validators', VALIDATORS, 'near validators'],
    ['moloch-v1', MOLOCH, 'moloch'],
  ] as const) {
    const proposed = (await callTool('propose_spec', { network, sha256 }, ctx)) as Out;
    const drawn = (await callTool('render_flower', { spec: proposed.spec }, ctx)) as Out;
    await store.draft.label(drawn.spec_sha256, { name: null, made_by: IMPORTED_AUTHOR });
    maps.push(((await callTool('look_up', { query }, ctx)) as Out).maps[0].id);
  }
  const app = buildPetalApp(cfg as never, {
    llm: scriptedLlm([]),
    rpcFor: () => fakeRpcFor([alice, petals]),
    env: { PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: 'ab'.repeat(32), NODE_ENV: 'test' },
  });
  const jar = { cookie: '' };
  const request = async (path: string, method = 'GET', json?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        origin: SITE,
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    const set = res.headers.getSetCookie().find((l) => l.startsWith(`${COOKIE}=`));
    if (set) jar.cookie = set.split(';')[0] as string;
    return { status: res.status, body: (await res.json()) as Out };
  };
  const signIn = async (who: typeof alice) => {
    const c = (await request('/api/v1/auth/challenge', 'POST', {})).body;
    await request('/api/v1/auth/verify', 'POST', {
      network: 'mainnet',
      proof: who.sign(c as never),
    });
  };
  return { ctx, store, maps, request, signIn };
}

/** The person's own layer about a map, kept as keep_layer keeps it: a count per member at one block. */
async function keepLayer(ctx: ToolContext, owner: string, about: string, value: string) {
  const l = {
    petal: 'layer/v1',
    about,
    kind: 'measures',
    measures: [{ name: 'proposals_written', unit: 'proposals', kind: 'count', label: 'Proposals' }],
    rows: [{ participant: `${about}#member`, measure: 'proposals_written', value }],
    how: { method: 'counted by hand', sources: [{ url: 'https://rpc.mainnet.near.org' }] },
    from: [],
    when: { as_of: '2026-11-09T00:00:00Z', block_height: 170000000 },
    standing: 'verified',
  } as unknown as Layer;
  await privateStore(ctx.config).layer.keep({
    owner,
    hash: layerHash(l),
    about: l.about,
    standing: l.standing,
    body: canonicalJson(l),
    credential: null,
    created_at: '2026-11-13T00:00:00.000Z',
  } as never);
  return layerHash(l);
}

/** The wallet's NEP-413 signature of a prepared text, as the page sends it. */
const signed = (who: typeof alice, prep: Out) => {
  const s = who.sign({ message: prep.text, nonce: prep.nonce, recipient: prep.recipient } as never);
  return {
    standard: 'nep413',
    signature: s.signature,
    public_key: s.public_key,
    nonce: prep.nonce,
  };
};

const owner = async (w: Awaited<ReturnType<typeof setup>>) =>
  String((await w.request('/api/v1/me')).body.person_id);

describe('one press over many maps (manifest/v1)', () => {
  test("a person's contribution to two maps: one signature, each map its own publication, in the record together", async () => {
    const w = await setup();
    await w.signIn(alice);
    const me = await owner(w);
    const [m1, m2] = w.maps as [string, string];
    const l1 = await keepLayer(w.ctx, me, m1, '3');
    const l2 = await keepLayer(w.ctx, me, m2, '5');

    const prep = (
      await w.request('/api/v1/publish/data/prepare', 'POST', { maps: [m1, m2], author: ALICE })
    ).body;
    expect(prep.manifest).toEqual({
      petal: 'manifest/v1',
      author: ALICE,
      publications: prep.publications.map((p: Out) => p.sha256),
      published_at: expect.any(String),
    });
    expect(prep.sha256).toBe(manifestHash(prep.manifest));
    expect(prep.text).toBe(manifestText(prep.manifest));
    expect(prep.text).toBe(`Petals: publish 2 versions in your name.\nManifest ${prep.sha256}`);
    expect(prep.publications.map((p: Out) => [p.about, p.publication.layers])).toEqual([
      [m1, [{ sha256: l1, petal: 'layer/v1' }]],
      [m2, [{ sha256: l2, petal: 'layer/v1' }]],
    ]);
    for (const p of prep.publications) expect(p.sha256).toBe(unsignedHash(p.publication));
    expect(prep.left).toEqual([]);

    const out = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: signed(alice, prep),
    });
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    expect(out.body.manifest).toBe(prep.sha256);
    expect(out.body.publications.map((p: Out) => p.about)).toEqual([m1, m2]);

    // each is an ordinary publication about its own map, its proof the one signature and the manifest
    const record = await recordOf(w.ctx);
    expect(record.map((e) => [e.publication.about, e.publication.author])).toEqual([
      [m1, ALICE],
      [m2, ALICE],
    ]);
    expect(record.map((e) => e.seq)).toEqual([1, 2]);
    const [a, b] = record;
    expect(a?.publication.proof?.signature).toBe(b?.publication.proof?.signature);
    expect(a?.publication.proof?.manifest).toBe(prep.sha256);
    // anyone checks one from the site: the record names the manifest, and the three steps hold
    const history = (await w.request(`/api/v1/maps/${encodeURIComponent(m2)}/record`)).body;
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({
      seq: 2,
      author: ALICE,
      signed: true,
      parent: null,
      previous: null,
      added: [l2],
      dropped: [],
      manifest: prep.manifest,
    });
    const p = history.entries[0];
    expect(
      pressedWith(
        {
          petal: 'publication/v1',
          about: m2,
          author: p.author,
          via: p.via,
          layers: p.layers,
          parent: p.parent,
          previous: p.previous,
          published_at: p.published_at,
          proof: p.proof,
        },
        p.manifest,
      ),
    ).toEqual({ ok: true });
    // credit counts each publication as one signed alone
    const credit = await creditFor(w.ctx, ALICE);
    expect(credit.layers.map((l) => [l.map, l.seq])).toEqual([
      [m1, 1],
      [m2, 2],
    ]);
    // once published, the same press can't go again
    const again = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: signed(alice, prep),
    });
    expect(again.status).toBe(401);
  });

  test('all or none: a press whose version on one map went stale publishes nothing', async () => {
    const w = await setup();
    await w.signIn(alice);
    const me = await owner(w);
    const [m1, m2] = w.maps as [string, string];
    await keepLayer(w.ctx, me, m1, '3');
    await keepLayer(w.ctx, me, m2, '5');
    const press = (
      await w.request('/api/v1/publish/data/prepare', 'POST', { maps: 'all', author: ALICE })
    ).body;
    expect(press.publications.map((p: Out) => p.about).sort()).toEqual([m1, m2].sort());
    // the same person publishes one map alone meanwhile
    const one = (
      await w.request('/api/v1/publish/data/prepare', 'POST', { map: m1, author: ALICE })
    ).body;
    expect(
      (
        await w.request('/api/v1/publish/data', 'POST', {
          sha256: one.sha256,
          proof: signed(alice, one),
        })
      ).status,
    ).toBe(200);
    const stale = await w.request('/api/v1/publish/data', 'POST', {
      sha256: press.sha256,
      proof: signed(alice, press),
    });
    expect(stale.status).toBe(401);
    expect(stale.body.error.message).toMatch(/since this was prepared/);
    expect((await recordOf(w.ctx)).map((e) => e.publication.about)).toEqual([m1]);
  });

  test('a signature over another text publishes nothing', async () => {
    const w = await setup();
    await w.signIn(alice);
    const me = await owner(w);
    const [m1, m2] = w.maps as [string, string];
    await keepLayer(w.ctx, me, m1, '3');
    await keepLayer(w.ctx, me, m2, '5');
    const prep = (
      await w.request('/api/v1/publish/data/prepare', 'POST', { maps: [m1, m2], author: ALICE })
    ).body;
    const wrong = signed(alice, { ...prep, text: `${prep.text} ` });
    const out = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: wrong,
    });
    expect(out.status).toBe(401);
    expect(await recordOf(w.ctx)).toEqual([]);
  });
});

describe("Petals' base data: petals.near signs over the import, through the same press", () => {
  test('one signature over every map Petals holds; then the import and petals.near are one author on each', async () => {
    const w = await setup();
    const report = await importRecord(w.ctx);
    expect(report.publications.map((p) => p.author)).toEqual([IMPORTED_AUTHOR, IMPORTED_AUTHOR]);
    const imported = await recordOf(w.ctx);
    // the dry run (scripts/press-dry.ts) says what the press would be, before anyone signs, and keeps nothing
    const dry = await preparePress(
      w.ctx,
      { owner: 'press-dry', authors: [PETALS_AUTHOR] },
      'all',
      PETALS_AUTHOR,
      'dry',
      { dry: true },
    );
    expect(dry.publications.map((p) => p.about).sort()).toEqual([...w.maps].sort());
    expect('nonce' in dry).toBe(false);
    expect(await w.store.publishDraft.get(dry.sha256)).toBeFalsy();

    await w.signIn(petals);
    const prep = (
      await w.request('/api/v1/publish/data/prepare', 'POST', {
        maps: 'all',
        author: PETALS_AUTHOR,
      })
    ).body;
    expect(prep.text, JSON.stringify(prep)).toBe(
      `Petals: publish 2 versions in your name.\nManifest ${prep.sha256}`,
    );
    expect(prep.publications.map((p: Out) => p.publication.layers)).toEqual(
      dry.publications.map((p) => p.publication.layers),
    );
    // each version signs what the import holds, as it is: the next version after the map's imported entry
    for (const p of prep.publications) {
      const entry = imported.find((e) => e.publication.about === p.about);
      expect(p.publication).toMatchObject({
        author: PETALS_AUTHOR,
        layers: entry?.publication.layers,
        parent: entry?.hash,
        previous: entry?.hash,
      });
    }
    const out = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: signed(petals, prep),
    });
    expect(out.status, JSON.stringify(out.body)).toBe(200);

    const record = await recordOf(w.ctx);
    const docs = await layersOf(w.ctx, record);
    for (const about of w.maps) {
      const map = compose(about, record, docs);
      expect(map.authors.map((a) => [a.author, a.imported])).toEqual([[PETALS_AUTHOR, false]]);
    }
    const credit = await creditFor(w.ctx, PETALS_AUTHOR);
    expect(credit.totals.confirmed).toBe(0);
    expect(credit.totals.first).toBeGreaterThan(0);
    // from then on what Petals holds goes through a press: the import leaves those maps
    const after = await importRecord(w.ctx, { dry: true });
    expect(after.publications).toEqual([]);
    expect(after.left.sort()).toEqual([...w.maps].sort());
  });

  test("a map where petals.near published before keeps both lines: parent the import's, previous its own", async () => {
    const w = await setup();
    await importRecord(w.ctx);
    const [m1] = w.maps as [string, string];
    const imported = (await recordOf(w.ctx)).find((e) => e.publication.about === m1);
    // petals.near's own earlier publication on m1, appended after the import (as the 35 names were)
    const names = {
      petal: 'layer/v1',
      about: m1,
      kind: 'measures',
      measures: [{ name: 'named', unit: 'names', kind: 'count', label: 'Names' }],
      rows: [{ participant: `${m1}#member`, measure: 'named', value: '1' }],
      how: { method: 'read by hand', sources: [{ url: 'https://rpc.mainnet.near.org' }] },
      from: [],
      when: { as_of: '2026-11-12T00:00:00Z', block_height: 170000001 },
      standing: 'verified',
    };
    const own = await appendPublication(
      w.ctx,
      {
        petal: 'publication/v1',
        about: m1,
        author: PETALS_AUTHOR,
        via: null,
        layers: [{ sha256: layerHash(names as unknown as Layer), petal: 'layer/v1' }],
        parent: null,
        previous: null,
        published_at: '2026-11-12T22:07:10.243Z',
        proof: null,
      },
      new Map([[layerHash(names as unknown as Layer), names]]),
    );
    // before petals.near signs over the import, the two stand apart
    let record = await recordOf(w.ctx);
    expect(compose(m1, record, await layersOf(w.ctx, record)).authors.map((a) => a.author)).toEqual(
      [IMPORTED_AUTHOR, PETALS_AUTHOR],
    );

    await w.signIn(petals);
    const prep = (
      await w.request('/api/v1/publish/data/prepare', 'POST', { maps: [m1], author: PETALS_AUTHOR })
    ).body;
    const [p] = prep.publications;
    expect(p.publication.parent).toBe(imported?.hash);
    expect(p.publication.previous).toBe(own.hash);
    expect(p.publication.layers).toEqual([
      ...(imported?.publication.layers ?? []),
      ...own.publication.layers,
    ]);
    const out = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: signed(petals, prep),
    });
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    record = await recordOf(w.ctx);
    const map = compose(m1, record, await layersOf(w.ctx, record));
    expect(map.authors.map((a) => [a.author, a.imported])).toEqual([[PETALS_AUTHOR, false]]);
    expect(map.layers.map((l) => l.sha256).sort()).toEqual(
      p.publication.layers.map((l: Out) => l.sha256).sort(),
    );
    expect((await creditFor(w.ctx, PETALS_AUTHOR)).totals.confirmed).toBe(0);
  });
});
