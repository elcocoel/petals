// T044: the testnet smoke test. Runs only with PETAL_LIVE=1, and only once Elco has created the
// accounts and given the one-time OK to sign testnet transactions with the writer key (T043).
// It signs ONE testnet transaction (a __fastdata_kv call of about 0.0001 NEAR of gas, from the
// writer's function-call allowance). Nothing on mainnet, no deposit.
//
//   PETAL_LIVE=1 PETAL_WRITER_KEY_FILE=../.secrets/petal-writer.testnet.json \
//     pnpm vitest run --project near test/testnet.smoke.test.ts
//
// Optional: PETAL_MAP_RECEIVER (petals.testnet), PETAL_WRITER_ACCOUNT (petals-writer.testnet),
// FASTNEAR_API_KEY. The key goes under petal/v1/test/, which no gallery reads.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { canonicalJson, sha256Hex } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { fastDataReader } from '../src/map/fastdata-reader.ts';
import { fastDataWriter } from '../src/map/fastdata-writer.ts';
import { mirror } from '../src/map/mirror.ts';
import { explorerTxUrl } from '../src/network.ts';

const LIVE = process.env.PETAL_LIVE === '1';
const receiver = process.env.PETAL_MAP_RECEIVER ?? 'petals.testnet';
const writerAccount = process.env.PETAL_WRITER_ACCOUNT ?? 'petals-writer.testnet';
const keyFile = process.env.PETAL_WRITER_KEY_FILE;

describe.skipIf(!LIVE)('testnet smoke (PETAL_LIVE=1): the shared map on FastData', () => {
  test('write one entry, read it back by key and by prefix, compare hashes, check the mirror', async () => {
    if (!keyFile) throw new Error('set PETAL_WRITER_KEY_FILE (the writer key, outside the repo)');
    const run = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = `petal/v1/test/smoke/${run}/`;
    const key = `${prefix}entry`;
    const value = {
      petal: 'smoke/v1',
      note: 'Petal W3 testnet smoke test (T044)',
      written_at: new Date().toISOString(),
      nested: { b: [1, 2, 3], a: 'x' },
    };

    const dir = await mkdtemp(join(tmpdir(), 'petal-smoke-mirror-'));
    const inner = fastDataWriter({
      network: 'testnet',
      receiver,
      writer: writerAccount,
      keyFile: resolve(keyFile),
    });
    const m = mirror(dir, inner);
    const tx = await m.write({ [key]: value }); // returns once FastData shows the row
    console.log(`smoke: ${explorerTxUrl('testnet', tx.tx_hash)} block ${tx.block_height}`);

    const reader = fastDataReader({ network: 'testnet', receiver });
    const byKey = await reader.get(key, writerAccount);
    expect(byKey).toMatchObject({ key, writer: writerAccount, receiver, tx_hash: tx.tx_hash });
    const byPrefix = await reader.latest(prefix, { writers: [writerAccount] });
    expect(byPrefix.map((r) => r.key)).toEqual([key]);

    const sent = sha256Hex(canonicalJson(value));
    expect(sha256Hex(canonicalJson(byKey?.value))).toBe(sent);
    expect(sha256Hex(canonicalJson(byPrefix[0]?.value))).toBe(sent);

    const [rec] = await m.records();
    expect(rec).toMatchObject({ status: 'written', tx_hash: tx.tx_hash });
    expect(sha256Hex(canonicalJson(rec?.entries[key]))).toBe(sent);
  }, 90_000);
});
