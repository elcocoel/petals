// Petals on Postgres, through its real routes: two people sign in with test wallets, one makes a
// workspace, and the other can't read it, change it or find it by search. On Postgres in process in
// every check, and on a real server as the restricted runtime role when PETAL_TEST_DATABASE_URL is set.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { stateStore } from '@petal/store';
import { afterAll, describe, expect, test } from 'vitest';
import { buildPetalApp } from '../src/app.ts';

// biome-ignore lint/suspicious/noExplicitAny: reading JSON answers
type Out = Record<string, any>;

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const SITE = 'http://127.0.0.1:3188';
const server = process.env.PETAL_TEST_DATABASE_URL?.trim();
const targets = [
  ['postgres in process', 'pglite:'],
  ...(server ? [['postgres server, runtime role', server]] : []),
] as [string, string][];

const alice = testSigner(`alice-${process.pid}.testnet`);
const bob = testSigner(`bob-${process.pid}.testnet`);
const apps: { close?: () => void }[] = [];
afterAll(() => {
  for (const a of apps) a.close?.();
});

describe.each(targets)('%s', (_name, databaseUrl) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'petal-pg-app-'));
  const app = buildPetalApp(
    {
      root: REPO,
      stateDir,
      databaseUrl,
      apiBase: SITE,
      llmDailyUsd: 0,
      public: true,
    },
    {
      env: { PETAL_WALLET_KEY: 'cd'.repeat(32), NODE_ENV: 'production' },
      rpcFor: () => fakeRpcFor([alice, bob]),
    },
  );

  /** A browser: its own cookie, and the site's origin. */
  function browser() {
    let cookie = '';
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, {
        method,
        headers: { 'content-type': 'application/json', origin: SITE, cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0] as string;
      return { status: res.status, body: (await res.json().catch(() => null)) as Out };
    };
    return {
      call,
      async signIn(who: typeof alice) {
        const ch = (await call('POST', '/api/v1/auth/challenge', {})).body;
        const proof = who.sign({ message: ch.message, nonce: ch.nonce, recipient: ch.recipient });
        return (await call('POST', '/api/v1/auth/verify', { network: 'testnet', proof })).body;
      },
    };
  }

  test("one person's work is theirs alone: reads, writes and search", async () => {
    const a = browser();
    const b = browser();
    const me = await a.signIn(alice);
    expect(me.person_id).toMatch(/^prs_/);
    expect((await b.signIn(bob)).person_id).not.toBe(me.person_id);

    const x = (await a.call('POST', '/api/v1/explorations', { question: 'Who holds the cafés?' }))
      .body.exploration as string;
    expect(
      (await a.call('POST', `/api/v1/explorations/${x}/notes`, { text: 'the first café' })).status,
    ).toBe(200);
    const follow = (await a.call('POST', '/api/v1/follows', { ref: 'near:mainnet:validator.near' }))
      .body.follow.id as string;
    const note = (
      await a.call('POST', '/api/v1/notes', {
        about: `conversation:${x}`,
        text: 'cafézinho secreto',
      })
    ).body.note.id as string;

    // the owner sees it all, and finds it, accents folded
    expect((await a.call('GET', `/api/v1/explorations/${x}`)).status).toBe(200);
    expect((await a.call('GET', '/api/v1/follows')).body.follows).toHaveLength(1);
    expect((await a.call('GET', '/api/v1/notes')).body.notes).toHaveLength(1);
    const found = (await a.call('GET', '/api/v1/search?q=cafezinho')).body.results as Out[];
    expect(found.map((r) => r.kind)).toContain('note');

    // the other person reads nothing of it, changes nothing, and finds nothing
    expect((await b.call('GET', `/api/v1/explorations/${x}`)).status).toBe(404);
    expect((await b.call('GET', `/api/v1/conversations/${x}`)).status).toBe(404);
    expect(
      (await b.call('POST', `/api/v1/explorations/${x}/notes`, { text: 'mine now' })).status,
    ).toBe(404);
    expect((await b.call('PATCH', `/api/v1/notes/${note}`, { text: 'changed' })).status).toBe(404);
    expect((await b.call('DELETE', `/api/v1/follows/${follow}`)).status).toBe(404);
    expect((await b.call('GET', '/api/v1/follows')).body.follows).toEqual([]);
    expect((await b.call('GET', '/api/v1/notes')).body.notes).toEqual([]);
    expect((await b.call('GET', '/api/v1/search?q=cafezinho')).body.results).toEqual([]);
    expect((await b.call('GET', '/api/v1/search?q=cafe')).body.results).toEqual([]);

    // and nothing of the owner's moved
    expect((await a.call('GET', `/api/v1/explorations/${x}`)).body.notes).toHaveLength(1);
    expect((await a.call('GET', '/api/v1/notes')).body.notes[0].text).toBe('cafézinho secreto');
  });

  test('signing in again with the same wallet reaches the same person, and its wallets', async () => {
    const first = await browser().signIn(alice);
    const again = await browser().signIn(alice);
    expect(again.person_id).toBe(first.person_id);
    expect(again.wallets.map((w: Out) => w.account_id)).toEqual([alice.accountId]);
  });

  test('each action keeps the credential that authorised it: the wallet, or the link', async () => {
    const a = browser();
    await a.signIn(alice);
    const x = (await a.call('POST', '/api/v1/explorations', { question: 'Whose is it?' })).body
      .exploration as string;
    await a.call('POST', `/api/v1/explorations/${x}/notes`, { text: 'by the wallet' });
    await a.call('POST', '/api/v1/follows', { ref: 'near:mainnet:other.near' });
    // an agent with no session starts one, and writes by its continue link
    const anon = browser();
    const started = (await anon.call('POST', '/api/v1/explorations', { question: 'From an agent' }))
      .body;
    const ref = encodeURIComponent(started.link.url as string);
    await anon.call('POST', `/api/v1/explorations/${ref}/notes`, { text: 'by the link' });

    const store = stateStore(stateDir, () => {}, databaseUrl);
    const [byWallet] = await store.note.list(x);
    expect(byWallet?.credential).toMatch(/^wallet:[0-9a-f]{64}$/);
    expect((await store.exploration.get(x))?.credential).toBe(byWallet?.credential);
    const follows = await store.follow.list((await store.exploration.get(x))?.owner as string, 10);
    expect(follows.find((f) => f.ref === 'near:mainnet:other.near')?.credential).toBe(
      byWallet?.credential,
    );
    const [byLink] = await store.note.list(started.exploration);
    expect(byLink?.credential).toBe(`link:${started.link.id}`);
    // nothing about the wallet itself is in the credential: only the binding's keyed hash
    expect(byWallet?.credential).not.toContain(alice.accountId);
  });
});
