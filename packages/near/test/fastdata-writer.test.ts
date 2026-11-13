import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson } from '@petal/core';
import { beforeEach, describe, expect, test } from 'vitest';
import type { AccessKeyPermission } from '../src/auth/index.ts';
import { functionCall } from '../src/auth/testing.ts';
import {
  checkWriterPermission,
  FASTDATA_GAS,
  fastDataWriter,
  isExpectedFailure,
  loadWriterKey,
} from '../src/map/fastdata-writer.ts';
import { type FakeChain, fakeChain, seededKey } from './helpers/fake-chain.ts';
import { type FakeFastData, fakeFastData } from './helpers/fake-fastdata.ts';

const WRITER = 'petals-writer.testnet';
const RECEIVER = 'petals.testnet';
const key = seededKey('writer');

let dir: string;
let kv: FakeFastData;
let chain: FakeChain;
let sleeps: number;

async function keyFile(content: unknown, name = 'writer.json'): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
}
const goodKeyFile = () =>
  keyFile({ account_id: WRITER, public_key: key.publicKey, private_key: key.secretKey });

function setup(permission: AccessKeyPermission = functionCall(RECEIVER)) {
  kv = fakeFastData();
  chain = fakeChain({ [WRITER]: { [key.publicKey]: permission } }, kv);
  sleeps = 0;
}

async function writer(opts: { keyFile?: string; onSleep?: () => void; timeoutMs?: number } = {}) {
  return fastDataWriter(
    {
      network: 'testnet',
      receiver: RECEIVER,
      writer: WRITER,
      keyFile: opts.keyFile ?? (await goodKeyFile()),
    },
    {
      provider: chain.provider,
      kv: { fetch: kv.fetch, apiKey: '' },
      confirmTimeoutMs: opts.timeoutMs ?? 3_000,
      pollMs: 1_000,
      sleep: async () => {
        sleeps++;
        opts.onSleep?.();
      },
    },
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'petal-w3-writer-'));
  setup();
});

describe('fastDataWriter: one __fastdata_kv call', () => {
  test('1 Ggas, deposit 0, one action, canonical JSON args, to the receiver, signed by the writer', async () => {
    const w = await writer();
    const entries = { 'petal/v1/spec/b': { z: 1, a: [2, 1] }, 'petal/v1/spec/a': null };
    const tx = await w.write(entries);
    expect(chain.sent).toHaveLength(1);
    const sent = chain.sent[0];
    expect(sent).toMatchObject({
      signer: WRITER,
      publicKey: key.publicKey,
      receiver: RECEIVER,
      method: '__fastdata_kv',
      gas: 1_000_000_000n,
      deposit: 0n,
      actions: 1,
      tx_hash: tx.tx_hash,
    });
    expect(FASTDATA_GAS).toBe(1_000_000_000n);
    expect(sent?.args).toBe(canonicalJson(entries));
  });

  test('the no-contract receipt failure counts as success; the block comes from FastData', async () => {
    const w = await writer();
    const tx = await w.write({ 'petal/v1/spec/x': { v: 1 } });
    const history = kv.requests.filter((r) => r.path.startsWith('/v0/history/'));
    expect(history[0]?.path).toBe(`/v0/history/${RECEIVER}/${WRITER}`);
    expect(history[0]?.body).toMatchObject({ key: 'petal/v1/spec/x', include_metadata: true });
    expect(tx.block_height).toBeGreaterThan(230_000_000);
    expect(sleeps).toBe(0); // indexed at once by the fake, so no wait
  });

  test('a receiver that does not exist is also expected, and so is MethodNotFound', async () => {
    chain.mode = 'no-account';
    const tx = await (await writer()).write({ 'petal/v1/spec/x': 1 });
    expect(tx.tx_hash).toBe(chain.sent[0]?.tx_hash);
    expect(
      isExpectedFailure({
        ActionError: { kind: { FunctionCallError: { MethodResolveError: 'MethodNotFound' } } },
      }),
    ).toBe(true);
    expect(isExpectedFailure({ InvalidTxError: { NotEnoughAllowance: {} } })).toBe(false);
  });

  test('any other failure is an error, with the tx hash, and is not retried', async () => {
    chain.mode = 'other-failure';
    const w = await writer();
    const err = await w.write({ 'petal/v1/spec/x': 1 }).catch((e) => e);
    expect(err).toMatchObject({ code: 'source_failed', tx_hash: chain.sent[0]?.tx_hash });
    expect(chain.sent).toHaveLength(1);
    expect(kv.requests).toHaveLength(0);
  });

  test('RPC down: source_failed, nothing polled', async () => {
    chain.mode = 'rpc-down';
    await expect((await writer()).write({ 'petal/v1/spec/x': 1 })).rejects.toMatchObject({
      code: 'source_failed',
    });
    expect(kv.requests).toHaveLength(0);
  });

  test('polls the KV history until its own transaction shows (FastData lags)', async () => {
    chain.mode = 'not-indexed';
    const w = await writer({
      // FastData shows the call only after the second wait
      onSleep: () => {
        if (sleeps !== 2) return;
        kv.index({
          receiver: RECEIVER,
          writer: WRITER,
          signer: WRITER,
          tx_hash: chain.sent[0]?.tx_hash ?? '',
          receipt_id: 'r',
          block_height: 230_000_123,
          block_timestamp: 1,
          entries: { 'petal/v1/spec/x': 1 },
        });
      },
    });
    const tx = await w.write({ 'petal/v1/spec/x': 1 });
    expect(tx).toEqual({ tx_hash: chain.sent[0]?.tx_hash, block_height: 230_000_123 });
    expect(sleeps).toBe(2);
  });

  test('gives up after the confirm window: source_failed with the tx hash, which may still land', async () => {
    chain.mode = 'not-indexed';
    const err = await (await writer({ timeoutMs: 3_000 }))
      .write({ 'petal/v1/spec/x': 1 })
      .catch((e) => e);
    expect(err).toMatchObject({ code: 'source_failed', tx_hash: chain.sent[0]?.tx_hash });
    expect(err.message).toMatch(/did not show it within 3 s/);
    expect(kv.requests.length).toBe(4); // 0, 1, 2, 3 s
    expect(sleeps).toBe(3);
  });

  test('writes in a row use increasing nonces from one key', async () => {
    const w = await writer();
    await w.write({ 'petal/v1/spec/a': 1 });
    await w.write({ 'petal/v1/spec/b': 2 });
    expect(chain.sent.map((s) => s.nonce)).toEqual([101n, 102n]);
    expect(chain.keyViews).toBe(2); // the permission check, then near-api-js's nonce lookup
  });
});

