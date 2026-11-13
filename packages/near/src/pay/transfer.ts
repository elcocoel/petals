// readTransfer (specs/003-target/proposal-payment.md): what a NEAR transaction moved, read back from
// the chain. A person pays for Petals' agent with one plain NEAR transfer from their own wallet to Petals'
// account. The server holds no key: it only looks the transaction up. It asks for the FINAL outcome, so a
// transfer is counted only once it can't be undone, and an RPC node that hasn't seen it yet waits for it.

import { describe, NearError } from '../errors.ts';
import type { NearNetwork } from '../network.ts';
import { ARCHIVAL_RPC_URLS } from '../network.ts';

/** Where a person's NEAR goes, per network: Petals' own accounts (T147). */
export const PAY_RECEIVER: Record<NearNetwork, string> = {
  mainnet: 'petals.near',
  testnet: 'petals.testnet',
};

/** A transaction hash: 32 bytes in base58. */
export const TX_HASH = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

export interface Transfer {
  tx_hash: string;
  signer_id: string;
  receiver_id: string;
  /** what its Transfer actions, and the NEAR its function calls carried, moved, in yoctoNEAR, as a decimal string */
  yocto: string;
  /** the methods its function calls named: `deposit`, for the credit contract */
  methods: string[];
  /** the whole transaction succeeded, its receipts included */
  succeeded: boolean;
}

interface TxView {
  status?: { SuccessValue?: string; Failure?: unknown } | string;
  transaction?: {
    hash?: string;
    signer_id?: string;
    receiver_id?: string;
    actions?: (
      | string
      | {
          Transfer?: { deposit?: string };
          FunctionCall?: { method_name?: string; deposit?: string };
        }
    )[];
  };
}

export interface TransferDeps {
  fetch?: typeof fetch;
  /** the RPC address; default ARCHIVAL_RPC_URLS[network], which still has a transfer days later */
  url?: string;
}

/** NEAR in yoctoNEAR (10^24 of them), to NEAR with six decimals. */
export function yoctoToNear(yocto: string): number {
  return Number(BigInt(yocto) / 10n ** 18n) / 1e6;
}

/** The transfer `txHash` made, sent by `sender`. Throws a NearError when it can't be read. */
export async function readTransfer(
  network: NearNetwork,
  txHash: string,
  sender: string,
  deps: TransferDeps = {},
): Promise<Transfer> {
  if (!TX_HASH.test(txHash))
    throw new NearError('bad_input', 'tx_hash is not a NEAR transaction hash');
  const transport = deps.fetch ?? globalThis.fetch;
  let body: { result?: TxView; error?: { cause?: { name?: string } } };
  try {
    const res = await transport(deps.url ?? ARCHIVAL_RPC_URLS[network], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'petal',
        method: 'tx',
        params: { tx_hash: txHash, sender_account_id: sender, wait_until: 'FINAL' },
      }),
    });
    body = (await res.json()) as typeof body;
  } catch (e) {
    throw new NearError(
      'source_failed',
      `Couldn't reach NEAR to read the transaction: ${describe(e)}`,
    );
  }
  const cause = body.error?.cause?.name;
  if (cause === 'UNKNOWN_TRANSACTION' || cause === 'TIMEOUT_ERROR') {
    throw new NearError(
      'not_found',
      `NEAR has no transaction ${txHash} from ${sender} on ${network}.`,
    );
  }
  const tx = body.result?.transaction;
  if (!tx) {
    throw new NearError(
      'source_failed',
      `NEAR couldn't say what ${txHash} did (${cause ?? 'no answer'}).`,
    );
  }
  let yocto = 0n;
  const methods: string[] = [];
  for (const a of tx.actions ?? []) {
    if (typeof a !== 'object') continue;
    const deposit = a.Transfer?.deposit ?? a.FunctionCall?.deposit;
    if (deposit && /^\d+$/.test(deposit)) yocto += BigInt(deposit);
    if (a.FunctionCall?.method_name) methods.push(a.FunctionCall.method_name);
  }
  const status = body.result?.status;
  return {
    tx_hash: tx.hash ?? txHash,
    signer_id: tx.signer_id ?? '',
    receiver_id: tx.receiver_id ?? '',
    yocto: yocto.toString(),
    methods,
    succeeded: typeof status === 'object' && status !== null && 'SuccessValue' in status,
  };
}

