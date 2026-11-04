// verifyNep413 (T041): checks a maker's NEP-413 proof (shared-map.md, Writing step 3; tools.md
// publish_flower). In order:
//   1. the proof signs exactly the message and recipient Petal asked for;
//   2. the signature verifies over the NEP-413 hash (locally: a forged proof costs no RPC call);
//   3. the nonce was issued here, is fresh and unused (reserved while checking, spent on success);
//   4. near-api-js v7 `verifyMessage`: view_access_key, which must be a FULL-ACCESS key of the
//      account (a function-call key, such as an agent's, cannot sign for the maker), then the
//      signature again.
// A failed check returns { ok: false, reason }. An RPC that cannot answer throws a NearError
// (source_failed), and the nonce is released, so the maker can try again without signing again.
//
// The NEP-413 payload: sha256( borsh(u32 2^31+413) || borsh({ message: string, nonce: [u8; 32],
// recipient: string, callbackUrl: Option<string> }) ), signed with the account's key.
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { Nep413Proof } from '@petal/core/types';
import { base58, base64 } from '@scure/base';
import { JsonRpcProvider, type Provider, PublicKey } from 'near-api-js';
import { verifyMessage } from 'near-api-js/nep413';
import { AccessKeyDoesNotExistError, AccountDoesNotExistError } from 'near-api-js/rpc-errors';
import { describe, NearError } from '../errors.ts';
import { type NearNetwork, RPC_URLS } from '../network.ts';
import type { AccessKeyView, Rpc, RpcQuery } from './index.ts';
import { defaultNonces, NONCE_BYTES, type NonceStore } from './nonce.ts';

/** 2^31 + 413: the NEP-413 prefix tag. */
export const NEP413_TAG = 2147484061;

export interface Nep413Payload {
  message: string;
  /** 32 bytes, or their base64 */
  nonce: Uint8Array | string;
  recipient: string;
  callbackUrl?: string | null;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}
function str(s: string): Uint8Array {
  const bytes = utf8ToBytes(s);
  return concat(u32(bytes.length), bytes);
}
export const nonceBytes = (n: Uint8Array | string) =>
  typeof n === 'string' ? base64.decode(n) : n;

/** The borsh bytes a NEP-413 signature covers, before hashing. */
export function nep413Payload(p: Nep413Payload): Uint8Array {
  const nonce = nonceBytes(p.nonce);
  if (nonce.length !== NONCE_BYTES)
    throw new Error(`NEP-413 nonce must be exactly ${NONCE_BYTES} bytes, got ${nonce.length}`);
  const callback =
    p.callbackUrl == null ? new Uint8Array([0]) : concat(new Uint8Array([1]), str(p.callbackUrl));
  return concat(u32(NEP413_TAG), str(p.message), nonce, str(p.recipient), callback);
}

export function nep413Hash(p: Nep413Payload): Uint8Array {
  return sha256(nep413Payload(p));
}

/** A NEAR JSON-RPC client that fits `Rpc` (view_access_key and other queries). */
export function nearRpc(network: NearNetwork | { url: string }): Rpc {
  const url = typeof network === 'string' ? RPC_URLS[network] : network.url;
  const provider = new JsonRpcProvider({ url });
  return {
    query: <T = unknown>(params: RpcQuery) =>
      provider.query(params as unknown as Parameters<JsonRpcProvider['query']>[0]) as Promise<T>,
  };
}

/** Thrown by the RPC adapter, so RPC failures are told apart from verification failures. */
class RpcFailure extends Error {
  readonly inner: unknown;
  constructor(inner: unknown) {
    super(describe(inner));
    this.inner = inner;
  }
}

const missingKey = (e: unknown) =>
  e instanceof AccessKeyDoesNotExistError ||
  (e as { type?: unknown }).type === 'AccessKeyDoesNotExist' ||
  /UNKNOWN_ACCESS_KEY|access key .* does not exist/i.test(describe(e));
const missingAccount = (e: unknown) =>
  e instanceof AccountDoesNotExistError ||
  (e as { type?: unknown }).type === 'AccountDoesNotExist' ||
  /UNKNOWN_ACCOUNT|account .* does not exist/i.test(describe(e));

