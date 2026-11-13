// T045: configFromEnv and createContext, on the real packages: making a context never throws
// (parts are built on first use), and each configuration wires the parts it promises.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeRpcFor, testSigner } from '@petal/near/auth/testing';
import { describe, expect, test } from 'vitest';
import { configFromEnv, createContext, deferred } from '../src/context.ts';
import { callTool } from '../src/registry.ts';
import { jsonRpc } from '../src/rpc.ts';
import { flow, REPO } from './helpers.ts';

describe('configFromEnv', () => {
  test('no variables: fake map and mirror, no live, no fake, $3 a day', () => {
    expect(configFromEnv({}, '/repo')).toEqual({
      root: '/repo',
      map: null,
      llmDailyUsd: 3,
      live: false,
      fake: false,
    });
  });

  test('the env list of quickstart.md', () => {
    const cfg = configFromEnv(
      {
        NEAR_AI_API_KEY: 'k',
        PETAL_LLM_DAILY_USD: '2.5',
        PETAL_MAP_NETWORK: 'testnet',
        PETAL_MAP_RECEIVER: 'petals.testnet',
        PETAL_WRITER_ACCOUNT: 'petals-writer.testnet',
        PETAL_WRITER_KEY_FILE: '/path/to/keys/petal-writer.testnet.json',
        PETAL_TRUSTED_WRITERS: 'petals-writer.testnet, other.testnet',
        FASTNEAR_API_KEY: 'f',
        PETAL_PAYOUT_ACCOUNT: 'petal-demo.near',
        PETAL_API: 'http://localhost:3000/',
        PETAL_REPO_URL: 'https://github.com/x/petal',
        PETAL_LIVE: '1',
      },
      '/repo',
    );
    expect(cfg).toMatchObject({
      nearAiApiKey: 'k',
      llmDailyUsd: 2.5,
      map: {
        network: 'testnet',
        receiver: 'petals.testnet',
        writer: 'petals-writer.testnet',
        keyFile: '/path/to/keys/petal-writer.testnet.json',
        trustedWriters: ['petals-writer.testnet', 'other.testnet'],
      },
      fastnearApiKey: 'f',
      payoutAccount: 'petal-demo.near',
      apiBase: 'http://localhost:3000',
      repoUrl: 'https://github.com/x/petal',
      live: true,
      fake: false,
    });
  });

  test('PETAL_MAP_NETWORK alone gives the testnet defaults; PETAL_FAKE=1 is fake mode', () => {
    expect(configFromEnv({ PETAL_MAP_NETWORK: 'testnet' }, '/r').map).toEqual({
      network: 'testnet',
      receiver: 'petals.testnet',
      writer: 'petals-writer.testnet',
      trustedWriters: ['petals-writer.testnet'],
    });
    expect(configFromEnv({ PETAL_FAKE: '1' }, '/r').fake).toBe(true);
    // a key file alone must never fall back to the fake map without saying so
    expect(configFromEnv({ PETAL_WRITER_KEY_FILE: 'k.json' }, '/r').map).toEqual({
      network: 'testnet',
      receiver: 'petals.testnet',
      writer: 'petals-writer.testnet',
      keyFile: 'k.json',
      trustedWriters: ['petals-writer.testnet'],
    });
    expect(configFromEnv({ PETAL_WRITER_ACCOUNT: 'w.testnet' }, '/r').map).toMatchObject({
      writer: 'w.testnet',
      trustedWriters: ['w.testnet'],
    });
  });
});

