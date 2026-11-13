// Petals' credit contract, on the server (proposal-payment.md, section 6). With PETAL_CREDIT_CONTRACT
// and PETAL_CHARGER_KEY_FILE set, a person's own credit is what they hold in the contract: read from the
// chain before each chat, in dollars at NEAR's price then, and charged on chain for what the chat cost when
// it ends, in NEAR at that same price. Without them, a person pays by a plain transfer (pay-routes.ts).

import { randomUUID } from 'node:crypto';
import {
  type CreditContract,
  chargeCredit,
  creditBalance,
  networkOfAccount,
  usdToYocto,
  yoctoToUsd,
} from '@petal/near/pay';
import type { Store } from '@petal/store';
import {
  drawOffchain,
  ensureOffchain,
  FUNDED,
  offchainOf,
  PAID,
  type PersonCredit,
  SYNCED,
  syncPersonCredit,
} from './invites.ts';

type Env = Record<string, string | undefined>;

/** What the server does with the contract; tests pass a stand-in. */
export interface CreditChain {
  contract: CreditContract;
  balanceOf(account: string): Promise<bigint>;
  charge(account: string, yocto: bigint): Promise<{ charged: bigint; tx_hash: string }>;
}

/**
 * The contract from the environment, or null when it isn't set. A public site takes a mainnet contract only:
 * testnet NEAR is free, and NEAR AI bills real dollars.
 */
export function creditFrom(env: Env, o: { public: boolean }): CreditChain | null {
  const contract = env.PETAL_CREDIT_CONTRACT?.trim();
  const chargerKeyFile = env.PETAL_CHARGER_KEY_FILE?.trim();
  if (!contract && !chargerKeyFile) return null;
  if (!contract || !chargerKeyFile) {
    throw new Error('petal: PETAL_CREDIT_CONTRACT and PETAL_CHARGER_KEY_FILE go together.');
  }
  const network = networkOfAccount(contract);
  if (o.public && network !== 'mainnet') {
    throw new Error(`petal: a public site takes a mainnet credit contract only, not ${contract}.`);
  }
  const c: CreditContract = { network, contract, chargerKeyFile };
  return {
    contract: c,
    balanceOf: (account) => creditBalance(network, contract, account),
    charge: (account, yocto) => chargeCredit(c, account, yocto),
  };
}

/** A chat on the contract: the person's credit, synced from the chain, and how to charge it at the end. */
export interface ChainChat {
  credit: PersonCredit;
  /** what the wallet holds in the contract, as read now */
  yocto: bigint;
  /** charges what the chat cost, at the price it was synced at; never throws */
  settle(spentUsd: number): Promise<void>;
}

/** What a person owes Petals on the contract (carried forward): positive owed, negative owed back. */
export const owedAccount = (person: string) => `owed:${person}`;

const usd = (n: number) => Math.round(n * 1e9) / 1e9;

/** What the person owes on the contract now. */
export async function owedOf(store: Store, person: string): Promise<number> {
  return (await store.credit.get(owedAccount(person)))?.balance_usd ?? 0;
}

async function owe(store: Store, person: string, deltaUsd: number, at: Date): Promise<void> {
  if (Math.abs(deltaUsd) < 1e-9) return;
  await store.credit.apply({
    id: `owed:${randomUUID()}`,
    account_key: owedAccount(person),
    delta_usd: usd(deltaUsd),
    reason: 'carried to the contract',
    at: at.toISOString(),
  });
}

/**
 * What landed on the person's credit since it was last read from the chain, that the chain hasn't been
 * charged for: NEAR AI's corrections, base fees, tips, a credit-back. A model call isn't (the chat's end
 * charges it), nor funding (that's the chain's to say). It moves into what they owe, before the credit is
 * set to the chain again, so nothing that lands between two chats is lost.
 */
async function carry(store: Store, person: string, at: Date): Promise<void> {
  const entries = [...(await store.credit.entries(`person:${person}`))].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );
  const lastSync = entries.findLastIndex((e) => e.reason === SYNCED);
  const kept = new Set([SYNCED, FUNDED, PAID, 'model call']);
  const since = entries.slice(lastSync + 1).filter((e) => !kept.has(e.reason));
  // a charge on their credit (negative) is owed on the contract; something given back (positive) is owed back
  await owe(store, person, -since.reduce((s, e) => s + e.delta_usd, 0), at);
}

/**
 * Reads `account`'s balance and sets the person's credit to it in dollars at `nearUsd`, plus what they hold
 * off the contract (plain transfers, NEAR Intents, what the operator gave), less what they owe, and says how
 * to charge. A chat spends what's off the contract first; only the rest is charged on chain. It carries
 * forward: the contract can only charge, so what's owed either way rides on the next charge: owed is charged
 * with it, owed back takes from it.
 */
export async function chainChat(
  store: Store,
  chain: CreditChain,
  person: string,
  /** the person's NEAR wallets on the contract's network: their credit there is what all of them hold */
  wallets: string | readonly string[],
  nearUsd: number,
  now: () => Date,
): Promise<ChainChat> {
  const accounts = typeof wallets === 'string' ? [wallets] : [...new Set(wallets)];
  const held = await Promise.all(accounts.map((a) => chain.balanceOf(a)));
  const yocto = held.reduce((n, y) => n + y, 0n);
  await ensureOffchain(store, person, now());
  await carry(store, person, now());
  const owed = await owedOf(store, person);
  const credit = await syncPersonCredit(
    store,
    person,
    (await offchainOf(store, person)) + yoctoToUsd(yocto, nearUsd) - Math.max(0, owed),
    now(),
  );
  return {
    credit,
    yocto,
    async settle(spent) {
      // what's off the contract pays first; the contract is charged only for the rest
      const spentUsd = usd(Math.max(0, spent) - (await drawOffchain(store, person, spent, now())));
      const owedNow = await owedOf(store, person);
      const total = usd(Math.max(0, spentUsd) + owedNow);
      // all of it owed back, or more: nothing is charged, and what's left stays owed back
      if (total <= 0) return owe(store, person, spentUsd, now());
      const ask = usdToYocto(total, nearUsd);
      // from each wallet in turn, what it held when the chat began, until it's covered
      let charged = 0n;
      for (const [i, a] of accounts.entries()) {
        const want = ask - charged;
        if (want <= 0n) break;
        const from = held[i] ?? 0n;
        const take = i === accounts.length - 1 ? want : want < from ? want : from;
        if (take <= 0n) continue;
        try {
          const r = await chain.charge(a, take);
          charged += r.charged;
          if (r.charged < take)
            console.warn(
              `petal: charged ${r.charged} of ${take} yoctoNEAR to a balance in ${chain.contract.contract} (tx ${r.tx_hash}): it held less`,
            );
        } catch (e) {
          console.warn(
            `petal: couldn't charge ${take} yoctoNEAR in ${chain.contract.contract}: ${(e as Error).message}`,
          );
        }
      }
      // what the chain didn't take stays owed
      await owe(store, person, total - yoctoToUsd(charged, nearUsd) - owedNow, now());
    },
  };
}
