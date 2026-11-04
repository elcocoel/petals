// A fake NEAR RPC for the writer, as a near-api-js Provider: viewAccessKey, viewBlock and
// sendTransactionUntil. It decodes every signed transaction, checks its signature, nonce and
// signer key, and answers like testnet does for a receiver with no contract: a receipt that fails
// with CodeDoesNotExist. Accepted __fastdata_kv calls are handed to a fake FastData indexer.
// Keys come from seeds at run time, so no private key is ever written in the repo.
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';
import {
  decodeSignedTransaction,
  encodeTransaction,
  type KeyPairString,
  type Provider,
} from 'near-api-js';
import type { AccessKeyPermission } from '../../src/auth/index.ts';
import type { FakeFastData } from './fake-fastdata.ts';

/** A deterministic ed25519 key from a seed: the near-cli key string and its public key. */
export function seededKey(seed: string): { secretKey: KeyPairString; publicKey: string } {
  const sk = sha256(utf8ToBytes(`petal-test-writer:${seed}`));
  const pk = ed25519.getPublicKey(sk);
  const both = new Uint8Array(64);
  both.set(sk);
  both.set(pk, 32);
  return {
    secretKey: `ed25519:${base58.encode(both)}` as KeyPairString,
    publicKey: `ed25519:${base58.encode(pk)}`,
  };
}

export interface SentCall {
  signer: string;
  publicKey: string;
  receiver: string;
  nonce: bigint;
  method: string;
  /** the args bytes as text */
  args: string;
  gas: bigint;
  deposit: bigint;
  actions: number;
  tx_hash: string;
}

export type ChainMode =
  | 'no-contract' // the receipt fails with CodeDoesNotExist (testnet, petals.testnet)
  | 'no-account' // the receiver does not exist
  | 'other-failure' // a real execution failure
  | 'rpc-down' // sendTransactionUntil throws
  | 'not-indexed'; // the call lands but FastData never shows it

export interface FakeChain {
  provider: Provider;
  sent: SentCall[];
  mode: ChainMode;
  /** view_access_key calls */
  keyViews: number;
}

export function fakeChain(
  keys: Record<string, Record<string, AccessKeyPermission>>,
  kv?: FakeFastData,
  opts: { startBlock?: number; startTimeNs?: number } = {},
): FakeChain {
  const nonces = new Map<string, bigint>();
  let height = opts.startBlock ?? 230_000_000;
  const startNs = opts.startTimeNs ?? Date.UTC(2026, 10, 4) * 1e6;
  const chain: FakeChain = {
    sent: [],
    mode: 'no-contract',
    keyViews: 0,
    provider: undefined as unknown as Provider,
  };

  const provider = {
    async viewAccessKey({ accountId, publicKey }: { accountId: string; publicKey: unknown }) {
      chain.keyViews++;
      const pk = String(publicKey);
      const permission = keys[accountId]?.[pk];
      if (!permission)
        throw Object.assign(new Error(`access key ${pk} does not exist`), {
          type: 'AccessKeyDoesNotExist',
        });
      return {
        nonce: nonces.get(`${accountId}/${pk}`) ?? 100n,
        permission,
        block_height: height,
        block_hash: base58.encode(new Uint8Array(32).fill(1)),
      };
    },
    async viewBlock() {
      return { header: { height, hash: base58.encode(new Uint8Array(32).fill(height % 251)) } };
    },
    async sendTransactionUntil(signed: { encode(): Uint8Array }) {
      if (chain.mode === 'rpc-down') throw new Error('fetch failed: connect ECONNREFUSED');
      const decoded = decodeSignedTransaction(signed.encode());
      const tx = decoded.transaction as unknown as {
        signerId: string;
        receiverId: string;
        nonce: bigint;
        publicKey: { toString(): string; data: Uint8Array };
        actions: {
          functionCall?: { methodName: string; args: number[]; gas: bigint; deposit: bigint };
        }[];
      };
      const hash = sha256(encodeTransaction(decoded.transaction));
      const sig = (decoded.signature as unknown as { ed25519Signature: { data: number[] } })
        .ed25519Signature.data;
      const pk = tx.publicKey.toString();
      if (!keys[tx.signerId]?.[pk]) throw new Error('InvalidAccessKeyError: key not on account');
      if (!ed25519.verify(Uint8Array.from(sig), hash, Uint8Array.from(tx.publicKey.data)))
        throw new Error('InvalidSignature');
      const last = nonces.get(`${tx.signerId}/${pk}`) ?? 100n;
      if (tx.nonce <= last) throw new Error('InvalidNonce');
      nonces.set(`${tx.signerId}/${pk}`, tx.nonce);
      const fc = tx.actions[0]?.functionCall;
      if (!fc) throw new Error('fakeChain: only function calls');
      const tx_hash = base58.encode(hash);
      const args = new TextDecoder().decode(Uint8Array.from(fc.args));
      chain.sent.push({
        signer: tx.signerId,
        publicKey: pk,
        receiver: tx.receiverId,
        nonce: tx.nonce,
        method: fc.methodName,
        args,
        gas: fc.gas,
        deposit: fc.deposit,
        actions: tx.actions.length,
        tx_hash,
      });
      height += 2;
      const receiptBlock = height + 1;
      if (
        chain.mode !== 'not-indexed' &&
        chain.mode !== 'other-failure' &&
        fc.methodName === '__fastdata_kv'
      ) {
        kv?.index({
          receiver: tx.receiverId,
          writer: tx.signerId,
          signer: tx.signerId,
          tx_hash,
          receipt_id: base58.encode(sha256(hash)),
          block_height: receiptBlock,
          block_timestamp: startNs + receiptBlock * 600_000_000,
          entries: JSON.parse(args) as Record<string, unknown>,
        });
      }
      const kind =
        chain.mode === 'no-account'
          ? { AccountDoesNotExist: { account_id: tx.receiverId } }
          : chain.mode === 'other-failure'
            ? { FunctionCallError: { ExecutionError: 'Smart contract panicked' } }
            : {
                FunctionCallError: {
                  CompilationError: { CodeDoesNotExist: { account_id: tx.receiverId } },
                },
              };
      return {
        status: { Failure: { ActionError: { index: 0, kind } } },
        transaction: { hash: tx_hash, signer_id: tx.signerId, receiver_id: tx.receiverId },
        transaction_outcome: { id: tx_hash, block_hash: base58.encode(new Uint8Array(32)) },
        receipts_outcome: [],
        final_execution_status: 'EXECUTED_OPTIMISTIC',
      };
    },
  };
  chain.provider = provider as unknown as Provider;
  return chain;
}
