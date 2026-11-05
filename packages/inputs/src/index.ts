// @petal/inputs (W2): reads public sources and disk. Signatures: contracts/packages.md.
// RPC pool: dRPC first, then FastNEAR, then Shitzu (with a User-Agent), paced to their measured
// limits. Reads use finality "final" or a fixed block_id.
import type {
  At,
  IndexRow,
  NetworkDescriptor,
  Params,
  Progress,
  ResolvedAt,
  Snapshot,
} from '@petal/core/types';

export { InputError, isInputError, type SourceFailure } from './errors.ts';
export {
  EVM_ENDPOINTS,
  type EvmReader,
  type EvmReaderOptions,
  evmReader,
} from './evm/reader.ts';
export { getSnapshot, LATEST_REUSE_S } from './get-snapshot.ts';
export {
  BACKER_CLASSES,
  type BackerClass,
  importSpike,
  NEAR_VALIDATORS_RULES,
  NO_GROUPING,
} from './import/spike.ts';
export {
  BEANSTALK_DESCRIPTOR,
  beanstalk,
  pullBeanstalk,
  readBeanstalkList,
} from './modules/beanstalk.ts';
export { MOLOCH_V1_DESCRIPTOR, molochV1, pullMolochV1 } from './modules/moloch-v1.ts';
export { HOUSE_OF_STAKE_DESCRIPTOR, nearHouseOfStake } from './modules/near-house-of-stake.ts';
export { NEAR_VALIDATORS_DESCRIPTOR, nearValidators } from './modules/near-validators.ts';
export {
  MELANIA,
  pullSplHolders,
  type SplToken,
  solanaSplHolders,
  TRUMP,
} from './modules/solana-spl-holders.ts';
export { modules } from './registry.ts';
export {
  type BlockInfo,
  type BlockRef,
  DEFAULT_ENDPOINTS,
  type RpcEndpoint,
  RpcError,
  type RpcPool,
  type RpcPoolOptions,
  rpcPool,
} from './rpc/pool.ts';
export { fileStore } from './store/file-store.ts';

export interface InputModule {
  /** id, chain, population, capabilities, live, cost */
  descriptor: NetworkDescriptor;
  resolveAt(at: At, params?: Params): Promise<ResolvedAt>;
  fetch(at: ResolvedAt, params: Params | undefined, onProgress?: Progress): Promise<Snapshot>;
}

/** Content-addressed snapshot store (constitution IV). */
export interface SnapshotStore {
  get(sha256: string): Promise<Snapshot | null>;
  /** canonical bytes, gzip on disk */
  put(s: Snapshot): Promise<{ sha256: string; bytes: number }>;
  lookup(key: { chain: string; population: string; block_height: number }): Promise<string | null>;
  list(networkId?: string): Promise<IndexRow[]>;
}
