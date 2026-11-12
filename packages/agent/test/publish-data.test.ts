// Publishing to the shared map (Elco, 12 Nov: "we need this live soon, it's a big part of my test"): what a
// signed-in person kept about a map goes to everyone's Power Map with one press, signed by their wallet (NEP-413,
// as signing in), at once, credited to them; a name goes only as the DAO's own records declare it (people.ts,
// 12 Nov). Through petalApp, signed in with a test wallet, on the real NEAR validators fixture. No model is called.
import { fileURLToPath } from 'node:url';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { callTool, createContext, type ToolContext } from '@petal/tools';
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
  return { map, request, signIn };
}

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

describe('publishing what a person kept about a map', () => {
  test('one press: what goes and what stays private, the wallet signs, and it lands for everyone, credited', async () => {
    const w = await setup();
    // a visitor has nothing of their own to publish
    expect((await w.request(`/api/v1/publish/data?map=${encodeURIComponent(w.map)}`)).status).toBe(
      401,
    );
    await w.signIn();
    const kept = await w.request('/api/v1/me/annotations', 'POST', {
      annotations: [DECLARED, PAGE_ONLY],
    });
    expect(kept.body, JSON.stringify(kept.body)).toMatchObject({ added: 2 });

    const ready = await w.request(`/api/v1/publish/data?map=${encodeURIComponent(w.map)}`);
    expect(ready.body).toMatchObject({ about: w.map, ready: 1, published: 0 });
    expect(ready.body.private).toHaveLength(1);
    expect(ready.body.private[0].why).toMatch(/the system's own records/);

    const prep = (await w.request('/api/v1/publish/data/prepare', 'POST', { map: w.map })).body;
    expect(prep).toMatchObject({
      about: w.map,
      claims: 1,
      private: 1,
      recipient: 'petals.example',
    });
    expect(JSON.parse(prep.message)).toEqual({
      petal: 'publish-data/v1',
      about: w.map,
      claims: 1,
      sha256: prep.sha256,
    });

    // another wallet's signature isn't theirs
    const wrong = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: bob.sign(prep as never),
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toMatch(/alice\.near/);

    const done = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: alice.sign(prep as never),
    });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      about: w.map,
      published: 1,
      by: 'near:mainnet:alice.near',
      map_url: `${SITE}/m/${encodeURIComponent(w.map)}`,
    });

    // on the map for everyone, saying who answers for it; and once only
    const said = await w.request(`/api/v1/maps/${encodeURIComponent(w.map)}/claims`);
    expect(said.body.claims).toContainEqual(
      expect.objectContaining({
        subject: POOL,
        object: { value: 'Astro' },
        by: 'near:mainnet:alice.near',
      }),
    );
    expect(said.body.claims.some((c: Out) => c.object?.value === 'Astro Stakers')).toBe(false);
    const again = await w.request('/api/v1/publish/data', 'POST', {
      sha256: prep.sha256,
      proof: alice.sign(prep as never),
    });
    expect(again.status).toBe(401);
    const after = await w.request(`/api/v1/publish/data?map=${encodeURIComponent(w.map)}`);
    expect(after.body).toMatchObject({ ready: 0, published: 1 });
    expect((await w.request('/api/v1/publish/data/prepare', 'POST', { map: w.map })).status).toBe(
      404,
    );
  });
});
