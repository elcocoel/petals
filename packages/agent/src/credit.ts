// Petals' credit contract, on the server (9 Nov; proposal-payment.md, section 6). With PETAL_CREDIT_CONTRACT
// and PETAL_CHARGER_KEY_FILE set, a person's own credit is what they hold in the contract: read from the
// chain before each chat, in dollars at NEAR's price then, and charged on chain for what the chat cost when
// it ends, in NEAR at that same price. Without them, a person pays by a plain transfer (pay-routes.ts).
import {
  type CreditContract,
  chargeCredit,
  creditBalance,
  networkOfAccount,
  usdToYocto,
  yoctoToUsd,
} from '@petal/near/pay';
import type { Store } from '@petal/store';
import { type PersonCredit, syncPersonCredit } from './invites.ts';

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
  /** charges what the chat cost, at the price it was synced at; never throws */
  settle(spentUsd: number): Promise<void>;
}

/** Reads `account`'s balance, sets the person's credit to it in dollars at `nearUsd`, and says how to charge. */
export async function chainChat(
  store: Store,
  chain: CreditChain,
  person: string,
  account: string,
  nearUsd: number,
  now: () => Date,
): Promise<ChainChat> {
  const yocto = await chain.balanceOf(account);
  const credit = await syncPersonCredit(store, person, yoctoToUsd(yocto, nearUsd), now());
  return {
    credit,
    async settle(spentUsd) {
      if (!(spentUsd > 0)) return;
      const ask = usdToYocto(spentUsd, nearUsd);
      try {
        const { charged, tx_hash } = await chain.charge(account, ask);
        if (charged < ask) {
          console.warn(
            `petal: charged ${charged} of ${ask} yoctoNEAR to a balance in ${chain.contract.contract} (tx ${tx_hash}): it held less`,
          );
        }
      } catch (e) {
        console.warn(
          `petal: couldn't charge ${ask} yoctoNEAR in ${chain.contract.contract}: ${(e as Error).message}`,
        );
      }
    },
  };
}
