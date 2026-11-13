// A person's public profile by account (GET /api/v1/profiles/:account): anyone reads it, signed in or not.
// One profile, the same as NEAR Social: the account's own NEAR Social profile first, else what the person set on
// Petals, else none; only the account asked is named. NEAR Social is a stub here; no network is called.
import { join } from 'node:path';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';
import { networkOfAccount } from '../src/me-routes.ts';
import type { PublicProfile } from '../src/social-read.ts';
import { fakeRegistry, scriptedLlm, tmpRoot } from './helpers.ts';

const SITE = 'https://petals.example';
const COOKIE = '__Host-petal_session';
const alice = testSigner('alice.near');
const BOB_ON_SOCIAL: PublicProfile = {
  name: 'Bob',
  about: 'On NEAR Social.',
  avatar: 'https://ipfs.near.social/ipfs/bafy',
  links: { github: 'bob' },
};
// biome-ignore lint/suspicious/noExplicitAny: walking what the server answers
type Out = Record<string, any>;

function setup() {
  const root = tmpRoot();
  const asked: string[] = [];
  const app = buildPetalApp(
    { root, stateDir: join(root, 'state'), apiBase: SITE, llmDailyUsd: 5 },
    {
      llm: scriptedLlm([]),
      rpcFor: () => fakeRpcFor([alice]),
      registry: fakeRegistry().registry,
      env: { PETAL_AGENT_ACCESS: 'gated', PETAL_WALLET_KEY: 'ab'.repeat(32), NODE_ENV: 'test' },
      socialProfile: async (account) => {
        asked.push(account);
        return account === 'bob.near' ? BOB_ON_SOCIAL : null;
      },
    },
  );
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
  const signOut = () => {
    jar.cookie = '';
  };
  return { request, signIn, signOut, asked };
}

describe('a public profile by account', () => {
  test('a NEAR account’s own NEAR Social profile, for anyone, cached in public', async () => {
    const w = setup();
    const res = await w.request('/api/v1/profiles/bob.near');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('public');
    const out = (await res.json()) as Out;
    expect(out).toMatchObject({
      account: 'bob.near',
      chain: 'near',
      source: 'near-social',
      profile: BOB_ON_SOCIAL,
    });
  });

  test('with nothing on NEAR Social, what the person set on Petals, read by someone signed out', async () => {
    const w = setup();
    await w.signIn();
    const put = await w.request('/api/v1/me/profile', 'PUT', {
      profile: { name: 'Alice', about: 'Maps who holds power.', links: { x: 'alice' } },
    });
    expect(put.status).toBe(200);
    w.signOut();
    const out = (await (await w.request('/api/v1/profiles/alice.near')).json()) as Out;
    expect(out).toMatchObject({
      account: 'alice.near',
      source: 'petals',
      profile: {
        name: 'Alice',
        about: 'Maps who holds power.',
        avatar: null,
        links: { x: 'alice' },
      },
    });
    // it names only the account asked: no list of the person's wallets
    expect(JSON.stringify(out)).not.toContain('wallets');
  });

  test('an account nobody has: no profile', async () => {
    const w = setup();
    const out = (await (await w.request('/api/v1/profiles/nobody.near')).json()) as Out;
    expect(out).toMatchObject({ account: 'nobody.near', source: null, profile: null });
  });

  test('not an account', async () => {
    const w = setup();
    expect((await w.request('/api/v1/profiles/not%20an%20account!')).status).toBe(400);
  });

  test('accounts by their shape', () => {
    expect(networkOfAccount('0x3F5CE5FBFE3E9AF3971DD833D26BA9B5C936F0BE')).toBe('eip155');
    expect(networkOfAccount('alice.near')).toBe('mainnet');
    expect(networkOfAccount('a'.repeat(64))).toBe('mainnet');
    expect(networkOfAccount('DgiASgeARPbs4p4LSMhhtKb7L6BkW9tfN4eDT1C9yeCE')).toBe('solana');
    expect(networkOfAccount('no spaces')).toBeNull();
  });
});