/** near-api-js verifyMessage asks a Provider for viewAccessKey; answer it through our Rpc. */
function providerFor(rpc: Rpc): Provider {
  const viewAccessKey = async ({
    accountId,
    publicKey,
  }: {
    accountId: string;
    publicKey: PublicKey | string;
  }) => {
    try {
      return await rpc.query<AccessKeyView>({
        request_type: 'view_access_key',
        finality: 'final',
        account_id: accountId,
        public_key: publicKey.toString(),
      });
    } catch (e) {
      throw new RpcFailure(e);
    }
  };
  return { viewAccessKey } as unknown as Provider;
}

/** ed25519, secp256k1 (with recovery byte), ML-DSA-65 */
const SIGNATURE_SIZES = [64, 65, 3309];

/** base64 per NEP-413; base58 from some older wallets (unverified). A base58 string can also
 * parse as base64, so the decoding whose length is a signature size wins. */
function decodeSignature(s: string): Uint8Array | null {
  const tries: Uint8Array[] = [];
  for (const codec of [base64, base58]) {
    try {
      tries.push(codec.decode(s));
    } catch {}
  }
  return tries.find((b) => SIGNATURE_SIZES.includes(b.length)) ?? tries[0] ?? null;
}

const fail = (reason: string) => ({ ok: false, reason });

/** Checks the signature, then view_access_key: the key must be a full-access key of account_id. */
export async function verifyNep413(
  proof: Nep413Proof,
  expect: { message: string; recipient: string },
  rpc: Rpc,
  opts: { nonces?: NonceStore } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const nonces = opts.nonces ?? defaultNonces;
  const p = (proof ?? {}) as Partial<Nep413Proof>;
  if (
    p.type !== 'nep413' ||
    typeof p.account_id !== 'string' ||
    typeof p.public_key !== 'string' ||
    typeof p.signature !== 'string' ||
    typeof p.nonce !== 'string'
  )
    return fail('not a NEP-413 proof');
  if (p.message !== expect.message) return fail('the signed message is not the one Petal issued');
  if (p.recipient !== expect.recipient) return fail(`the recipient must be ${expect.recipient}`);

  let nonce: Uint8Array;
  try {
    nonce = base64.decode(p.nonce);
  } catch {
    return fail('the nonce is not base64');
  }
  if (nonce.length !== NONCE_BYTES) return fail(`the nonce must be ${NONCE_BYTES} bytes`);
  const signature = decodeSignature(p.signature);
  if (!signature) return fail('the signature is not base64');
  let publicKey: PublicKey;
  try {
    publicKey = PublicKey.from(p.public_key);
  } catch {
    return fail('the public key does not parse');
  }
  const payload = { message: expect.message, recipient: expect.recipient, nonce };
  let signed = false;
  try {
    signed = publicKey.verify(nep413Hash(payload), signature);
  } catch {}
  if (!signed) return fail('the signature does not match');

  const check = nonces.reserve(p.nonce);
  if (check === 'unknown') return fail('the nonce was not issued by this server');
  if (check === 'used') return fail('the nonce was already used');
  if (check === 'expired') return fail('the nonce expired; ask for a new one');

  try {
    await verifyMessage({
      signerAccountId: p.account_id,
      signerPublicKey: p.public_key,
      payload,
      signature,
      provider: providerFor(rpc),
    });
  } catch (e) {
    nonces.release(p.nonce);
    if (e instanceof RpcFailure) {
      if (missingKey(e.inner)) return fail(`the key is not a key of ${p.account_id}`);
      if (missingAccount(e.inner)) return fail(`the account ${p.account_id} does not exist`);
      throw new NearError('source_failed', `NEP-413 check: RPC failed: ${e.message}`, {
        cause: e.inner,
      });
    }
    if (/FullAccess/.test(describe(e)))
      return fail(`the key is not a full-access key of ${p.account_id}`);
    return fail(`the proof does not verify: ${describe(e)}`);
  }
  nonces.spend(p.nonce);
  return { ok: true };
}
