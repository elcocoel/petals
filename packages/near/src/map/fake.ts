// fakeMap(): an in-memory shared map for tests and for W4–W6 until the FastData client lands
// (T019). It behaves like FastData KV where Petal can tell: values come back re-serialised with
// sorted keys, null is a tombstone, the writer is recorded per row, and over-limit writes are
// refused (FastData drops them silently, so every Petal writer refuses them first).
// Transaction hashes are deterministic and start with "fake", so nobody mistakes one for chain
// evidence.

import { hexToBytes } from '@noble/hashes/utils.js';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { MapRow } from '@petal/core/types';
import { base58 } from '@scure/base';
import type { MapReader, MapWriter } from './index.ts';
import { checkWrite } from './limits.ts';

export { checkWrite, MAP_KEY_PREFIX } from './limits.ts';

export interface FakeMapOptions {
  /** default writer.petals.testnet */
  writer?: string;
  /** default petals.testnet */
  receiver?: string;
  /** block height of the first write; default 200,000,000 */
  startBlock?: number;
  /** block_timestamp (ms) of the first write; default 2026-11-04T00:00:00Z */
  startTime?: number;
}

export interface FakeWrite {
  writer: string;
  keys: string[];
  tx_hash: string;
  block_height: number;
}

export type FakeMap = MapWriter &
  MapReader & {
    readonly writer: string;
    readonly receiver: string;
    /** a writer for another account on the same map (anyone can write under the receiver) */
    as(writer: string): MapWriter;
    /** every accepted write, in order */
    writes(): FakeWrite[];
  };

export function fakeMap(opts: FakeMapOptions = {}): FakeMap {
  const receiver = opts.receiver ?? 'petals.testnet';
  const writer = opts.writer ?? 'writer.petals.testnet';
  const startBlock = opts.startBlock ?? 200_000_000;
  const startTime = opts.startTime ?? Date.UTC(2026, 10, 4);
  const rows = new Map<string, MapRow>(); // `${writer}\n${key}`
  const log: FakeWrite[] = [];

  const writeAs = (account: string): MapWriter => ({
    async write(entries) {
      checkWrite(entries);
      const seq = log.length;
      const keys = Object.keys(entries);
      const digest = sha256Hex(`${seq}\n${account}\n${canonicalJson(entries)}`);
      const tx_hash = `fake${base58.encode(hexToBytes(digest))}`.slice(0, 44);
      const block_height = startBlock + seq;
      const block_timestamp = startTime + seq * 600;
      for (const key of keys) {
        const raw = entries[key];
        // FastData re-serialises values with sorted keys: hand back the canonical form.
        const value = raw === null ? null : JSON.parse(canonicalJson(raw));
        rows.set(`${account}\n${key}`, {
          key,
          value,
          writer: account,
          receiver,
          tx_hash,
          block_height,
          block_timestamp,
        });
      }
      log.push({ writer: account, keys, tx_hash, block_height });
      return { tx_hash, block_height };
    },
  });

  const own = writeAs(writer);
  return {
    writer,
    receiver,
    write: own.write,
    as: writeAs,
    writes: () => log.map((w) => ({ ...w, keys: [...w.keys] })),
    async latest(prefix, o = {}) {
      const out = [...rows.values()]
        .filter((r) => r.key.startsWith(prefix) && r.value !== null)
        .filter((r) => !o.writers || o.writers.includes(r.writer))
        .sort((a, b) =>
          a.writer === b.writer ? (a.key < b.key ? -1 : 1) : a.writer < b.writer ? -1 : 1,
        );
      return (o.limit === undefined ? out : out.slice(0, o.limit)).map((r) => ({ ...r }));
    },
    async get(key, account) {
      const r = rows.get(`${account}\n${key}`);
      return r && r.value !== null ? { ...r } : null;
    },
  };
}
