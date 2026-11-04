// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// @petal/inputs (W2): reads public sources and disk. Signatures: contracts/packages.md.
// RPC pool: dRPC first, then FastNEAR, then Shitzu (with a User-Agent), paced to their measured
// limits. Reads use finality "final" or a fixed block_id.
import { notImplemented } from '@petal/core';
import type {
  At,
  IndexRow,
  MapIndex,
  NetworkDescriptor,
  Params,
  Progress,
  ResolvedAt,
  Snapshot,
  SnapshotRequest,
  SnapshotResult,
} from '@petal/core/types';

export {
  BACKER_CLASSES,
  type BackerClass,
  importSpike,
  NEAR_VALIDATORS_RULES,
  NO_GROUPING,
} from './import/spike.ts';

export interface InputModule {
  /** id, chain, population, capabilities, live, cost */
  descriptor: NetworkDescriptor;
  resolveAt(at: At, params?: Params): Promise<ResolvedAt>;
  fetch(at: ResolvedAt, params: Params | undefined, onProgress?: Progress): Promise<Snapshot>;
}

/** Phase A: near-validators, near-house-of-stake. Empty until W2 registers them. */
export const modules: Record<string, InputModule> = {};

/** Content-addressed snapshot store (constitution IV). */
export interface SnapshotStore {
  get(sha256: string): Promise<Snapshot | null>;
  /** canonical bytes, gzip on disk */
  put(s: Snapshot): Promise<{ sha256: string; bytes: number }>;
  lookup(key: { chain: string; population: string; block_height: number }): Promise<string | null>;
  list(networkId?: string): Promise<IndexRow[]>;
}

/** Lookup order: fixtures, then the local cache. */
export function fileStore(dirs: { fixtures: string; cache: string }): SnapshotStore {
  return notImplemented('fileStore');
}

/** Resolve `at`, reuse a final snapshot from the store or the map index, or fetch and store. */
export async function getSnapshot(
  req: SnapshotRequest,
  deps: { store: SnapshotStore; map?: MapIndex; onProgress?: Progress },
): Promise<SnapshotResult> {
  return notImplemented('getSnapshot');
}