describe('createContext', () => {
  const stateDir = () => mkdtempSync(join(tmpdir(), 'petal-ctx-'));

  test('fake mode: the fake map, the recorded dry quote, RPC off; making it never throws', async () => {
    const ctx = createContext({ root: REPO, stateDir: stateDir(), fake: true });
    expect(ctx.map.receiver).toBe('petals.testnet');
    expect(ctx.map.trustedWriters).toEqual(['petals-writer.testnet']);
    const w = await ctx.map.writer?.write({ 'petal/v1/spec/x': { a: 1 } });
    expect(w?.tx_hash).toMatch(/^fake/);
    expect((await ctx.map.reader.get('petal/v1/spec/x', 'petals-writer.testnet'))?.value).toEqual({
      a: 1,
    });
    expect(await ctx.quote({ purpose: 'sponsor_refresh' })).toMatchObject({ dry: true });
    await expect(ctx.rpc.query({ request_type: 'view_access_key' })).rejects.toMatchObject({
      code: 'source_failed',
    });
    expect(ctx.config.fixturesDir).toBe(join(REPO, 'fixtures'));
  });

  test('every tool answers with tools_version on a fresh context, built or not', async () => {
    const ctx = createContext({ root: REPO, stateDir: stateDir(), fake: true });
    const out = (await callTool('get_snapshot', { network: 'near-validators' }, ctx)) as Record<
      string,
      unknown
    >;
    expect(out.tools_version).toBe('tools/v2');
    const nets = (await callTool('list_networks', {}, ctx)) as { networks: unknown[] };
    expect(Array.isArray(nets.networks)).toBe(true);
  });

  test('local dev (no map configured): a publish lands in the fake map and in .petal/mirror', async () => {
    const dir = stateDir();
    const signer = testSigner('maker.testnet');
    const ctx = { ...createContext({ root: REPO, stateDir: dir }), rpc: fakeRpcFor([signer]) };
    const run = async (name: string, input: unknown) =>
      (await callTool(name, input, ctx)) as Record<string, unknown>;
    const f = await flow(run);
    const prep = await run('prepare_publish', { entry: f.draft });
    const proof = signer.sign({
      message: prep.message as string,
      nonce: prep.nonce as string,
      recipient: prep.recipient as string,
    });
    const pub = await run('publish_flower', { entry_sha256: prep.entry_sha256, proof });
    expect(pub).toMatchObject({ key: `petal/v1/spec/${pub.id}`, writer: 'petals-writer.testnet' });
    const records = readdirSync(join(dir, 'mirror')).filter((n) => n.endsWith('.json'));
    expect(records).toHaveLength(1);
    const rec = JSON.parse(readFileSync(join(dir, 'mirror', records[0] as string), 'utf8'));
    expect(rec).toMatchObject({ status: 'written', tx_hash: pub.tx_hash });
    expect(Object.keys(rec.entries)).toEqual([pub.key]);
    const got = await run('get_flower', { id: pub.id });
    expect(got.verified).toEqual({
      entry_hash: true,
      maker_signature: true,
      model_signature: 'absent',
    });
  });

  test('a configured map gets a writer only with a key file, on testnet or mainnet', () => {
    const base = { network: 'testnet' as const, receiver: 'petals.testnet', trustedWriters: [] };
    const withKey = createContext({
      root: REPO,
      map: { ...base, writer: 'petals-writer.testnet', keyFile: '/nowhere/key.json' },
    });
    expect(withKey.map.writer).not.toBeNull();
    expect(withKey.map.trustedWriters).toEqual(['petals-writer.testnet']);
    expect(
      createContext({ root: REPO, map: { ...base, writer: 'w.testnet' } }).map.writer,
    ).toBeNull();
    const mainnet = createContext({
      root: REPO,
      map: {
        network: 'mainnet',
        receiver: 'petals.near',
        writer: 'petals-writer.near',
        keyFile: '/k',
        trustedWriters: ['petals-writer.near'],
      },
    });
    expect(mainnet.map.writer).not.toBeNull();
    expect(mainnet.map.receiver).toBe('petals.near');
    expect(mainnet.map.trustedWriters).toEqual(['petals-writer.near']);
  });

  test('deferred builds on first use and binds methods', () => {
    let made = 0;
    const d = deferred(() => {
      made += 1;
      return {
        n: 2,
        twice(x: number) {
          return x * this.n;
        },
      };
    });
    expect(made).toBe(0);
    expect(d.twice(3)).toBe(6);
    expect(d.twice(4)).toBe(8);
    expect(made).toBe(1);
  });
});

describe('jsonRpc', () => {
  const fakeFetch = (reply: unknown, status = 200, seen: RequestInit[] = []) =>
    (async (_url: string, init: RequestInit) => {
      seen.push(init);
      return new Response(JSON.stringify(reply), { status });
    }) as unknown as typeof fetch;

  test('returns the result; sends the FastNEAR key only when set', async () => {
    const seen: RequestInit[] = [];
    const rpc = jsonRpc('https://rpc.test', {
      apiKey: 'f',
      fetch: fakeFetch({ result: { permission: 'FullAccess' } }, 200, seen),
    });
    expect(await rpc.query({ request_type: 'view_access_key', finality: 'final' })).toEqual({
      permission: 'FullAccess',
    });
    expect(((seen[0]?.headers ?? {}) as Record<string, string>).authorization).toBe('Bearer f');
    const body = JSON.parse(String(seen[0]?.body));
    expect(body).toMatchObject({ method: 'query', params: { request_type: 'view_access_key' } });
    const seen2: RequestInit[] = [];
    await jsonRpc('https://rpc.test', { fetch: fakeFetch({ result: {} }, 200, seen2) }).query({
      request_type: 'x',
    });
    expect(((seen2[0]?.headers ?? {}) as Record<string, string>).authorization).toBeUndefined();
  });

  test('a missing key throws AccessKeyDoesNotExist, like near-api-js', async () => {
    const modern = jsonRpc('https://rpc.test', {
      fetch: fakeFetch({
        error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCESS_KEY' }, data: 'no key' },
      }),
    });
    await expect(modern.query({ request_type: 'view_access_key' })).rejects.toMatchObject({
      type: 'AccessKeyDoesNotExist',
    });
    const old = jsonRpc('https://rpc.test', {
      fetch: fakeFetch({ result: { error: 'access key ed25519:x does not exist while viewing' } }),
    });
    await expect(old.query({ request_type: 'view_access_key' })).rejects.toMatchObject({
      type: 'AccessKeyDoesNotExist',
    });
    const down = jsonRpc('https://rpc.test', { fetch: fakeFetch({}, 503) });
    await expect(down.query({ request_type: 'view_access_key' })).rejects.toThrow(/503/);
  });
});
