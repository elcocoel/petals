// @petal/near/map (W3): the shared map on FastData KV (contracts/shared-map.md).
// All keys start with petal/v1/. Keys <= 1,024 bytes; values <= 256 KiB; <= 256 keys per call.
// FastData drops anything over a limit silently, so every writer refuses it first.
import type { MapRow } from '@petal/core/types';

export { fakeMap } from './fake.ts';
export { KV_URLS, type KvDeps, toMapRow } from './fastdata-kv.ts';
export { fastDataReader } from './fastdata-reader.ts';
export {
  checkWriterPermission,
  FASTDATA_GAS,
  FASTDATA_METHOD,
  fastDataWriter,
  isExpectedFailure,
  loadWriterKey,
  type WriterDeps,
} from './fastdata-writer.ts';
export { mapKeys } from './keys.ts';
export { checkWrite, MAP_KEY_PREFIX, MAP_LIMITS } from './limits.ts';
export {
  type MirrorRecord,
  type MirrorStatus,
  type MirrorWriter,
  mirror,
  mirrorReader,
  type RetryReport,
} from './mirror.ts';
export type { MapRow };

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
