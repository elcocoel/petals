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
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Nep413Proof } from '@petal/core/types';
import { base58, base64 } from '@scure/base';
import { RPC_URLS } from '../network.ts';
import type { AccessKeyPermission, AccessKeyView, Rpc, RpcQuery } from './index.ts';
import { type Nep413Payload, nep413Hash, nonceBytes } from './nep413.ts';

export { NEP413_TAG, type Nep413Payload, nep413Hash, nep413Payload } from './nep413.ts';

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

/** A signer whose account is implicit: its id is the hex of its public key, as on NEAR. */
export function implicitSigner(seed = 'implicit'): TestSigner {
  const secretKey = sha256(utf8ToBytes(`petal-test-signer:${seed}`));
  const hex = Array.from(ed25519.getPublicKey(secretKey), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return testSigner(hex, seed);
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
 * NEAR does for a missing key (an error of type AccessKeyDoesNotExist). An account exists when it
 * has an entry in `keys`; view_account answers for it, or fails like NEAR for a missing account.
 */
export function fakeRpc(keys: Record<string, Record<string, AccessKeyPermission>>): FakeRpc {
  const calls: RpcQuery[] = [];
  return {
    calls,
    async query<T = unknown>(params: RpcQuery): Promise<T> {
      calls.push(params);
      if (params.request_type === 'view_account') {
        if (keys[String(params.account_id)]) return { amount: '0', block_height: 1 } as T;
        throw Object.assign(new Error(`account ${String(params.account_id)} does not exist`), {
          type: 'AccountDoesNotExist',
        });
      }
      if (params.request_type !== 'view_access_key') {
        throw new Error(`fakeRpc: ${params.request_type} is not faked`);
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

/** One action a test wallet sends, as near-connect passes it: a transfer, or a call with NEAR attached. */
export type TestnetAction =
  | { type: 'Transfer'; params: { deposit: string } }
  | {
      type: 'FunctionCall';
      params: {
        methodName: string;
        args?: Record<string, unknown>;
        gas?: string;
        deposit?: string;
      };
    };

/**
 * A test wallet's real transaction on testnet (9 Nov, the pay step): `implicitSigner(seed)`'s account sends
 * one action to `receiverId` and waits for the FINAL outcome, which it returns as a wallet would. A call is
 * how it deposits into or withdraws from the credit contract. Testnet only: the key is derived from a public
 * seed, so anyone could spend what it holds. Its account must hold testnet NEAR first.
 */
export async function testnetSend(
  seed: string,
  receiverId: string,
  action: TestnetAction,
): Promise<{
  transaction: { hash: string };
  transaction_outcome: { id: string };
  status: unknown;
}> {
  if (action.type === 'Transfer') return testnetTransfer(seed, receiverId, action.params.deposit);
  const { methodName, args = {}, gas = '30000000000000', deposit = '0' } = action.params;
  if (!/^\d+$/.test(gas) || !/^\d+$/.test(deposit))
    throw new Error('gas and deposit are yocto strings');
  const { Account, actions, JsonRpcProvider, KeyPair, KeyPairSigner } = await import('near-api-js');
  const secretKey = sha256(utf8ToBytes(`petal-test-signer:${seed}`));
  const both = new Uint8Array([...secretKey, ...ed25519.getPublicKey(secretKey)]);
  const keyPair = KeyPair.fromString(`ed25519:${base58.encode(both)}` as `ed25519:${string}`);
  const account = new Account(
    implicitSigner(seed).accountId,
    new JsonRpcProvider({ url: RPC_URLS.testnet }),
    new KeyPairSigner(keyPair),
  );
  return (await account.signAndSendTransaction({
    receiverId,
    actions: [actions.functionCall(methodName, args, BigInt(gas), BigInt(deposit))],
    waitUntil: 'FINAL',
    throwOnFailure: false,
  })) as unknown as {
    transaction: { hash: string };
    transaction_outcome: { id: string };
    status: unknown;
  };
}

/**
 * A test wallet's real transfer on testnet (9 Nov, the pay step): `implicitSigner(seed)`'s account sends
 * `yocto` to `receiverId` and waits for the FINAL outcome, which it returns as a wallet would. Testnet only:
 * the key is derived from a public seed, so anyone could spend what it holds. Its account must hold
 * testnet NEAR first.
 */
export async function testnetTransfer(
  seed: string,
  receiverId: string,
  yocto: string,
): Promise<{
  transaction: { hash: string };
  transaction_outcome: { id: string };
  status: unknown;
}> {
  if (!/^\d+$/.test(yocto) || yocto === '0') throw new Error('a transfer moves some yoctoNEAR');
  const { Account, actions, JsonRpcProvider, KeyPair, KeyPairSigner } = await import('near-api-js');
  const secretKey = sha256(utf8ToBytes(`petal-test-signer:${seed}`));
  const publicKey = ed25519.getPublicKey(secretKey);
  const both = new Uint8Array([...secretKey, ...publicKey]);
  const keyPair = KeyPair.fromString(`ed25519:${base58.encode(both)}` as `ed25519:${string}`);
  const { accountId } = implicitSigner(seed);
  const provider = new JsonRpcProvider({ url: RPC_URLS.testnet });
  const account = new Account(accountId, provider, new KeyPairSigner(keyPair));
  const outcome = (await account.signAndSendTransaction({
    receiverId,
    actions: [actions.transfer(BigInt(yocto))],
    waitUntil: 'FINAL',
  })) as unknown as {
    transaction: { hash: string };
    transaction_outcome: { id: string };
    status: unknown;
  };
  return outcome;
}

/** An EVM wallet for tests: its address, and personal_sign as a wallet does it (EIP-191, r||s||v). */
export function evmTestSigner(seed = 'evm'): { address: string; sign(message: string): string } {
  const secretKey = sha256(utf8ToBytes(`petal-test-signer:evm:${seed}`));
  const key = secp256k1.getPublicKey(secretKey, false).slice(1);
  const address = `0x${bytesToHex(keccak_256(key).slice(-20))}`;
  return {
    address,
    sign(message) {
      const bytes = utf8ToBytes(message);
      const digest = keccak_256(
        new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${bytes.length}`), ...bytes]),
      );
      const s = secp256k1.sign(digest, secretKey, { prehash: false, format: 'recovered' });
      return `0x${bytesToHex(s.slice(1))}${(27 + (s[0] as number)).toString(16)}`;
    },
  };
}

/** A Solana wallet for tests: its address (base58), and signMessage as a wallet does it (ed25519, base64). */
export function solanaTestSigner(seed = 'solana'): {
  address: string;
  sign(message: string): string;
} {
  const secretKey = sha256(utf8ToBytes(`petal-test-signer:solana:${seed}`));
  return {
    address: base58.encode(ed25519.getPublicKey(secretKey)),
    sign: (message) => base64.encode(ed25519.sign(utf8ToBytes(message), secretKey)),
  };
}
