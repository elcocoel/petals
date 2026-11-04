// NEAR endpoints Petal uses (shared-map.md, Endpoints). All keyless on 2026-11-04.
export type NearNetwork = 'testnet' | 'mainnet';

export const RPC_URLS = {
  testnet: 'https://rpc.testnet.fastnear.com',
  mainnet: 'https://rpc.mainnet.fastnear.com',
} as const;

export const KV_URLS = {
  testnet: 'https://kv.test.fastnear.com',
  mainnet: 'https://kv.main.fastnear.com',
} as const;

/** A transaction on nearblocks, the explorer link Petal shows. */
export function explorerTxUrl(network: NearNetwork, txHash: string): string {
  const host = network === 'testnet' ? 'https://testnet.nearblocks.io' : 'https://nearblocks.io';
  return `${host}/txns/${encodeURIComponent(txHash)}`;
}
