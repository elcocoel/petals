// Test helpers for NEP-413 (T022): a deterministic test signer and a fake RPC whose
// view_access_key answers full-access or function-call. Import from @petal/near/auth/testing in
// tests only; never from product code.
//
// The signer's key is derived from a seed at run time (sha256("petal-test-signer:" + seed)), so no
// private key is ever written in the repo. It signs exactly as a NEAR wallet does (NEP-413):
//   sha256( borsh(u32 2^31+413) || borsh({ message: string, nonce: [u8; 32], recipient: string,
//           callbackUrl: Option<string> }) ), signed with ed25519.
// noble 2.x needs the .js subpaths: @noble/curves/ed25519.js, @noble/hashes/sha2.js.
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { Nep413Proof } from '@petal/core/types';
import { base58, base64 } from '@scure/base';
import type { AccessKeyPermission, AccessKeyView, Rpc, RpcQuery } from './index.ts';

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
function str(s: string): Uint8Array {
  const bytes = utf8ToBytes(s);
  return concat(u32(bytes.length), bytes);
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
const nonceBytes = (n: Uint8Array | string) => (typeof n === 'string' ? base64.decode(n) : n);

/** The borsh bytes a NEP-413 signature covers, before hashing. */
export function nep413Payload(p: Nep413Payload): Uint8Array {
  const nonce = nonceBytes(p.nonce);
  if (nonce.length !== 32)
    throw new Error(`NEP-413 nonce must be exactly 32 bytes, got ${nonce.length}`);
  const callback =
    p.callbackUrl == null ? new Uint8Array([0]) : concat(new Uint8Array([1]), str(p.callbackUrl));
  return concat(u32(NEP413_TAG), str(p.message), nonce, str(p.recipient), callback);
}

export function nep413Hash(p: Nep413Payload): Uint8Array {
  return sha256(nep413Payload(p));
}

export interface TestSigner {
  accountId: string;
  /** ed25519:<base58> */
  publicKey: string;
  /** Sign like a wallet: returns the proof Petal stores in an entry. */
  sign(p: Nep413Payload): Nep413Proof;
}

/** A deterministic signer for `accountId`; another seed gives another key for the same account. */
export function testSigner(accountId = 'maker.testnet', seed: string = accountId): TestSigner {
  const secretKey = sha256(utf8ToBytes(`petal-test-signer:${seed}`));
  const publicKey = `ed25519:${base58.encode(ed25519.getPublicKey(secretKey))}`;
  return {
    accountId,
    publicKey,
    sign(p) {
      const nonce = nonceBytes(p.nonce);
      return {
        type: 'nep413',
        account_id: accountId,
        public_key: publicKey,
        signature: base64.encode(ed25519.sign(nep413Hash(p), secretKey)),
        message: p.message,
        nonce: base64.encode(nonce),
        recipient: p.recipient,
      };
    },
  };
}

/** Check a proof's signature only (no RPC); what verifyNep413 does before view_access_key. */
export function signatureMatches(
  proof: Nep413Proof,
  expect: { message: string; recipient: string },
): boolean {
  if (!proof.public_key.startsWith('ed25519:')) return false;
  try {
    const hash = nep413Hash({
      message: expect.message,
      nonce: proof.nonce,
      recipient: expect.recipient,
    });
    return ed25519.verify(
      base64.decode(proof.signature),
      hash,
      base58.decode(proof.public_key.slice(8)),
    );
  } catch {
    return false;
  }
}

/** A function-call permission like Petal's writer key: one receiver, __fastdata_kv only. */
export function functionCall(
  receiver = 'petals.testnet',
  methods = ['__fastdata_kv'],
): AccessKeyPermission {
  return {
    FunctionCall: {
      allowance: '1000000000000000000000000',
      receiver_id: receiver,
      method_names: methods,
    },
  };
}

export type FakeRpc = Rpc & { calls: RpcQuery[] };

/**
 * A fake NEAR RPC. `keys[account][publicKey]` is the key's permission; anything else answers like
 * NEAR does for a missing key (an error of type AccessKeyDoesNotExist).
 */
export function fakeRpc(keys: Record<string, Record<string, AccessKeyPermission>>): FakeRpc {
  const calls: RpcQuery[] = [];
  return {
    calls,
    async query<T = unknown>(params: RpcQuery): Promise<T> {
      calls.push(params);
      if (params.request_type !== 'view_access_key') {
        throw new Error(`fakeRpc: only view_access_key is faked, not ${params.request_type}`);
      }
      const permission = keys[String(params.account_id)]?.[String(params.public_key)];
      if (!permission) {
        throw Object.assign(new Error(`access key ${String(params.public_key)} does not exist`), {
          type: 'AccessKeyDoesNotExist',
        });
      }
      const view: AccessKeyView = {
        nonce: 1,
        permission,
        block_height: 200_000_000,
        block_hash: '11111111111111111111111111111111',
      };
      return view as T;
    },
  };
}

/** fakeRpc for signers: each one's key is full-access unless listed in `functionCallOnly`. */
export function fakeRpcFor(signers: TestSigner[], functionCallOnly: TestSigner[] = []): FakeRpc {
  const keys: Record<string, Record<string, AccessKeyPermission>> = {};
  for (const s of signers) {
    keys[s.accountId] ??= {};
    keys[s.accountId][s.publicKey] = functionCallOnly.includes(s) ? functionCall() : 'FullAccess';
  }
  return fakeRpc(keys);
}
