// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// @petal/near/auth (W3): NEP-413 sign-in and publish proofs. Test helpers: @petal/near/auth/testing.
import { notImplemented } from '@petal/core';
import type { Nep413Proof } from '@petal/core/types';

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

/** 32 random bytes, base64, single use, short TTL. */
export function issueNonce(): { nonce: string; expires_at: string } {
  return notImplemented('issueNonce');
}

/** Checks the signature, then view_access_key: the key must be a full-access key of account_id. */
export async function verifyNep413(
  proof: Nep413Proof,
  expect: { message: string; recipient: string },
  rpc: Rpc,
): Promise<{ ok: boolean; reason?: string }> {
  return notImplemented('verifyNep413');
}
