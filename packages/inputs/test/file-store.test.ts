// T033: the content-addressed file store.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { IndexRow } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { fileStore } from '../src/index.ts';
import { encodeSnapshot } from '../src/store/file-store.ts';
import {
  FIXTURES,
  liveSnapshot,
  readGz,
  testSnapshot,
  tmp,
  VALIDATORS_SHA,
} from './helpers/snapshots.ts';

describe('fileStore', () => {
  test('round trip: put, then get, lookup and list give it back', async () => {
    const cache = join(tmp('store'), 'cache');
    const store = fileStore({ fixtures: tmp('nofixtures'), cache });
    const s = liveSnapshot(1000, '2026-11-04T10:00:00Z');
    const put = await store.put(s);

    expect(put.sha256).toBe(sha256Hex(canonicalJson(s)));
    expect(put.bytes).toBe(Buffer.byteLength(canonicalJson(s)));
    expect(await store.get(put.sha256)).toEqual(s);
    expect(
      await store.lookup({ chain: 'near:testnet', population: 'test-live', block_height: 1000 }),
    ).toBe(put.sha256);
    expect(
      await store.lookup({ chain: 'near:testnet', population: 'test-live', block_height: 1001 }),
    ).toBeNull();

    const rows = await store.list('test-live');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sha256: put.sha256,
      network: 'test-live',
      chain: 'near:testnet',
      population: 'test-live',
      block_height: 1000,
      as_of: '2026-11-04T10:00:00Z',
      final: true,
      bytes: put.bytes,
      file: `${put.sha256}.json.gz`,
      where: 'cache',
      module: { id: 'test-live', version: 'test/1' },
    });
    expect(await store.list('other')).toEqual([]);

    // on disk: cache/<sha256>.json.gz holding the canonical bytes, and cache/index.json
    const gz = readFileSync(join(cache, `${put.sha256}.json.gz`));
    expect(rows[0]?.gz_bytes).toBe(gz.length);
    expect(gunzipSync(gz).toString('utf8')).toBe(canonicalJson(s));
    const index = JSON.parse(readFileSync(join(cache, 'index.json'), 'utf8'));
    expect(index.petal).toBe('snapshot-index/v1');
  });

  test('gzip never changes the hash: any gzip level reads back under the same name', async () => {
    const cache = tmp('gzip');
    const s = testSnapshot('tiny-backers');
    const { canonical, sha256 } = encodeSnapshot(s);
    const store = fileStore({ fixtures: tmp('nofixtures'), cache });
    for (const level of [1, 6, 9]) {
      writeFileSync(join(cache, `${sha256}.json.gz`), gzipSync(canonical, { level }));
      expect(await store.get(sha256)).toEqual(s);
    }
    // and putting it again keeps the same name
    expect((await store.put(s)).sha256).toBe(sha256);
    // key order in the input does not matter either: the name is the canonical form's
    const reordered = Object.fromEntries(Object.entries(s).reverse()) as typeof s;
    expect((await store.put(reordered)).sha256).toBe(sha256);
  });

  test('a file whose bytes do not match its name is refused', async () => {
    const cache = tmp('tamper');
    const store = fileStore({ fixtures: tmp('nofixtures'), cache });
    const { sha256 } = await store.put(liveSnapshot(5, '2026-11-04T10:00:00Z'));
    const other = encodeSnapshot(liveSnapshot(6, '2026-11-04T10:00:00Z')).canonical;
    writeFileSync(join(cache, `${sha256}.json.gz`), gzipSync(other));
    await expect(store.get(sha256)).rejects.toThrow(/holds bytes with sha256/);
  });

  test('get refuses anything that is not a sha256 (no path tricks)', async () => {
    const store = fileStore({ fixtures: FIXTURES, cache: tmp('x') });
    expect(await store.get('../index')).toBeNull();
    expect(await store.get(VALIDATORS_SHA.toUpperCase())).toBeNull();
  });

  test('looks in fixtures first, and never writes there', async () => {
    const cache = tmp('fx');
    // the repo root fixtures/ is accepted for fixtures/snapshots/
    const store = fileStore({ fixtures: join(FIXTURES, '..'), cache });
    const row = (await store.list('near-validators'))[0] as IndexRow;
    expect(row).toMatchObject({ sha256: VALIDATORS_SHA, where: 'fixture', final: true });
    expect(
      await store.lookup({
        chain: 'near:mainnet',
        population: 'validators',
        block_height: 222915356,
      }),
    ).toBe(VALIDATORS_SHA);

    const s = await store.get(VALIDATORS_SHA);
    expect(s?.network.id).toBe('near-validators');
    // putting a fixture snapshot writes nothing to the cache
    if (s) expect((await store.put(s)).sha256).toBe(VALIDATORS_SHA);
    expect(existsSync(join(cache, 'index.json'))).toBe(false);
  });

  test('a snapshot in both places is listed once, as the fixture', async () => {
    const fixtures = tmp('both');
    const cache = tmp('bothcache');
    const s = liveSnapshot(7, '2026-11-04T10:00:00Z');
    const { sha256 } = await fileStore({ fixtures: tmp('none'), cache: fixtures }).put(s);
    // turn that folder into a fixtures folder
    const index = JSON.parse(readFileSync(join(fixtures, 'index.json'), 'utf8'));
    index.snapshots[0].where = 'fixture';
    writeFileSync(join(fixtures, 'index.json'), JSON.stringify(index));
    mkdirSync(cache, { recursive: true });
    writeFileSync(
      join(cache, `${sha256}.json.gz`),
      readFileSync(join(fixtures, `${sha256}.json.gz`)),
    );
    writeFileSync(
      join(cache, 'index.json'),
      JSON.stringify({ ...index, snapshots: [{ ...index.snapshots[0], where: 'cache' }] }),
    );
    const rows = await fileStore({ fixtures, cache }).list();
    expect(rows.map((r) => r.where)).toEqual(['fixture']);
  });

  test('lookup prefers a final snapshot over a non-final one at the same block', async () => {
    const store = fileStore({ fixtures: tmp('none'), cache: tmp('pref') });
    const a = await store.put(liveSnapshot(9, '2026-11-04T10:00:00Z', false));
    const b = await store.put({ ...liveSnapshot(9, '2026-11-04T10:00:00Z', true), events: [] });
    expect(a.sha256).not.toBe(b.sha256);
    expect(
      await store.lookup({ chain: 'near:testnet', population: 'test-live', block_height: 9 }),
    ).toBe(b.sha256);
  });

  test('concurrent puts keep every row in the index', async () => {
    const cache = tmp('conc');
    const store = fileStore({ fixtures: tmp('none'), cache });
    const puts = await Promise.all(
      [11, 12, 13, 14, 15].map((b) => store.put(liveSnapshot(b, '2026-11-04T10:00:00Z'))),
    );
    const rows = await store.list('test-live');
    expect(rows.map((r) => r.sha256).sort()).toEqual(puts.map((p) => p.sha256).sort());
    expect(rows.map((r) => r.block_height)).toEqual([11, 12, 13, 14, 15]);
  });

  test('the validators fixture reads back with its indexed hash', async () => {
    const s = readGz(join(FIXTURES, `${VALIDATORS_SHA}.json.gz`));
    expect(encodeSnapshot(s as never).sha256).toBe(VALIDATORS_SHA);
  });
});
