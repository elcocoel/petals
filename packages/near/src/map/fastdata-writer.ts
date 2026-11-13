// fastDataWriter (T039): Petal's writer on the shared map (shared-map.md, Writing). One
// `__fastdata_kv` function call per write: 1 Ggas, deposit 0, to a receiver that has no contract,
// signed with a function-call key limited to that receiver and that method.
//
// The traps:
// - The receipt fails with CodeDoesNotExist because there is no contract. That is the expected
//   outcome: FastData indexes the call anyway. So throwOnFailure is false and the failure is
//   classified; it is never retried.
// - Attach 1 Ggas, never the 30 Tgas default: the key's allowance is reserved against prepaid gas.
// - Confirm through the KV API, never through the transaction status: poll the key's history until
//   a row with this transaction's hash appears (up to 30 s).
//
// The key file (PETAL_WRITER_KEY_FILE, outside the repo) is the near-cli JSON form:
//   { "account_id": "petals-writer.testnet", "public_key": "ed25519:…", "private_key": "ed25519:…" }
// It is read on the first write, and the key is checked on chain first: Petal refuses to write
// with a full-access key or with a function-call key that allows anything but __fastdata_kv on
// the receiver.
import { readFile } from 'node:fs/promises';
import { canonicalJson } from '@petal/core';
import {
  Account,
  actions,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  type KeyPairString,
  type Provider,
} from 'near-api-js';
import { AccessKeyDoesNotExistError } from 'near-api-js/rpc-errors';
import { describe, NearError } from '../errors.ts';
import { RPC_URLS } from '../network.ts';
import { type KvDeps, kvClient, seg } from './fastdata-kv.ts';
import type { MapWriter } from './index.ts';
import { checkWrite, MAX_ARGS_BYTES, utf8Length } from './limits.ts';

export const FASTDATA_METHOD = '__fastdata_kv';
/** 1 Ggas, as near.social attaches. */
export const FASTDATA_GAS = 1_000_000_000n;