describe('fastDataWriter refuses before sending', () => {
  test('writes FastData would drop silently: no key read, no transaction', async () => {
    const w = await writer({ keyFile: join(dir, 'missing.json') });
    const many = Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`petal/v1/t/${i}`, i]));
    await expect(w.write(many)).rejects.toThrow(/at most 256/);
    await expect(w.write({ 'petal/v1/t/big': 'x'.repeat(256 * 1024) })).rejects.toThrow(/value/);
    await expect(w.write({ 'other/key': 1 })).rejects.toThrow(/outside/);
    const huge = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [`petal/v1/t/${i}`, 'x'.repeat(250 * 1024)]),
    );
    await expect(w.write(huge)).rejects.toThrow(/1.5 MiB/);
    expect(chain.sent).toHaveLength(0);
    expect(chain.keyViews).toBe(0);
  });

  test('a full-access key: Petal holds only a function-call key', async () => {
    setup('FullAccess');
    const err = await (await writer()).write({ 'petal/v1/spec/x': 1 }).catch((e) => e);
    expect(err).toMatchObject({ code: 'internal' });
    expect(err.message).toMatch(/full-access/);
    expect(chain.sent).toHaveLength(0);
  });

  test('a failed key check is tried again on the next write', async () => {
    const keys: Record<string, Record<string, AccessKeyPermission>> = {
      [WRITER]: { [key.publicKey]: 'FullAccess' },
    };
    kv = fakeFastData();
    chain = fakeChain(keys, kv);
    const w = await writer();
    await expect(w.write({ 'petal/v1/spec/x': 1 })).rejects.toMatchObject({ code: 'internal' });
    (keys[WRITER] as Record<string, AccessKeyPermission>)[key.publicKey] = functionCall(RECEIVER);
    await expect(w.write({ 'petal/v1/spec/x': 1 })).resolves.toMatchObject({
      tx_hash: expect.any(String),
    });
    expect(chain.sent).toHaveLength(1);
  });

  test('a function-call key for another receiver or other methods', () => {
    expect(checkWriterPermission(functionCall(RECEIVER), RECEIVER)).toBeNull();
    expect(checkWriterPermission(functionCall('other.testnet'), RECEIVER)).toMatch(/limited to/);
    expect(checkWriterPermission(functionCall(RECEIVER, []), RECEIVER)).toMatch(/exactly/);
    expect(checkWriterPermission(functionCall(RECEIVER, ['__fastdata_kv', 'x']), RECEIVER)).toMatch(
      /exactly/,
    );
    expect(checkWriterPermission('FullAccess', RECEIVER)).toMatch(/full-access/);
  });

  test('a key that is not on the writer account', async () => {
    chain = fakeChain({}, kv);
    await expect((await writer()).write({ 'petal/v1/spec/x': 1 })).rejects.toMatchObject({
      code: 'internal',
      message: expect.stringMatching(/is not a key of petals-writer.testnet/),
    });
  });

  test('mainnet is refused (writes there need the operator’s OK)', () => {
    expect(() =>
      fastDataWriter({
        network: 'mainnet' as 'testnet',
        receiver: 'petals.near',
        writer: 'writer.petals.near',
        keyFile: '/nowhere',
      }),
    ).toThrow(/testnet only/);
  });
});

describe('loadWriterKey', () => {
  test('reads the near-cli key file and checks account and public key', async () => {
    const k = await loadWriterKey(await goodKeyFile(), WRITER);
    expect(k.publicKey).toBe(key.publicKey);
    // secret_key is accepted too; account_id and public_key are optional
    const bare = await keyFile({ secret_key: key.secretKey }, 'bare.json');
    expect((await loadWriterKey(bare, WRITER)).publicKey).toBe(key.publicKey);
  });

  test('refuses a wrong account, a wrong public key, no key, not JSON; never echoes the key', async () => {
    const other = seededKey('other');
    const cases = [
      { account_id: 'someone.testnet', private_key: key.secretKey },
      { account_id: WRITER, public_key: other.publicKey, private_key: key.secretKey },
      { account_id: WRITER },
      { account_id: WRITER, private_key: 'ed25519:notakey' },
      'not json',
    ];
    for (const [i, c] of cases.entries()) {
      const err = await loadWriterKey(await keyFile(c, `bad-${i}.json`), WRITER).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(String(err.message)).not.toContain(key.secretKey.slice(8, 30));
    }
    await expect(loadWriterKey(join(dir, 'missing.json'), WRITER)).rejects.toThrow(/ENOENT/);
  });
});
