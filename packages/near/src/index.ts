// @petal/near (W3): NEAR as a platform. Prefer the subpaths: @petal/near/map, /auth, /pay.
// NEAR as a data source (RPC reads of validators, DAOs) lives in @petal/inputs.
export * from './auth/index.ts';
export { NearError } from './errors.ts';
export * from './map/index.ts';
export { explorerTxUrl, type NearNetwork, RPC_URLS } from './network.ts';
export * from './pay/index.ts';
