// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// @petal/near/map (W3): the shared map on FastData KV (contracts/shared-map.md).
// All keys start with petal/v1/. Keys <= 1,024 bytes; values <= 256 KiB; <= 256 keys per call.
// FastData drops anything over a limit silently, so every writer refuses it first.
import { notImplemented } from '@petal/core';
import type { MapRow } from '@petal/core/types';

export { fakeMap } from './fake.ts';
export type { MapRow };

export const MAP_LIMITS = { keysPerWrite: 256, keyBytes: 1024, valueBytes: 256 * 1024 } as const;

/** Petal's writer: a function-call key limited to the receiver and __fastdata_kv. */
export interface MapWriter {
  /** <= 256 keys, <= 256 KiB each. A null value is a tombstone (delete). */
  write(entries: Record<string, unknown>): Promise<{ tx_hash: string; block_height: number }>;
}

export interface MapReader {
  /** Latest value of every key under `prefix`, one call per writer; tombstones are skipped. */
  latest(prefix: string, opts?: { writers?: string[]; limit?: number }): Promise<MapRow[]>;
  /** Latest value of one key by one writer, or null (also for a tombstone). */
  get(key: string, writer: string): Promise<MapRow | null>;
}

export function fastDataWriter(cfg: {
  network: 'testnet';
  receiver: string;
  writer: string;
  keyFile: string;
}): MapWriter {
  return notImplemented('fastDataWriter');
}

export function fastDataReader(cfg: {
  network: 'testnet' | 'mainnet';
  receiver: string;
}): MapReader {
  return notImplemented('fastDataReader');
}

/** Keeps a local copy of every write (retention risk); pending when the inner writer fails. */
export function mirror(dir: string, inner: MapWriter): MapWriter {
  return notImplemented('mirror');
}

/** Builders for every key in shared-map.md. */
export const mapKeys: {
  spec(id: string): string;
  snapshot(sha256: string): string;
  index(caip2: string, population: string, block: number): string;
  label(caip2: string, address: string): string;
  correction(flowerId: string, id: string): string;
  vouch(account: string): string;
} = {
  spec: (id) => notImplemented(`mapKeys.spec(${id})`),
  snapshot: (sha256) => notImplemented(`mapKeys.snapshot(${sha256})`),
  index: (caip2, population, block) =>
    notImplemented(`mapKeys.index(${caip2}, ${population}, ${block})`),
  label: (caip2, address) => notImplemented(`mapKeys.label(${caip2}, ${address})`),
  correction: (flowerId, id) => notImplemented(`mapKeys.correction(${flowerId}, ${id})`),
  vouch: (account) => notImplemented(`mapKeys.vouch(${account})`),
};