export interface WriterDeps {
  /** a near-api-js Provider; default a JsonRpcProvider on rpcUrl */
  provider?: Provider;
  /** default RPC_URLS.testnet */
  rpcUrl?: string;
  /** the KV API used to confirm writes */
  kv?: KvDeps;
  /** default 30 s */
  confirmTimeoutMs?: number;
  /** default 1 s */
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface KeyFile {
  account_id?: unknown;
  public_key?: unknown;
  private_key?: unknown;
  secret_key?: unknown;
}

/** Read the writer's key file. Errors never carry key material. */
export async function loadWriterKey(
  keyFile: string,
  writer: string,
): Promise<{ signer: KeyPairSigner; publicKey: string }> {
  let parsed: KeyFile;
  try {
    parsed = JSON.parse(await readFile(keyFile, 'utf8')) as KeyFile;
  } catch (e) {
    const what = (e as NodeJS.ErrnoException).code ?? 'not JSON';
    throw new NearError('internal', `writer key file ${keyFile}: cannot read (${what})`);
  }
  const secret = parsed.private_key ?? parsed.secret_key;
  if (typeof secret !== 'string' || !secret.startsWith('ed25519:'))
    throw new NearError('internal', `writer key file ${keyFile}: no ed25519 private_key`);
  if (parsed.account_id !== undefined && parsed.account_id !== writer)
    throw new NearError(
      'internal',
      `writer key file ${keyFile} is for ${String(parsed.account_id)}, not ${writer}`,
    );
  let keyPair: KeyPair;
  try {
    keyPair = KeyPair.fromString(secret as KeyPairString);
  } catch {
    throw new NearError('internal', `writer key file ${keyFile}: private_key does not parse`);
  }
  const publicKey = keyPair.getPublicKey().toString();
  if (parsed.public_key !== undefined && parsed.public_key !== publicKey)
    throw new NearError('internal', `writer key file ${keyFile}: public_key does not match`);
  return { signer: new KeyPairSigner(keyPair), publicKey };
}

/** The key may only call __fastdata_kv on the receiver: never a full-access key. */
export function checkWriterPermission(permission: unknown, receiver: string): string | null {
  if (permission === 'FullAccess')
    return 'is a full-access key; Petals holds only a function-call key';
  const fc = (permission as { FunctionCall?: { receiver_id?: unknown; method_names?: unknown } })
    ?.FunctionCall;
  if (!fc) return 'has an unknown permission';
  if (fc.receiver_id !== receiver)
    return `is limited to ${String(fc.receiver_id)}, not ${receiver}`;
  const methods = fc.method_names;
  if (!Array.isArray(methods) || methods.length !== 1 || methods[0] !== FASTDATA_METHOD)
    return `must allow exactly ${FASTDATA_METHOD}, not ${JSON.stringify(methods)}`;
  return null;
}

type Failure = { ActionError?: { kind?: Record<string, unknown> } } & Record<string, unknown>;

/** The receipt failures that mean "no contract here": FastData indexed the call anyway. */
export function isExpectedFailure(failure: Failure): boolean {
  const kind = failure.ActionError?.kind;
  if (!kind) return false;
  if ('AccountDoesNotExist' in kind) return true;
  const fn = kind.FunctionCallError as
    | { CompilationError?: { CodeDoesNotExist?: unknown }; MethodResolveError?: unknown }
    | undefined;
  return Boolean(
    fn?.CompilationError?.CodeDoesNotExist || fn?.MethodResolveError === 'MethodNotFound',
  );
}

/** What signAndSendTransaction resolves to, as far as Petal reads it. */
interface TxOutcome {
  status: unknown;
  transaction_outcome: { id: string };
}

function failureOf(outcome: TxOutcome): Failure | null {
  const status = outcome.status as unknown;
  if (typeof status === 'object' && status !== null && 'Failure' in status)
    return (status as { Failure: Failure }).Failure;
  return null;
}

export function fastDataWriter(
  cfg: { network: 'testnet'; receiver: string; writer: string; keyFile: string },
  deps: WriterDeps = {},
): MapWriter {
  if (cfg.network !== 'testnet')
    throw new NearError(
      'internal',
      'fastDataWriter: testnet only; mainnet writes need the operator’s OK',
    );
  const provider = deps.provider ?? new JsonRpcProvider({ url: deps.rpcUrl ?? RPC_URLS.testnet });
  const kv = kvClient(cfg.network, deps.kv);
  const confirmTimeoutMs = deps.confirmTimeoutMs ?? 30_000;
  const pollMs = deps.pollMs ?? 1_000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let ready: Promise<Account> | null = null;
  const account = (): Promise<Account> => {
    if (ready) return ready;
    ready = (async () => {
      const { signer, publicKey } = await loadWriterKey(cfg.keyFile, cfg.writer);
      let permission: unknown;
      try {
        ({ permission } = await provider.viewAccessKey({
          accountId: cfg.writer,
          publicKey,
          finalityQuery: { finality: 'final' },
        }));
      } catch (e) {
        if (
          e instanceof AccessKeyDoesNotExistError ||
          (e as { type?: unknown }).type === 'AccessKeyDoesNotExist'
        )
          throw new NearError('internal', `writer key ${publicKey} is not a key of ${cfg.writer}`);
        throw new NearError('source_failed', `writer key check: ${describe(e)}`, { cause: e });
      }
      const problem = checkWriterPermission(permission, cfg.receiver);
      if (problem) throw new NearError('internal', `writer key ${publicKey} ${problem}`);
      return new Account(cfg.writer, provider, signer);
    })();
    ready.catch(() => {
      ready = null; // try again on the next write
    });
    return ready;
  };

  /** Poll the key's history for a row with this transaction's hash. */
  async function confirm(key: string, txHash: string): Promise<number | null> {
    const path = `/v0/history/${seg(cfg.receiver)}/${seg(cfg.writer)}`;
    const deadline = Date.now() + confirmTimeoutMs;
    const attempts = Math.max(1, Math.floor(confirmTimeoutMs / pollMs) + 1);
    for (let i = 1; ; i++) {
      try {
        const page = await kv.post(path, { key, include_metadata: true, limit: 20 });
        const row = page.entries.find((e) => e.tx_hash === txHash && e.key === key);
        if (row) return row.block_height;
      } catch {
        // FastData may lag or blip; keep polling until the deadline
      }
      if (i >= attempts || Date.now() + pollMs > deadline) return null;
      await sleep(pollMs);
    }
  }

  return {
    async write(entries) {
      checkWrite(entries);
      const args = canonicalJson(entries);
      if (utf8Length(args) > MAX_ARGS_BYTES)
        throw new Error(`map write: ${utf8Length(args)} bytes, over the 1.5 MiB transaction limit`);
      const acct = await account();
      let outcome: TxOutcome;
      try {
        outcome = await acct.signAndSendTransaction({
          receiverId: cfg.receiver,
          actions: [
            actions.functionCall(FASTDATA_METHOD, new TextEncoder().encode(args), FASTDATA_GAS, 0n),
          ],
          throwOnFailure: false,
          waitUntil: 'EXECUTED_OPTIMISTIC',
        });
      } catch (e) {
        throw new NearError('source_failed', `map write: ${describe(e)}`, { cause: e });
      }
      const tx_hash = outcome.transaction_outcome.id;
      const failure = failureOf(outcome);
      if (failure && !isExpectedFailure(failure))
        throw new NearError('source_failed', `map write failed: ${JSON.stringify(failure)}`, {
          tx_hash,
        });
      const firstKey = Object.keys(entries)[0] as string;
      const block_height = await confirm(firstKey, tx_hash);
      if (block_height === null)
        throw new NearError(
          'source_failed',
          `map write sent (tx ${tx_hash}) but FastData did not show it within ${confirmTimeoutMs / 1000} s`,
          { tx_hash, hint: 'the write may still land; check the explorer before writing again' },
        );
      return { tx_hash, block_height };
    },
  };
}
