// Publishing to the shared map (a signed version, specs/005-mapping-brain/composition.md): what a signed-in
// person kept about a map goes to everyone's Power Map with one press, as a publication/v1 in the record signed
// by one of their wallets (NEP-413, EIP-191 or ed25519), at once, credited to it; a name goes only as the DAO's
// own records declare it (people.ts). Through petalApp, signed in with test wallets, on the real NEAR validators
// fixture. No model is called.
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  type Layer,
  layerHash,
  publicationHash,
  signedText,
  unsignedHash,
} from '@petal/core';
import { evmTestSigner, fakeRpcFor, solanaTestSigner, testSigner } from '@petal/near/auth/testing';
import { callTool, createContext, privateStore, recordOf, type ToolContext } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { scriptedLlm, tmpRoot } from './helpers.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const VALIDATORS = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';
const POOL = 'near:mainnet:astro-stakers.poolv1.near';
const alice = testSigner('alice.near');
const bob = testSigner('bob.near');
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

/** A site whose Power Map holds NEAR's validators, and a browser for it. */
async function setup() {
  const stateDir = tmpRoot();
  const cfg = { root: REPO, stateDir, apiBase: SITE, fake: true, llmDailyUsd: 5 };
  const ctx: ToolContext = createContext(cfg as never);
  const proposed = (await callTool(
    'propose_spec',
    { network: 'near-validators', sha256: VALIDATORS },
    ctx,
  )) as Out;
  await callTool('render_flower', { spec: proposed.spec }, ctx);
  const map = ((await callTool('look_up', { query: 'near validators' }, ctx)) as Out).maps[0].id;
  const app = buildPetalApp(cfg as never, {
    llm: scriptedLlm([]),
    rpcFor: () => fakeRpcFor([alice, bob]),
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
  const signIn = async () => {
    const c = (await request('/api/v1/auth/challenge', 'POST', {})).body;
    await request('/api/v1/auth/verify', 'POST', {
      network: 'mainnet',
      proof: alice.sign(c as never),
    });
  };
  /** Another wallet for the person signed in, proved as its chain signs. */
  const addWallet = async (
    chain: 'eip155' | 'solana',
    signer: { address: string; sign(m: string): string },
  ) => {
    const ch = (
      await request('/api/v1/auth/challenge', 'POST', {
        chain,
        address: signer.address,
        chain_id: 8453,
      })
    ).body as { message: string };
    const proof = {
      type: chain === 'eip155' ? 'eip191' : 'ed25519',
      address: signer.address,
      message: ch.message,
      signature: signer.sign(ch.message),
    };
    return request('/api/v1/me/wallets', 'POST', { network: chain, proof });
  };
  return { map, request, signIn, addWallet, ctx };
}

const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

/** A layer the person kept about the map: proposals written by the pool's account, at one block. */
const layerAbout = (about: string, from: string[] = [], value = '3'): Layer =>
  ({
    petal: 'layer/v1',
    about,
    kind: 'measures',
    measures: [
      { name: 'proposals_written', unit: 'proposals', kind: 'count', label: 'Proposals written' },
    ],
    rows: [{ participant: POOL, measure: 'proposals_written', value }],
    how: { method: 'counted by hand', sources: [{ url: 'https://rpc.mainnet.near.org' }] },
    from,
    when: { as_of: '2026-11-09T00:00:00Z', block_height: 170000000 },
    standing: 'verified',
  }) as unknown as Layer;

/** A name the DAO's own records tie to the pool, and one only a page says. */
const DECLARED = {
  subject: POOL,
  verb: 'named',
  object: { value: 'Astro' },
  kind: 'sourced',
  evidence: [
    {
      type: 'proposal',
      proposal: 'proposal:near:mainnet:astro.sputnik-dao.near:12',
      url: 'https://nearblocks.io/address/astro.sputnik-dao.near',
      quote: 'Pay Astro for running the pool',
    },
  ],
};
const PAGE_ONLY = {
  subject: POOL,
  verb: 'named',
  object: { value: 'Astro Stakers' },
  kind: 'sourced',
  evidence: [{ type: 'page', url: 'https://astrostakers.com/', quote: 'Astro Stakers' }],
};

/** The person's own layer, kept as keep_layer keeps it. */
async function keepLayer(ctx: ToolContext, owner: string, l: Layer) {
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

const mapQ = (map: string) => `/api/v1/publish/data?map=${encodeURIComponent(map)}`;

describe('the press: a signed version on the shared map', () => {
  test('one press: what each layer adds, the wallet signs the version, and it goes in the record, credited', async () => {
    const w = await setup();
    // a visitor has nothing of their own to publish
    expect((await w.request(mapQ(w.map))).status).toBe(401);
    await w.signIn();
    const kept = await w.request('/api/v1/me/annotations', 'POST', {
      annotations: [DECLARED, PAGE_ONLY],
    });
    expect(kept.body, JSON.stringify(kept.body)).toMatchObject({ added: 2 });

    // every item, one row each, read before the press (look first), with the qualifier's confidence
    const ready = await w.request(mapQ(w.map));
    expect(ready.body).toMatchObject({
      about: w.map,
      ready: 1,
      published: 0,
      scored_by: 'fake-words',
    });
    expect(ready.body.claims).toEqual([
      {
        layer: 'Insights',
        id: expect.any(String),
        subject: POOL,
        verb: 'named',
        name: 'Astro',
        source: {
          kind: 'proposal',
          ref: 'proposal:near:mainnet:astro.sputnik-dao.near:12',
          quote: 'Pay Astro for running the pool',
          url: 'https://nearblocks.io/address/astro.sputnik-dao.near',
        },
        confidence: expect.any(Number),
      },
    ]);
    expect(ready.body.claims[0].confidence).toBeGreaterThan(0);
    expect(ready.body.adds).toEqual([
      { layer: 'Insights', kind: 'claims', verb: 'named', label: 'Names', count: 1, goes: true },
      {
        layer: 'Insights',
        kind: 'claims',
        verb: 'named',
        label: 'Names',
        count: 1,
        goes: false,
        why: 'they stay private: each says why',
      },
    ]);
    expect(ready.body.private).toEqual([
      expect.objectContaining({
        subject: POOL,
        name: 'Astro Stakers',
        why: expect.stringMatching(/the system's own records/),
      }),
    ]);
    // each layer the press would publish, and what it adds to the map in front (composition.md, section 9)
    const none = {
      new_moment: { states: [] },
      new_subjects: { count: 0 },
      match: { count: 0, authors: [] },
      differs: { count: 0, authors: [] },
    };
    expect(ready.body.layers).toEqual([
      {
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        petal: expect.stringMatching(/^claim\//),
        title: expect.any(String),
        cases: { new_data: { whats: ['claim/named'] }, ...none },
      },
    ]);
    expect(ready.body.totals).toEqual({ new_data: { whats: ['claim/named'] }, ...none });

    // the author must be one of their wallets
    const author = 'near:mainnet:alice.near';
    expect((await w.request('/api/v1/publish/data/prepare', 'POST', { map: w.map })).status).toBe(
      400,
    );
    const notTheirs = await w.request('/api/v1/publish/data/prepare', 'POST', {
      map: w.map,
      author: 'near:mainnet:bob.near',
    });
    expect(notTheirs.status).toBe(401);

    const prep = (await w.request('/api/v1/publish/data/prepare', 'POST', { map: w.map, author }))
      .body;
    expect(prep.publication).toEqual({
      petal: 'publication/v1',
      about: w.map,
      author,
      via: null,
      layers: [{ sha256: ready.body.layers[0].sha256, petal: ready.body.layers[0].petal }],
      parent: null,
      previous: null,
      published_at: expect.any(String),
    });
    expect(prep.sha256).toBe(unsignedHash(prep.publication));
    expect(prep.text).toBe(signedText(prep.publication, ready.body.name));
    expect(prep.text.split('\n').at(-1)).toBe(`Publication ${prep.sha256}`);
    expect(prep).toMatchObject({ recipient: 'petals.example', nonce: expect.any(String) });

    const proofOf = (signer: typeof alice) => {
      const signed = signer.sign({
        message: prep.text,
        nonce: prep.nonce,
        recipient: prep.recipient,
      } as never);
      return {
        standard: 'nep413',
        signature: signed.signature,
        public_key: signed.public_key,
        nonce: signed.nonce,
      };
    };
    // another wallet's signature isn't the author's
    const wrong = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: proofOf(bob),
    });
    expect(wrong.status).toBe(401);

    const done = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: proofOf(alice),
    });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body).toMatchObject({
      publication: expect.stringMatching(/^[0-9a-f]{64}$/),
      layers: prep.publication.layers,
      totals: ready.body.totals,
    });

    // in the record with its proof, at the server's place, named by its hash; the confidence seen, recorded
    const record = await recordOf(w.ctx, w.map);
    expect(record).toHaveLength(1);
    const entry = record[0] as NonNullable<(typeof record)[number]>;
    expect(entry.hash).toBe(done.body.publication);
    expect(publicationHash(entry.publication)).toBe(entry.hash);
    expect(entry.publication.proof).toMatchObject({
      standard: 'nep413',
      message: prep.text,
      recipient: 'petals.example',
      nonce: prep.nonce,
      public_key: alice.publicKey,
    });
    expect(entry.scores).toEqual({
      [ready.body.layers[0].sha256]: ready.body.claims[0].confidence,
    });
    // the map's Insights show it at once, kept with the signature that published it
    const rows = await privateStore(w.ctx.config).annotation.list('published');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.credential ?? '{}')).toMatchObject({
      publication: entry.hash,
      proof: { standard: 'nep413', message: prep.text },
      confidence: ready.body.claims[0].confidence,
      scored_by: 'fake-words',
    });
    const said = await w.request(`/api/v1/maps/${encodeURIComponent(w.map)}/claims`);
    expect(said.body.claims).toContainEqual(
      expect.objectContaining({ subject: POOL, object: { value: 'Astro' }, by: author }),
    );
    expect(said.body.claims.some((c: Out) => c.object?.value === 'Astro Stakers')).toBe(false);
    // the map names its author, on this map
    const onMap = await w.request(`/api/v1/maps/${encodeURIComponent(w.map)}`);
    expect(onMap.body.authors).toEqual([
      expect.objectContaining({ author, name: 'alice.near', imported: false }),
    ]);

    // once only
    const again = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: proofOf(alice),
    });
    expect(again.status).toBe(401);
    const after = await w.request(mapQ(w.map));
    expect(after.body).toMatchObject({ ready: 0, published: 1, layers: [] });
    expect(
      (await w.request('/api/v1/publish/data/prepare', 'POST', { map: w.map, author })).status,
    ).toBe(404);
  });

  test('the next press is the next version: what it held carried, its parent and previous the last; a layer built on one in the dark stays back', async () => {
    const w = await setup();
    await w.signIn();
    const author = 'near:mainnet:alice.near';
    await w.request('/api/v1/me/annotations', 'POST', { annotations: [DECLARED] });
    const press = async () => {
      const prep = (await w.request('/api/v1/publish/data/prepare', 'POST', { map: w.map, author }))
        .body;
      const s = alice.sign({
        message: prep.text,
        nonce: prep.nonce,
        recipient: prep.recipient,
      } as never);
      const done = await w.request('/api/v1/publish/data', 'POST', {
        sha256: prep.sha256,
        proof: {
          standard: 'nep413',
          signature: s.signature,
          public_key: s.public_key,
          nonce: s.nonce,
        },
      });
      expect(done.status, JSON.stringify(done.body)).toBe(200);
      return { prep, done: done.body };
    };
    const first = await press();

    const me = (await w.request('/api/v1/me')).body;
    expect(me.wallets).toEqual([expect.objectContaining({ author })]);
    const mine = await keepLayer(w.ctx, me.person_id, layerAbout(w.map));
    await keepLayer(w.ctx, me.person_id, layerAbout(w.map, ['ab'.repeat(32)], '4'));
    const ready = await w.request(mapQ(w.map));
    expect(ready.body.layers.map((l: Out) => l.sha256)).toEqual([mine]);
    expect(ready.body.layers[0].cases.new_data.whats).toEqual([
      'layer/proposals_written proposals count',
    ]);
    expect(ready.body.adds).toEqual(
      expect.arrayContaining([
        { layer: 'Layers', kind: 'layer', label: 'Layers kept', count: 1, goes: true },
        {
          layer: 'Layers',
          kind: 'layer',
          label: 'Layers kept',
          count: 1,
          goes: false,
          why: "it's built on a layer not published yet",
        },
      ]),
    );

    const second = await press();
    expect(second.prep.publication).toMatchObject({
      layers: [...first.prep.publication.layers, { sha256: mine, petal: 'layer/v1' }],
      parent: first.done.publication,
      previous: first.done.publication,
    });
    expect(second.done.layers).toEqual([{ sha256: mine, petal: 'layer/v1' }]);
    const record = await recordOf(w.ctx, w.map);
    expect(record.map((e) => e.hash)).toEqual([first.done.publication, second.done.publication]);
    // the layer's body is kept once, by its hash, for anyone to recompose
    const kept = await privateStore(w.ctx.config).publication.layer(mine);
    expect(kept?.body && JSON.parse(kept.body)).toMatchObject({ petal: 'layer/v1', about: w.map });
  });

  test('an EVM wallet signs the version with EIP-191, a Solana wallet with ed25519', async () => {
    const w = await setup();
    await w.signIn();
    const evm = evmTestSigner('press');
    const sol = solanaTestSigner('press');
    expect((await w.addWallet('eip155', evm)).status).toBe(200);
    expect((await w.addWallet('solana', sol)).status).toBe(200);
    const me = (await w.request('/api/v1/me')).body;
    const evmAuthor = `eip155:1:${evm.address}`;
    const solAuthor = `${SOLANA}:${sol.address}`;
    expect(me.wallets.map((x: Out) => x.author).sort()).toEqual(
      ['near:mainnet:alice.near', evmAuthor, solAuthor].sort(),
    );
    await w.request('/api/v1/me/annotations', 'POST', { annotations: [DECLARED] });

    const prep = (
      await w.request('/api/v1/publish/data/prepare', 'POST', { map: w.map, author: evmAuthor })
    ).body;
    expect(prep.publication.author).toBe(evmAuthor);
    expect(prep.recipient).toBeUndefined();
    expect(prep.nonce).toBeUndefined();
    const send = (proof: Out) =>
      w.request('/api/v1/publish/data', 'POST', { sha256: prep.sha256, proof });
    // an EVM wallet signs with EIP-191, and only its own signature is its
    expect((await send({ standard: 'ed25519', signature: sol.sign(prep.text) })).status).toBe(401);
    expect(
      (await send({ standard: 'eip191', signature: evmTestSigner('other').sign(prep.text) }))
        .status,
    ).toBe(401);
    const done = await send({ standard: 'eip191', signature: evm.sign(prep.text) });
    expect(done.status, JSON.stringify(done.body)).toBe(200);

    // the Solana wallet publishes its own version: a layer it kept (the claim is on the map already)
    await keepLayer(w.ctx, me.person_id, layerAbout(w.map));
    const solPrep = (
      await w.request('/api/v1/publish/data/prepare', 'POST', { map: w.map, author: solAuthor })
    ).body;
    expect(solPrep.publication).toMatchObject({ author: solAuthor, parent: null, previous: null });
    const solDone = await w.request('/api/v1/publish/data', 'POST', {
      sha256: solPrep.sha256,
      proof: { standard: 'ed25519', signature: sol.sign(solPrep.text) },
    });
    expect(solDone.status, JSON.stringify(solDone.body)).toBe(200);
    const record = await recordOf(w.ctx, w.map);
    expect(record.map((e) => [e.publication.author, e.publication.proof?.standard])).toEqual([
      [evmAuthor, 'eip191'],
      [solAuthor, 'ed25519'],
    ]);
  });
});
