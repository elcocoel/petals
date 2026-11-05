import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson } from '@petal/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { functionCall } from '../src/auth/testing.ts';
import { type KvRow, toMapRow, toMillis } from '../src/map/fastdata-kv.ts';
import { fastDataReader } from '../src/map/fastdata-reader.ts';
import { fastDataWriter } from '../src/map/fastdata-writer.ts';
import { fakeChain, seededKey } from './helpers/fake-chain.ts';
import { fakeFastData } from './helpers/fake-fastdata.ts';
import { recording, replay } from './helpers/recorded.ts';
import { mapSuite } from './map-suite.ts';

const mainnetSocial = (f: typeof fetch, pageSize?: number) =>
  fastDataReader(
    { network: 'mainnet', receiver: 'social' },
    { fetch: f, apiKey: '', ...(pageSize ? { pageSize } : {}) },
  );

describe('fastDataReader on recorded FastData responses (2026-11-04)', () => {
  test('get reads one key with its writer, receiver, transaction and time', async () => {
    const f = replay(['fastdata/main-latest-key.json']);
    const row = await mainnetSocial(f).get('profile/name', 'mob.near');
    const raw = (recording('fastdata/main-latest-key.json').response.body as { entries: KvRow[] })
      .entries[0] as KvRow;
    expect(row).toEqual({
      key: 'profile/name',
      value: raw.value,
      writer: 'mob.near',
      receiver: 'social',
      tx_hash: raw.tx_hash,
      block_height: raw.block_height,
      block_timestamp: Math.floor(raw.block_timestamp / 1e6),
    });
    // FastData times are nanoseconds; MapRow times are milliseconds (a date in 2026)
    expect(new Date(row?.block_timestamp ?? 0).getUTCFullYear()).toBe(2026);
  });

  test('get of a key never written is null', async () => {
    const f = replay(['fastdata/main-latest-key-missing.json']);
    expect(await mainnetSocial(f).get('petal/v1/spec/000000000000000000000000', 'mob.near')).toBe(
      null,
    );
  });

  test('latest follows page_token across pages and stops at the limit', async () => {
    const f = replay([
      'fastdata/main-latest-prefix-page1.json',
      'fastdata/main-latest-prefix-page2.json',
    ]);
    const rows = await mainnetSocial(f, 2).latest('profile/', { writers: ['mob.near'], limit: 4 });
    expect(rows.map((r) => r.key)).toEqual([
      'profile/about',
      'profile/avatar',
      'profile/banner',
      'profile/links/github',
    ]);
    expect(f.calls).toHaveLength(2);
    const page1 = recording('fastdata/main-latest-prefix-page1.json').response.body as {
      page_token: string;
    };
    expect(f.calls[1]?.body).toMatchObject({ page_token: page1.page_token });
    for (const r of rows) expect(r).toMatchObject({ writer: 'mob.near', receiver: 'social' });
  });

  test("the gallery read of Petal's empty testnet map: one call, no rows", async () => {
    const f = replay(['fastdata/test-latest-petals-empty.json']);
    const reader = fastDataReader(
      { network: 'testnet', receiver: 'petals.testnet' },
      { fetch: f, apiKey: '' },
    );
    expect(await reader.latest('petal/v1/spec/', { writers: ['petals-writer.testnet'] })).toEqual(
      [],
    );
    expect(f.calls).toHaveLength(1);
  });

  test('values are handed back re-canonicalised; hashing uses canonical JSON, not wire bytes', () => {
    const row = toMapRow({
      predecessor_id: 'w',
      current_account_id: 'r',
      block_height: 1,
      block_timestamp: 1_790_730_707_115_975_400,
      key: 'petal/v1/spec/x',
      value: { b: 1.0, a: { d: [1, 2], c: 'x' } },
      tx_hash: 't',
    });
    expect(JSON.stringify(row?.value)).toBe('{"a":{"c":"x","d":[1,2]},"b":1}');
    expect(canonicalJson(row?.value)).toBe(JSON.stringify(row?.value));
    expect(toMillis(1_790_730_707_115_975_400)).toBe(1_790_730_707_115);
    expect(toMillis(1_790_730_707_115)).toBe(1_790_730_707_115);
  });

  test('tombstones and rows without metadata are not rows', () => {
    const base = {
      predecessor_id: 'w',
      current_account_id: 'r',
      block_height: 1,
      block_timestamp: 1,
    };
    expect(toMapRow({ ...base, key: 'k', value: null, tx_hash: 't' })).toBeNull();
    expect(toMapRow({ ...base, key: 'k', value: 1 })).toBeNull();
  });
});

