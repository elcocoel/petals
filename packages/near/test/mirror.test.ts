import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson } from '@petal/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { functionCall } from '../src/auth/testing.ts';
import { NearError } from '../src/errors.ts';
import { fakeMap } from '../src/map/fake.ts';
import { fastDataReader } from '../src/map/fastdata-reader.ts';
import { fastDataWriter } from '../src/map/fastdata-writer.ts';
import type { MapWriter } from '../src/map/index.ts';
import { type MirrorRecord, mirror, mirrorReader } from '../src/map/mirror.ts';
import { fakeChain, seededKey } from './helpers/fake-chain.ts';
import { fakeFastData } from './helpers/fake-fastdata.ts';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'petal-w3-mirror-'));
});

/** fakeMap behind a switch: while `down`, every write fails like an unreachable RPC. */
function flaky() {
  const map = fakeMap();
  const calls: Record<string, unknown>[] = [];
  const state = { down: false, error: new Error('fetch failed: connect ECONNREFUSED') as Error };
  const writer: MapWriter = {
    async write(entries) {
      calls.push(entries);
      if (state.down) throw state.error;
      return map.write(entries);
    },
  };
  return { map, writer, calls, state };
}

describe('mirror: a copy of every write', () => {
  test('a write lands on the map and in the mirror, with its tx hash', async () => {
    const f = flaky();
    const m = mirror(dir, f.writer);
    const entries = { 'petal/v1/spec/x': { b: 1, a: 2 } };
    const tx = await m.write(entries);
    const [rec] = await m.records();
    expect(rec).toMatchObject({
      petal: 'mirror/v1',
      seq: 1,
      status: 'written',
      tx_hash: tx.tx_hash,
      block_height: tx.block_height,
      attempts: 1,
      last_error: null,
    });
    expect(canonicalJson(rec?.entries)).toBe(canonicalJson(entries));
    expect(await readdir(dir)).toEqual([`${rec?.id}.json`]);
    expect(rec?.id).toMatch(/^00000001-[0-9a-f]{12}$/);
    expect((await f.map.get('petal/v1/spec/x', f.map.writer))?.value).toEqual({ a: 2, b: 1 });
  });

  test('when the write fails: pending in the mirror, source_failed to the caller', async () => {
    const f = flaky();
    f.state.down = true;
    const m = mirror(dir, f.writer);
    const err = await m.write({ 'petal/v1/spec/x': 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(NearError);
    expect(err).toMatchObject({ code: 'source_failed' });
    expect(err.hint).toMatch(/pending \(00000001-/);
    const [rec] = await m.pending();
    expect(rec).toMatchObject({ status: 'pending', attempts: 1, tx_hash: null });
    expect(rec?.last_error).toMatch(/ECONNREFUSED/);
  });

  test("keeps the inner error's code and a sent-but-unconfirmed tx hash", async () => {
    const f = flaky();
    f.state.down = true;
    f.state.error = new NearError('source_failed', 'not seen in 30 s', { tx_hash: 'abc123' });
    const m = mirror(dir, f.writer);
    await expect(m.write({ 'petal/v1/spec/x': 1 })).rejects.toMatchObject({ tx_hash: 'abc123' });
    expect((await m.pending())[0]?.last_tx_hash).toBe('abc123');
    f.state.error = new NearError('internal', 'writer key is a full-access key');
    await expect(m.write({ 'petal/v1/spec/y': 1 })).rejects.toMatchObject({ code: 'internal' });
  });

  test('refuses what could never be sent, before mirroring it', async () => {
    const m = mirror(dir, flaky().writer);
    await expect(m.write({ 'not/petal': 1 })).rejects.toThrow(/outside/);
    await expect(m.write({})).rejects.toThrow(/no keys/);
    expect(await m.records()).toEqual([]);
  });

  test('concurrent writes are kept in call order', async () => {
    const f = flaky();
    const m = mirror(dir, f.writer);
    await Promise.all([1, 2, 3].map((i) => m.write({ [`petal/v1/spec/${i}`]: i })));
    expect((await m.records()).map((r) => [r.seq, Object.keys(r.entries)[0]])).toEqual([
      [1, 'petal/v1/spec/1'],
      [2, 'petal/v1/spec/2'],
      [3, 'petal/v1/spec/3'],
    ]);
    expect(f.calls.map((c) => Object.keys(c)[0])).toEqual([
      'petal/v1/spec/1',
      'petal/v1/spec/2',
      'petal/v1/spec/3',
    ]);
  });
});

describe('mirror: the retry job', () => {
  test('sends pending records again, oldest first, and marks them written', async () => {
    const f = flaky();
    f.state.down = true;
    const m = mirror(dir, f.writer);
    await m.write({ 'petal/v1/spec/a': 1 }).catch(() => {});
    await m.write({ 'petal/v1/spec/b': 2 }).catch(() => {});
    f.state.down = false;
    expect(await m.retryPending()).toEqual({ written: 2, superseded: 0, pending: 0 });
    const recs = await m.records();
    expect(recs.map((r) => [r.status, r.attempts])).toEqual([
      ['written', 2],
      ['written', 2],
    ]);
    expect(recs[0]?.tx_hash).toBe((await f.map.get('petal/v1/spec/a', f.map.writer))?.tx_hash);
    expect(f.calls.slice(2).map((c) => Object.keys(c)[0])).toEqual([
      'petal/v1/spec/a',
      'petal/v1/spec/b',
    ]);
  });

  test('stops at the first failure, so later records never land before earlier ones', async () => {
    const f = flaky();
    f.state.down = true;
    const m = mirror(dir, f.writer);
    await m.write({ 'petal/v1/spec/a': 1 }).catch(() => {});
    await m.write({ 'petal/v1/spec/b': 2 }).catch(() => {});
    const report = await m.retryPending();
    expect(report).toMatchObject({ written: 0, pending: 2 });
    expect(report.error).toMatch(/ECONNREFUSED/);
    expect((await m.records()).map((r) => r.attempts)).toEqual([2, 1]);
  });

  test('a pending key written again later is not sent again; an emptied record is superseded', async () => {
    const f = flaky();
    const m = mirror(dir, f.writer);
    f.state.down = true;
    await m.write({ 'petal/v1/spec/a': 'old', 'petal/v1/spec/b': 'old' }).catch(() => {});
    await m.write({ 'petal/v1/spec/c': 'old' }).catch(() => {});
    f.state.down = false;
    await m.write({ 'petal/v1/spec/b': 'new', 'petal/v1/spec/c': 'new' });
    expect(await m.retryPending()).toEqual({ written: 1, superseded: 1, pending: 0 });
    const recs = await m.records();
    expect(recs.map((r) => r.status)).toEqual(['written', 'superseded', 'written']);
    expect(recs[0]?.sent_keys).toEqual(['petal/v1/spec/a']);
    expect((await f.map.get('petal/v1/spec/b', f.map.writer))?.value).toBe('new');
    expect((await f.map.get('petal/v1/spec/c', f.map.writer))?.value).toBe('new');
    expect((await f.map.get('petal/v1/spec/a', f.map.writer))?.value).toBe('old');
  });

  test('survives a restart: a new mirror on the same folder continues and retries', async () => {
    const f = flaky();
    f.state.down = true;
    await mirror(dir, f.writer)
      .write({ 'petal/v1/spec/a': 1 })
      .catch(() => {});
    f.state.down = false;
    const again = mirror(dir, f.writer);
    await again.write({ 'petal/v1/spec/b': 2 });
    expect((await again.records()).map((r) => [r.seq, r.status])).toEqual([
      [1, 'pending'],
      [2, 'written'],
    ]);
    expect(await again.retryPending()).toMatchObject({ written: 1, pending: 0 });
  });

  test('startRetry runs the job on a timer and stops', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const f = flaky();
      f.state.down = true;
      const m = mirror(dir, f.writer);
      await m.write({ 'petal/v1/spec/a': 1 }).catch(() => {});
      f.state.down = false;
      const stop = m.startRetry(1_000);
      vi.advanceTimersByTime(1_000);
      expect(await m.pending()).toEqual([]); // queued after the retry, so it sees its result
      stop();
      vi.advanceTimersByTime(5_000);
      expect(f.calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('ignores files in the folder that are not mirror records', async () => {
    await writeFile(join(dir, 'notes.txt'), 'hello');
    const m = mirror(dir, flaky().writer);
    await m.write({ 'petal/v1/spec/a': 1 });
    expect(await m.records()).toHaveLength(1);
  });
});

describe('mirrorReader: the mirror read as a map (KV unreachable)', () => {
  test('latest wins, tombstones are skipped, pending rows carry no chain evidence', async () => {
    const f = flaky();
    const m = mirror(dir, f.writer);
    await m.write({ 'petal/v1/spec/a': 1, 'petal/v1/spec/b': 1, 'petal/v1/spec/c': 1 });
    await m.write({ 'petal/v1/spec/b': null });
    f.state.down = true;
    await m.write({ 'petal/v1/spec/c': 2 }).catch(() => {});
    const r = mirrorReader(dir, { writer: 'petals-writer.testnet', receiver: 'petals.testnet' });
    const rows = await r.latest('petal/v1/spec/');
    expect(rows.map((x) => [x.key, x.value])).toEqual([
      ['petal/v1/spec/a', 1],
      ['petal/v1/spec/c', 2],
    ]);
    expect(rows[1]).toMatchObject({
      tx_hash: '',
      block_height: 0,
      writer: 'petals-writer.testnet',
    });
    expect(rows[0]?.tx_hash).not.toBe('');
    expect(await r.get('petal/v1/spec/b', 'petals-writer.testnet')).toBeNull();
    expect(await r.get('petal/v1/spec/a', 'someone.testnet')).toBeNull();
    expect(await r.latest('petal/v1/spec/', { writers: ['someone.testnet'] })).toEqual([]);
    expect(await r.latest('petal/v1/spec/', { limit: 1 })).toHaveLength(1);
  });
});

describe('mirror around the FastData writer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('RPC down: pending; back up: the retry lands it and the KV read returns it', async () => {
    const kv = fakeFastData();
    const k = seededKey('writer');
    const chain = fakeChain(
      { 'petals-writer.testnet': { [k.publicKey]: functionCall('petals.testnet') } },
      kv,
    );
    const keyFile = join(dir, 'key.json');
    await writeFile(keyFile, JSON.stringify({ private_key: k.secretKey }));
    const inner = fastDataWriter(
      { network: 'testnet', receiver: 'petals.testnet', writer: 'petals-writer.testnet', keyFile },
      { provider: chain.provider, kv: { fetch: kv.fetch, apiKey: '' }, sleep: async () => {} },
    );
    const mirrorDir = join(dir, 'mirror');
    const m = mirror(mirrorDir, inner);
    chain.mode = 'rpc-down';
    await expect(m.write({ 'petal/v1/spec/x': { v: 1 } })).rejects.toMatchObject({
      code: 'source_failed',
    });
    chain.mode = 'no-contract';
    expect(await m.retryPending()).toMatchObject({ written: 1 });
    const reader = fastDataReader(
      { network: 'testnet', receiver: 'petals.testnet' },
      { fetch: kv.fetch, apiKey: '' },
    );
    const row = await reader.get('petal/v1/spec/x', 'petals-writer.testnet');
    const files = await readdir(mirrorDir);
    const rec = JSON.parse(
      await readFile(join(mirrorDir, files[0] as string), 'utf8'),
    ) as MirrorRecord;
    expect(row?.tx_hash).toBe(rec.tx_hash);
    expect(canonicalJson(row?.value)).toBe(canonicalJson(rec.entries['petal/v1/spec/x']));
  });
});
