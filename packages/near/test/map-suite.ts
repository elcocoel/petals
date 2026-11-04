// The reader/writer suite every map client must pass (T019): fakeMap() now, the FastData client
// (W3) on testnet later. Call mapSuite() from a *.test.ts file.
//   mapSuite('fakeMap', () => { const m = fakeMap(); return { writer: m, reader: m, ... } })
import { canonicalJson } from '@petal/core';
import { describe, expect, test } from 'vitest';
import type { MapReader, MapWriter } from '../src/map/index.ts';

export interface MapUnderTest {
  writer: MapWriter;
  reader: MapReader;
  /** the account `writer` writes as */
  writerAccount: string;
  receiver: string;
  /** a second account writing under the same receiver, for trusted-writer filtering */
  other: { writer: MapWriter; account: string };
  /** wait until writes are readable (FastData indexes within ~30 s); omit for in-memory maps */
  settle?: () => Promise<void>;
}

export function mapSuite(
  name: string,
  make: () => MapUnderTest | Promise<MapUnderTest>,
  opts: { prefix?: string; timeout?: number } = {},
) {
  const run = Date.now().toString(36);
  const prefix = opts.prefix ?? `petal/v1/test/${run}/`;
  const settle = async (m: MapUnderTest) => m.settle?.();
  let n = 0;
  const fresh = () => `${prefix}${++n}/`;

  describe(`map client: ${name}`, () => {
    test(
      'writes a key and reads it back with its writer, receiver and transaction',
      async () => {
        const m = await make();
        const key = `${fresh()}spec/abc`;
        const value = { petal: 'flower/v1', b: [1, 2, { z: 1, a: 2 }], a: 'x' };
        const tx = await m.writer.write({ [key]: value });
        expect(tx.tx_hash).toMatch(/^\S{8,}$/);
        expect(tx.block_height).toBeGreaterThan(0);
        await settle(m);
        const row = await m.reader.get(key, m.writerAccount);
        expect(row).toMatchObject({
          key,
          writer: m.writerAccount,
          receiver: m.receiver,
          tx_hash: tx.tx_hash,
          block_height: tx.block_height,
        });
        expect(typeof row?.block_timestamp).toBe('number');
        // values may come back re-serialised: compare canonical forms, never raw bytes
        expect(canonicalJson(row?.value)).toBe(canonicalJson(value));
      },
      opts.timeout,
    );

    test(
      'one write of several keys is one transaction',
      async () => {
        const m = await make();
        const p = fresh();
        const tx = await m.writer.write({ [`${p}a`]: 1, [`${p}b`]: 2, [`${p}c`]: 3 });
        await settle(m);
        const rows = await m.reader.latest(p, { writers: [m.writerAccount] });
        expect(rows.map((r) => r.key).sort()).toEqual([`${p}a`, `${p}b`, `${p}c`]);
        for (const r of rows) expect(r.tx_hash).toBe(tx.tx_hash);
      },
      opts.timeout,
    );

    test(
      'latest lists keys under a prefix and nothing outside it',
      async () => {
        const m = await make();
        const p = fresh();
        await m.writer.write({ [`${p}in/1`]: 1, [`${p}in/2`]: 2, [`${p}out/1`]: 3 });
        await settle(m);
        const rows = await m.reader.latest(`${p}in/`, { writers: [m.writerAccount] });
        expect(rows.map((r) => r.key).sort()).toEqual([`${p}in/1`, `${p}in/2`]);
        expect(await m.reader.latest(`${p}none/`, { writers: [m.writerAccount] })).toEqual([]);
      },
      opts.timeout,
    );

    test(
      'a later write of the same key wins',
      async () => {
        const m = await make();
        const key = `${fresh()}k`;
        await m.writer.write({ [key]: { v: 1 } });
        const second = await m.writer.write({ [key]: { v: 2 } });
        await settle(m);
        const row = await m.reader.get(key, m.writerAccount);
        expect(row?.value).toEqual({ v: 2 });
        expect(row?.tx_hash).toBe(second.tx_hash);
        const rows = await m.reader.latest(key, { writers: [m.writerAccount] });
        expect(rows).toHaveLength(1);
      },
      opts.timeout,
    );

    test(
      'null is a tombstone: get returns null and latest skips it',
      async () => {
        const m = await make();
        const p = fresh();
        await m.writer.write({ [`${p}gone`]: { v: 1 }, [`${p}kept`]: { v: 1 } });
        await m.writer.write({ [`${p}gone`]: null });
        await settle(m);
        expect(await m.reader.get(`${p}gone`, m.writerAccount)).toBeNull();
        const rows = await m.reader.latest(p, { writers: [m.writerAccount] });
        expect(rows.map((r) => r.key)).toEqual([`${p}kept`]);
      },
      opts.timeout,
    );

    test(
      'rows are per writer: readers filter by trusted writers',
      async () => {
        const m = await make();
        const key = `${fresh()}spec/x`;
        await m.writer.write({ [key]: { by: 'petal' } });
        await m.other.writer.write({ [key]: { by: 'someone else' } });
        await settle(m);
        expect((await m.reader.get(key, m.writerAccount))?.value).toEqual({ by: 'petal' });
        expect((await m.reader.get(key, m.other.account))?.value).toEqual({ by: 'someone else' });
        const trusted = await m.reader.latest(key, { writers: [m.writerAccount] });
        expect(trusted.map((r) => r.writer)).toEqual([m.writerAccount]);
        const both = await m.reader.latest(key, { writers: [m.writerAccount, m.other.account] });
        expect(both.map((r) => r.writer).sort()).toEqual([m.writerAccount, m.other.account].sort());
      },
      opts.timeout,
    );

    test(
      'limit caps the rows returned',
      async () => {
        const m = await make();
        const p = fresh();
        await m.writer.write(Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`${p}${i}`, i])));
        await settle(m);
        expect(await m.reader.latest(p, { writers: [m.writerAccount], limit: 2 })).toHaveLength(2);
      },
      opts.timeout,
    );

    test(
      'get of a key never written is null',
      async () => {
        const m = await make();
        expect(await m.reader.get(`${fresh()}missing`, m.writerAccount)).toBeNull();
      },
      opts.timeout,
    );

    test(
      'refuses writes FastData would drop silently, before sending',
      async () => {
        const m = await make();
        const p = fresh();
        const many = Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`${p}${i}`, i]));
        await expect(m.writer.write(many)).rejects.toThrow();
        await expect(m.writer.write({ [`${p}big`]: 'x'.repeat(256 * 1024) })).rejects.toThrow();
        await expect(m.writer.write({ [`${p}${'k'.repeat(1024)}`]: 1 })).rejects.toThrow();
        await expect(m.writer.write({ 'not-petal/key': 1 })).rejects.toThrow();
        await expect(m.writer.write({})).rejects.toThrow();
        await settle(m);
        expect(await m.reader.latest(p, { writers: [m.writerAccount] })).toEqual([]);
      },
      opts.timeout,
    );
  });
}