describe('fastDataReader requests', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('sends FASTNEAR_API_KEY as a Bearer token only when it is set', async () => {
    const kv = fakeFastData('https://kv.test.fastnear.com');
    const cfg = { network: 'testnet', receiver: 'petals.testnet' } as const;
    vi.stubEnv('FASTNEAR_API_KEY', '');
    await fastDataReader(cfg, { fetch: kv.fetch }).get('petal/v1/spec/x', 'w.testnet');
    vi.stubEnv('FASTNEAR_API_KEY', 'test-key-not-a-secret');
    await fastDataReader(cfg, { fetch: kv.fetch }).get('petal/v1/spec/x', 'w.testnet');
    expect(kv.requests[0]?.headers.get('authorization')).toBeNull();
    expect(kv.requests[1]?.headers.get('authorization')).toBe('Bearer test-key-not-a-secret');
  });

  test('one call per trusted writer; no writers means nothing is trusted', async () => {
    const kv = fakeFastData();
    const reader = fastDataReader(
      { network: 'testnet', receiver: 'petals.testnet' },
      { fetch: kv.fetch, apiKey: '' },
    );
    await reader.latest('petal/v1/spec/', { writers: ['a.testnet', 'b.testnet', 'a.testnet'] });
    expect(kv.requests.map((r) => r.path)).toEqual([
      '/v0/latest/petals.testnet/a.testnet',
      '/v0/latest/petals.testnet/b.testnet',
    ]);
    expect(await reader.latest('petal/v1/spec/', { writers: [] })).toEqual([]);
    expect(kv.requests).toHaveLength(2);
  });

  test('errors carry a tools.md code: rate_limited on 429, source_failed otherwise', async () => {
    const kv = fakeFastData();
    const reader = fastDataReader(
      { network: 'testnet', receiver: 'petals.testnet' },
      { fetch: kv.fetch, apiKey: '' },
    );
    kv.failNext(1, 429);
    await expect(reader.get('petal/v1/x', 'w')).rejects.toMatchObject({ code: 'rate_limited' });
    kv.failNext(1, 503);
    await expect(reader.latest('petal/v1/', { writers: ['w'] })).rejects.toMatchObject({
      code: 'source_failed',
    });
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(
      fastDataReader({ network: 'testnet', receiver: 'r' }, { fetch: down }).get('k', 'w'),
    ).rejects.toMatchObject({ code: 'source_failed' });
  });
});

describe('the fake FastData answers in the recorded shapes', () => {
  const fieldsOf = (name: string) =>
    Object.keys((recording(name).response.body as { entries: KvRow[] }).entries[0] ?? {}).sort();

  test('rows with and without metadata, page tokens, history', async () => {
    const kv = fakeFastData('https://kv.main.fastnear.com');
    kv.index({
      receiver: 'social',
      writer: 'mob.near',
      signer: 'mob.near',
      tx_hash: 'tx1',
      receipt_id: 'r1',
      block_height: 1,
      block_timestamp: 1,
      entries: { 'profile/a': 1, 'profile/b': 2, 'profile/c': 3, 'profile/name': 'x' },
    });
    const post = async (path: string, body: object) =>
      (await (
        await kv.fetch(`https://kv.main.fastnear.com${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
        })
      ).json()) as { entries: KvRow[]; page_token?: string };
    const latest = await post('/v0/latest/social/mob.near', {
      key_prefix: 'profile/',
      limit: 2,
      include_metadata: true,
    });
    expect(Object.keys(latest.entries[0] ?? {}).sort()).toEqual(
      fieldsOf('fastdata/main-latest-prefix-page1.json'),
    );
    expect(typeof latest.page_token).toBe('string');
    const history = await post('/v0/history/social/mob.near', {
      key: 'profile/name',
      include_metadata: true,
    });
    expect(Object.keys(history.entries[0] ?? {}).sort()).toEqual(
      fieldsOf('fastdata/main-history-key.json'),
    );
    const get = (await (
      await kv.fetch('https://kv.main.fastnear.com/v0/latest/social/mob.near/profile%2Fname')
    ).json()) as { entries: KvRow[] };
    expect(Object.keys(get.entries[0] ?? {}).sort()).toEqual(
      fieldsOf('fastdata/main-latest-key-get.json'),
    );
    const missing = await post('/v0/latest/social/mob.near', {
      key: 'nope',
      include_metadata: true,
    });
    expect(missing).toEqual(recording('fastdata/main-latest-key-missing.json').response.body);
  });
});

// The FastData client (writer + reader) passes the same suite as fakeMap(), on a fake chain that
// checks every signed transaction and a fake KV server that answers in the recorded shapes.
mapSuite('fastDataReader + fastDataWriter (fake chain, fake KV)', async () => {
  const kv = fakeFastData();
  const petal = seededKey('writer');
  const someone = seededKey('someone');
  const chain = fakeChain(
    {
      'petals-writer.testnet': { [petal.publicKey]: functionCall('petals.testnet') },
      'someone.testnet': { [someone.publicKey]: functionCall('petals.testnet') },
    },
    kv,
  );
  const dir = await mkdtemp(join(tmpdir(), 'petal-w3-'));
  const keyFile = async (account: string, k: typeof petal) => {
    const path = join(dir, `${account}.json`);
    await writeFile(
      path,
      JSON.stringify({ account_id: account, public_key: k.publicKey, private_key: k.secretKey }),
    );
    return path;
  };
  const deps = {
    provider: chain.provider,
    kv: { fetch: kv.fetch, apiKey: '' },
    sleep: async () => {},
  };
  const writerFor = async (account: string, k: typeof petal) =>
    fastDataWriter(
      {
        network: 'testnet',
        receiver: 'petals.testnet',
        writer: account,
        keyFile: await keyFile(account, k),
      },
      deps,
    );
  return {
    writer: await writerFor('petals-writer.testnet', petal),
    reader: fastDataReader(
      { network: 'testnet', receiver: 'petals.testnet' },
      { fetch: kv.fetch, apiKey: '' },
    ),
    writerAccount: 'petals-writer.testnet',
    receiver: 'petals.testnet',
    other: { writer: await writerFor('someone.testnet', someone), account: 'someone.testnet' },
  };
});