/** NEAR Intents' contract: a wallet that pays from what it holds there (near.com's) has it send the NEAR. */
export const INTENTS = 'intents.near';

/**
 * A payment made from NEAR Intents: `txHash` is intents.near's `execute_intents`, and among what it executed is
 * a `native_withdraw` to `receiver` signed by `signer`. near.com's wallet pays this way, from the NEAR it holds
 * in NEAR Intents, so the transaction is intents.near's own, not the person's. The contract checked each
 * signature before executing, and the whole call succeeds or fails together, so a successful one paid
 * `receiver` what those withdraws name. Read as a Transfer from `signer` to `receiver`; a transaction that names
 * no such withdraw reads as moving nothing.
 */
export async function readIntentsWithdraw(
  network: NearNetwork,
  txHash: string,
  signer: string,
  receiver: string,
  deps: TransferDeps = {},
): Promise<Transfer> {
  if (!TX_HASH.test(txHash))
    throw new NearError('bad_input', 'tx_hash is not a NEAR transaction hash');
  const transport = deps.fetch ?? globalThis.fetch;
  let body: {
    result?: {
      status?: unknown;
      transaction?: {
        hash?: string;
        signer_id?: string;
        receiver_id?: string;
        actions?: (string | { FunctionCall?: { method_name?: string; args?: string } })[];
      };
    };
    error?: { cause?: { name?: string } };
  };
  try {
    const res = await transport(deps.url ?? ARCHIVAL_RPC_URLS[network], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'petal',
        method: 'tx',
        params: { tx_hash: txHash, sender_account_id: INTENTS, wait_until: 'FINAL' },
      }),
    });
    body = (await res.json()) as typeof body;
  } catch (e) {
    throw new NearError(
      'source_failed',
      `Couldn't reach NEAR to read the transaction: ${describe(e)}`,
    );
  }
  const cause = body.error?.cause?.name;
  if (cause === 'UNKNOWN_TRANSACTION' || cause === 'TIMEOUT_ERROR') {
    throw new NearError(
      'not_found',
      `NEAR has no transaction ${txHash} from ${signer} on ${network}.`,
    );
  }
  const tx = body.result?.transaction;
  if (!tx) {
    throw new NearError(
      'source_failed',
      `NEAR couldn't say what ${txHash} did (${cause ?? 'no answer'}).`,
    );
  }
  let yocto = 0n;
  if (tx.receiver_id === INTENTS)
    for (const a of tx.actions ?? []) {
      const call = typeof a === 'object' ? a.FunctionCall : undefined;
      if (call?.method_name !== 'execute_intents' || typeof call.args !== 'string') continue;
      let args: { signed?: { payload?: unknown }[] };
      try {
        args = JSON.parse(Buffer.from(call.args, 'base64').toString('utf8'));
      } catch {
        continue;
      }
      for (const s of args.signed ?? []) {
        // NEP-413's payload carries the intent as its message; other standards carry it as the payload itself
        const text =
          typeof s.payload === 'string'
            ? s.payload
            : (s.payload as { message?: unknown } | undefined)?.message;
        if (typeof text !== 'string') continue;
        let m: {
          signer_id?: unknown;
          intents?: { intent?: unknown; receiver_id?: unknown; amount?: unknown }[];
        };
        try {
          m = JSON.parse(text);
        } catch {
          continue;
        }
        if (m.signer_id !== signer) continue;
        for (const i of m.intents ?? [])
          if (
            i.intent === 'native_withdraw' &&
            i.receiver_id === receiver &&
            typeof i.amount === 'string' &&
            /^\d+$/.test(i.amount)
          )
            yocto += BigInt(i.amount);
      }
    }
  const status = body.result?.status;
  return {
    tx_hash: tx.hash ?? txHash,
    signer_id: signer,
    receiver_id: receiver,
    yocto: yocto.toString(),
    methods: [],
    succeeded:
      yocto > 0n && typeof status === 'object' && status !== null && 'SuccessValue' in status,
  };
}
