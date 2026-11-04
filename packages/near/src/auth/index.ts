// @petal/near/auth (W3): NEP-413 sign-in and publish proofs. Test helpers: @petal/near/auth/testing.
import type { Nep413Proof } from '@petal/core/types';

export {
  NEP413_TAG,
  type Nep413Payload,
  nearRpc,
  nep413Hash,
  nep413Payload,
  verifyNep413,
} from './nep413.ts';
export {
  createNonceStore,
  defaultNonces,
  issueNonce,
  NONCE_BYTES,
  NONCE_TTL_MS,
  type NonceCheck,
  type NonceStore,
} from './nonce.ts';
export type { Nep413Proof };

/** One NEAR JSON-RPC `query` call, e.g. view_access_key. A near-api-js JsonRpcProvider fits. */
export interface RpcQuery {
  request_type: string;
  finality?: 'final' | 'optimistic';
  block_id?: number | string;
  [field: string]: unknown;
}
export interface Rpc {
  query<T = unknown>(params: RpcQuery): Promise<T>;
}

export type AccessKeyPermission =
  | 'FullAccess'
  | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };

/** The result of query view_access_key. */
export interface AccessKeyView {
  nonce: number;
  permission: AccessKeyPermission;
  block_height: number;
  block_hash: string;
}
