// Petals' credit contract, from the server's side (9 Nov; packages/near/contract, proposal-payment.md
// section 6). A person's NEAR sits in the contract under their own account. The server reads a balance (a
// view call, no key) and, after each turn, charges what the turn cost with a key that can call `charge` and
// nothing else.
import { readFile } from 'node:fs/promises';
import { describe, NearError } from '../errors.ts';
import { type NearNetwork, RPC_URLS } from '../network.ts';

/** The contract, and the charge-only key the server holds for it. */
export interface CreditContract {
  network: NearNetwork;
  contract: string;
  /** a JSON file { account_id, private_key }: a function-call key that can only call `charge` */
  chargerKeyFile: string;
}

/** A contract's network, from its name: `.testnet` is testnet, anything else mainnet. */
export const networkOfAccount = (account: string): NearNetwork =>
  account.endsWith('.testnet') ? 'testnet' : 'mainnet';

/** 30 Tgas: what `charge` gets, well over what it uses. */
const CHARGE_GAS = 30_000_000_000_000n;

export interface CreditDeps {
  fetch?: typeof fetch;
  /** the RPC address; default RPC_URLS[network] */
  url?: string;
}

/** What `account` holds in the contract, in yoctoNEAR. */
export async function creditBalance(
  network: NearNetwork,
  contract: string,
  account: string,
  deps: CreditDeps = {},
): Promise<bigint> {
  const args = Buffer.from(JSON.stringify({ account_id: account })).toString('base64');
  let body: { result?: { result?: number[] }; error?: unknown };
  try {
    const res = await (deps.fetch ?? globalThis.fetch)(deps.url ?? RPC_URLS[network], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'petal',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: contract,
          method_name: 'balance_of',
          args_base64: args,
        },
      }),
    });
    body = (await res.json()) as typeof body;
  } catch (e) {
    throw new NearError('source_failed', `Couldn't read the balance on NEAR: ${describe(e)}`);
  }
  const bytes = body.result?.result;
  if (!bytes) throw new NearError('source_failed', "NEAR couldn't say what the balance is.");
  const text = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  if (typeof text !== 'string' || !/^\d+$/.test(text)) {
    throw new NearError('source_failed', 'The contract answered something that is not a balance.');
  }
  return BigInt(text);
}

/** Charges `yocto` of `account`'s balance with the charge-only key. Returns what it moved, and the hash. */
export async function chargeCredit(
  c: CreditContract,
  account: string,
  yocto: bigint,
): Promise<{ charged: bigint; tx_hash: string }> {
  const key = JSON.parse(await readFile(c.chargerKeyFile, 'utf8')) as {
    account_id?: string;
    private_key?: string;
  };
  if (!key.account_id || !key.private_key) {
    throw new NearError(
      'internal',
      `${c.chargerKeyFile} isn't a key file { account_id, private_key }`,
    );
  }
  const { Account, actions, JsonRpcProvider, KeyPair, KeyPairSigner } = await import('near-api-js');
  const signer = new KeyPairSigner(KeyPair.fromString(key.private_key as `ed25519:${string}`));
  const charger = new Account(
    key.account_id,
    new JsonRpcProvider({ url: RPC_URLS[c.network] }),
    signer,
  );
  const out = (await charger.signAndSendTransaction({
    receiverId: c.contract,
    actions: [
      actions.functionCall(
        'charge',
        { account_id: account, amount: yocto.toString() },
        CHARGE_GAS,
        0n,
      ),
    ],
    waitUntil: 'FINAL',
    throwOnFailure: false,
  })) as unknown as { transaction: { hash: string }; status: { SuccessValue?: string } | unknown };
  const value = (out.status as { SuccessValue?: string })?.SuccessValue;
  if (value === undefined) {
    throw new NearError(
      'source_failed',
      `The charge failed on NEAR: ${JSON.stringify(out.status)}`,
      {
        tx_hash: out.transaction.hash,
      },
    );
  }
  const charged = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as string;
  return { charged: BigInt(charged), tx_hash: out.transaction.hash };
}

/** NEAR as dollars, at `nearUsd` a NEAR. */
export function yoctoToUsd(yocto: bigint, nearUsd: number): number {
  return Math.round((Number(yocto / 10n ** 15n) / 1e9) * nearUsd * 1e6) / 1e6;
}

/** Dollars as NEAR, at `nearUsd` a NEAR, rounded up to the yocto so a charge is never short. */
export function usdToYocto(usd: number, nearUsd: number): bigint {
  // nano-NEAR first, rounded up, then the rest of the way in integers
  const nano = Math.ceil((usd / nearUsd) * 1e9);
  return BigInt(nano) * 10n ** 15n;
}
