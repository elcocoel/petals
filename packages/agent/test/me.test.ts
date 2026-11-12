// A person's own, kept on the site (Elco, 10 Nov): their view, the glasses every petal they see is drawn
// through (one-source.md, step 1), and their profile in NEAR Social's own shape (social-kv/1), with its
// pictures kept here. Through petalApp, signed in with a test wallet; no model is called.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { DEFAULT_VIEW, viewHash } from '@petal/core';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { fakeRegistry, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const alice = testSigner('alice.near');
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

function setup() {
  const root = tmpRoot();
  const app = buildPetalApp(
    { root, stateDir: join(root, 'state'), apiBase: SITE, llmDailyUsd: 5 },
    {
      llm: scriptedLlm([]),
      rpcFor: () => fakeRpcFor([alice]),
      registry: fakeRegistry().registry,
      env: { PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: 'ab'.repeat(32), NODE_ENV: 'test' },
    },
  );
  const jar = { cookie: '' };
  const request = async (path: string, method = 'GET', json?: unknown, origin = SITE) => {
    const res = await app.request(path, {
      method,
      headers: {
        origin,
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    const set = res.headers.getSetCookie().find((l) => l.startsWith(`${COOKIE}=`));
    if (set) jar.cookie = set.split(';')[0] as string;
    return res;
  };
  const signIn = async () => {
    const c = (await (await request('/api/v1/auth/challenge', 'POST', {})).json()) as {
      nonce: string;
      message: string;
      recipient: string;
    };
    await request('/api/v1/auth/verify', 'POST', { network: 'mainnet', proof: alice.sign(c) });
  };
  const json = async (res: Response) => (await res.json()) as Out;
  return { request, signIn, json };
}

const IDENTITY = {
  ...DEFAULT_VIEW,
  dimensions: { ...DEFAULT_VIEW.dimensions, colour: { data: 'identity' } },
};

describe("a person's view", () => {
  test('a visitor gets the default, and can read any view by its hash', async () => {
    const w = setup();
    const res = await w.request('/api/v1/me/view');
    expect(res.status).toBe(200);
    expect(await w.json(res)).toMatchObject({ view: DEFAULT_VIEW, hash: viewHash(DEFAULT_VIEW) });
    const byHash = await w.request(`/api/v1/views/${viewHash(DEFAULT_VIEW)}`);
    expect((await w.json(byHash)).view).toEqual(DEFAULT_VIEW);
    expect((await w.request(`/api/v1/views/${'0'.repeat(64)}`)).status).toBe(404);
    // a visitor's view is the default: nothing to keep
    expect((await w.request('/api/v1/me/view', 'PUT', { view: IDENTITY })).status).toBe(401);
  });

  test("a visitor keeps a view by its hash, nobody's (walk 3, 12 Nov): read back by the hash, kept once, checked, same-origin only", async () => {
    const w = setup();
    const put = await w.request('/api/v1/views', 'PUT', { view: IDENTITY });
    expect(put.status).toBe(200);
    expect(await w.json(put)).toMatchObject({ view: IDENTITY, hash: viewHash(IDENTITY) });
    expect((await w.json(await w.request(`/api/v1/views/${viewHash(IDENTITY)}`))).view).toEqual(
      IDENTITY,
    );
    expect((await w.request('/api/v1/views', 'PUT', { view: IDENTITY })).status).toBe(200);
    // the visitor's own view as a person's stays the default: nothing kept under anyone
    expect((await w.json(await w.request('/api/v1/me/view'))).hash).toBe(viewHash(DEFAULT_VIEW));
    expect(
      (await w.request('/api/v1/views', 'PUT', { view: { ...IDENTITY, extra: 1 } })).status,
    ).toBe(400);
    expect(
      (await w.request('/api/v1/views', 'PUT', { view: IDENTITY }, 'https://elsewhere.example'))
        .status,
    ).toBe(401);
  });

  test('a signed-in person keeps their own, reads it back, and anyone reads it by its hash', async () => {
    const w = setup();
    await w.signIn();
    const put = await w.request('/api/v1/me/view', 'PUT', { view: IDENTITY });
    expect(put.status).toBe(200);
    const kept = await w.json(put);
    expect(kept).toMatchObject({ view: IDENTITY, hash: viewHash(IDENTITY) });
    expect(await w.json(await w.request('/api/v1/me/view'))).toMatchObject(kept);
    expect((await w.json(await w.request(`/api/v1/views/${kept.hash}`))).view).toEqual(IDENTITY);
    // back to the default
    await w.request('/api/v1/me/view', 'PUT', { view: DEFAULT_VIEW });
    expect((await w.json(await w.request('/api/v1/me/view'))).hash).toBe(viewHash(DEFAULT_VIEW));
  });

  test('a view that is not view/v1 is refused with the reason, and so is another site', async () => {
    const w = setup();
    await w.signIn();
    const bad = await w.request('/api/v1/me/view', 'PUT', { view: { ...IDENTITY, extra: 1 } });
    expect(bad.status).toBe(400);
    expect((await w.json(bad)).error.message).toMatch(/view\/v1.*extra/);
    const foreign = await w.request(
      '/api/v1/me/view',
      'PUT',
      { view: IDENTITY },
      'https://elsewhere.example',
    );
    expect(foreign.status).toBe(401);
    expect((await w.json(await w.request('/api/v1/me/view'))).hash).toBe(viewHash(DEFAULT_VIEW));
  });
});

describe("a person's profile, in NEAR Social's shape", () => {
  const PICTURE = Buffer.from('a tiny picture, as far as this test is concerned');
  const SHA = createHash('sha256').update(PICTURE).digest('hex');

  test('kept whole, its picture kept here and served by its sha256', async () => {
    const w = setup();
    expect((await w.request('/api/v1/me/profile')).status).toBe(401);
    await w.signIn();
    expect(await w.json(await w.request('/api/v1/me/profile'))).toMatchObject({
      profile: null,
      updated_at: null,
      published: null,
    });
    const put = await w.request('/api/v1/me/profile', 'PUT', {
      profile: {
        name: 'Alice',
        about: 'Maps who holds power.',
        avatar: `data:image/webp;base64,${PICTURE.toString('base64')}`,
        location: '',
        links: { website: 'https://alice.example', x: 'alice' },
      },
    });
    expect(put.status).toBe(200);
    const kept = await w.json(put);
    expect(kept.profile).toEqual({
      name: 'Alice',
      about: 'Maps who holds power.',
      avatar: `${SITE}/api/v1/media/${SHA}.webp`,
      location: null,
      links: { website: 'https://alice.example', x: 'alice' },
    });
    expect(kept.updated_at).toBeTruthy();
    expect(await w.json(await w.request('/api/v1/me/profile'))).toEqual(kept);
    // the picture, to anyone, kept a year
    const media = await w.request(`/api/v1/media/${SHA}.webp`);
    expect(media.status).toBe(200);
    expect(media.headers.get('content-type')).toBe('image/webp');
    expect(media.headers.get('cache-control')).toMatch(/immutable/);
    expect(Buffer.from(await media.arrayBuffer())).toEqual(PICTURE);
    expect((await w.request(`/api/v1/media/${SHA}.png`)).status).toBe(404);
    // saved again with its address, it stays; a fastfs:// address, as on chain, is kept as it is
    const again = await w.request('/api/v1/me/profile', 'PUT', {
      profile: { ...kept.profile, banner: 'fastfs://alice.near/social/media/abc.webp' },
    });
    expect((await w.json(again)).profile).toMatchObject({
      avatar: `${SITE}/api/v1/media/${SHA}.webp`,
      banner: 'fastfs://alice.near/social/media/abc.webp',
    });
  });

  test("what isn't NEAR Social's shape is refused with the reason", async () => {
    const w = setup();
    await w.signIn();
    const refused = async (profile: unknown, why: RegExp) => {
      const res = await w.request('/api/v1/me/profile', 'PUT', { profile });
      expect(res.status).toBe(400);
      expect((await w.json(res)).error.message).toMatch(why);
    };
    await refused({ name: 'A', description: 'old SocialDB key' }, /unknown field: description/);
    await refused({ name: 'x'.repeat(257) }, /256 characters/);
    await refused({ links: { 'my-site': 'https://a.example' } }, /service/);
    await refused({ avatar: 'https://elsewhere.example/a.png' }, /avatar must be/);
    await refused({ avatar: `${SITE}/api/v1/media/${'1'.repeat(64)}.webp` }, /doesn't hold/);
    expect((await w.json(await w.request('/api/v1/me/profile'))).profile).toBeNull();
  });
});
