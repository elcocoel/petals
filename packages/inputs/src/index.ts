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
export { ARBITRUM, BASE, ETHEREUM, EVM_CHAINS, type EvmChain } from './evm/chains.ts';
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
export {
  BANK_ETHEREUM,
  DEFAULT_WINDOW_DAYS,
  DPX_ARBITRUM,
  ERC20_HOLDERS_DESCRIPTOR,
  erc20HoldersLive,
  erc20HoldersStored,
  type HolderTarget,
  PEPE_ETHEREUM,
  pullErc20Holders,
  REPLAY_LOG_BUDGET,
  SEAM_BASE,
} from './modules/erc20-holders.ts';
export { ENS_TOKEN, erc20Votes, pullErc20Votes, type VotesToken } from './modules/erc20-votes.ts';
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
  /**
   * Additive (T162). For a module whose parameters pick a different chain or population: what the
   * store and the map key a snapshot by. Default: the descriptor's chain and population. Without
   * this, two tokens read at the same block would be taken for one another.
   */
  keyFor?(params: Params | undefined): { chain: string; population: string };
}

/** Content-addressed snapshot store (constitution IV). */
export interface SnapshotStore {
  get(sha256: string): Promise<Snapshot | null>;
  /** canonical bytes, gzip on disk */
  put(s: Snapshot): Promise<{ sha256: string; bytes: number }>;
  lookup(key: { chain: string; population: string; block_height: number }): Promise<string | null>;
  list(networkId?: string): Promise<IndexRow[]>;
}
