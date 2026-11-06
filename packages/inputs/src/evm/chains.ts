// The chains the Ethereum reader knows. Tested keyless on 2026-11-05.
//
// Tenderly's docs say every network is reachable without a key at
// https://<network>.gateway.tenderly.co, limited to 1 GB of response data per IP per day. They say
// a log query returns at most 3,000 results; the cap measured on Ethereum and Arbitrum was 20,000.
//
// Who can list a token's holders, and who can serve its logs over a wide range:
//   Ethereum  Blockscout answers keyless. Tenderly serves wide logs.
//   Arbitrum  Blockscout answers 403 (a Cloudflare challenge page). Tenderly serves wide logs.
//   Base      Blockscout answers 403 (the same). No keyless endpoint serves wide logs: Tenderly
//             1,000 blocks, dRPC under 10,000 on the free plan, 1RPC and Nodies 50, publicnode 403
//             on old blocks, the official RPC 429 at once, BlockPI wants a key. So a week of logs
//             is 303 calls keyless, and a whole history needs HyperSync and its token.
//   Gnosis    Blockscout redirects to Gnosisscan, whose API is blocked. The official RPC and Tenderly
//             serve eth_getLogs over the whole chain (tested 2026-11-06: 169 logs from block 0 in about
//             a second); dRPC stops at 10,000 blocks and 1RPC at 50.
// State reads (balanceOf, totalSupply at a finalized block) work keyless on all of them.
import type { RpcEndpoint } from '../rpc/pool.ts';

export interface EvmChain {
  /** the name in parameters */
  id: string;
  name: string;
  /** CAIP-2 */
  caip2: string;
  /** state reads go through these in order; logs only through the first */
  endpoints: readonly RpcEndpoint[];
  /** the first block with Multicall3 */
  multicall3_from: number;
  /** the first block with Multicall2, where it exists */
  multicall2_from?: number;
  /** a holders API that answers keyless, where one does */
  blockscout?: string;
  /** whether the first endpoint serves eth_getLogs over wide ranges without a key */
  wide_logs: boolean;
  /** the widest eth_getLogs range the first endpoint takes, where it is narrow */
  log_chunk_blocks?: number;
  /** where log reads go when the first endpoint is down, with the range it takes */
  log_fallback?: { endpoint: RpcEndpoint; chunk_blocks: number };
  /** seconds per block on average, to turn days into blocks */
  block_seconds: number;
  hypersync: string;
}

export const ETHEREUM: EvmChain = {
  id: 'ethereum',
  name: 'Ethereum',
  caip2: 'eip155:1',
  endpoints: [
    { id: 'tenderly', url: 'https://mainnet.gateway.tenderly.co', intervalMs: 250 },
    { id: 'drpc', url: 'https://eth.drpc.org', intervalMs: 400 },
  ],
  multicall3_from: 14353601,
  multicall2_from: 12336033,
  blockscout: 'https://eth.blockscout.com',
  wide_logs: true,
  block_seconds: 12,
  hypersync: 'https://eth.hypersync.xyz',
};

export const BASE: EvmChain = {
  id: 'base',
  name: 'Base',
  caip2: 'eip155:8453',
  endpoints: [
    { id: 'tenderly-base', url: 'https://base.gateway.tenderly.co', intervalMs: 250 },
    { id: 'base-official', url: 'https://mainnet.base.org', intervalMs: 1000 },
    { id: 'drpc-base', url: 'https://base.drpc.org', intervalMs: 400 },
  ],
  multicall3_from: 5022,
  wide_logs: false,
  log_chunk_blocks: 1000,
  log_fallback: {
    endpoint: { id: 'drpc-base', url: 'https://base.drpc.org', intervalMs: 400 },
    chunk_blocks: 9000,
  },
  block_seconds: 2,
  hypersync: 'https://base.hypersync.xyz',
};

export const ARBITRUM: EvmChain = {
  id: 'arbitrum',
  name: 'Arbitrum',
  caip2: 'eip155:42161',
  endpoints: [
    { id: 'tenderly-arbitrum', url: 'https://arbitrum.gateway.tenderly.co', intervalMs: 250 },
    { id: 'arbitrum-official', url: 'https://arb1.arbitrum.io/rpc', intervalMs: 500 },
    { id: 'drpc-arbitrum', url: 'https://arbitrum.drpc.org', intervalMs: 400 },
  ],
  multicall3_from: 7654707,
  wide_logs: true,
  log_fallback: {
    endpoint: { id: 'drpc-arbitrum', url: 'https://arbitrum.drpc.org', intervalMs: 400 },
    chunk_blocks: 9000,
  },
  block_seconds: 0.25,
  hypersync: 'https://arbitrum.hypersync.xyz',
};

export const GNOSIS: EvmChain = {
  id: 'gnosis',
  name: 'Gnosis',
  caip2: 'eip155:100',
  endpoints: [
    { id: 'gnosis-official', url: 'https://rpc.gnosischain.com', intervalMs: 250 },
    { id: 'tenderly-gnosis', url: 'https://gnosis.gateway.tenderly.co', intervalMs: 250 },
    { id: 'drpc-gnosis', url: 'https://gnosis.drpc.org', intervalMs: 400 },
  ],
  multicall3_from: 21022491,
  wide_logs: true,
  block_seconds: 5,
  hypersync: 'https://gnosis.hypersync.xyz',
};

export const EVM_CHAINS: Record<string, EvmChain> = {
  ethereum: ETHEREUM,
  base: BASE,
  arbitrum: ARBITRUM,
  gnosis: GNOSIS,
};

/** For a module's `chain` parameter: every chain above, and only those. */
export const EVM_CHAIN_PATTERN = `^(${Object.keys(EVM_CHAINS).join('|')})$`;
export const EVM_CHAIN_WORDS = Object.keys(EVM_CHAINS).join(', ');
