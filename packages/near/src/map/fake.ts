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
import { MAP_LIMITS, type MapReader, type MapWriter } from './index.ts';

export const MAP_KEY_PREFIX = 'petal/v1/';

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

const utf8 = (s: string) => new TextEncoder().encode(s).length;

/** The checks every Petal map writer makes before sending. Throws on the first problem. */
export function checkWrite(entries: Record<string, unknown>): void {
  const keys = Object.keys(entries);
  if (keys.length === 0) throw new Error('map write: no keys');
  if (keys.length > MAP_LIMITS.keysPerWrite)
    throw new Error(`map write: ${keys.length} keys, at most ${MAP_LIMITS.keysPerWrite} per call`);
  for (const key of keys) {
    if (!key.startsWith(MAP_KEY_PREFIX))
      throw new Error(`map write: key outside ${MAP_KEY_PREFIX}: ${key}`);
    if (utf8(key) > MAP_LIMITS.keyBytes)
      throw new Error(`map write: key over ${MAP_LIMITS.keyBytes} bytes: ${key.slice(0, 60)}…`);
    const value = entries[key];
    if (value !== null && utf8(canonicalJson(value)) > MAP_LIMITS.valueBytes)
      throw new Error(`map write: value over ${MAP_LIMITS.valueBytes} bytes at ${key}`);
  }
}

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
