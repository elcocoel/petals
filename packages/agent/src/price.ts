// The price Petals charges at (price/v1, packages/core's price.ts; coordinator/pricing-protocol.md). It's this
// file, versioned with the code: changing it is a commit, and every charge names its hash. Every switch is
// off today, so Petals runs at cost: what NEAR AI billed, and nothing on top.
import { readFileSync } from 'node:fs';
import { type Price, type Priced, petalsCharge, priceHash, tipOf } from '@petal/core';
import type { Store } from '@petal/store';
import type { UsageRecord } from './usage.ts';

/** Where the price lives, read as prompt.md is, beside this file. */
export const PRICE_FILE: URL = new URL('./price.json', import.meta.url);
export const PRICE: Price = JSON.parse(readFileSync(PRICE_FILE, 'utf8')) as Price;

/** The person's tip on Petals' fees: theirs, or the price's default. */
export async function tipOfPerson(store: Store, price: Price, person: string): Promise<number> {
  return tipOf(price, (await store.person.get(person))?.tip ?? null);
}

/** What NEAR AI has billed a person in all so far, for the free allowance. */
async function billedSoFar(store: Store, account: string): Promise<number> {
  return (await store.usage.ofAccount(account, 100_000)).reduce((sum, r) => {
    const rec = JSON.parse(r.body) as UsageRecord;
    return sum + (r.billed_usd ?? rec.computed_usd);
  }, 0);
}

/**
 * Petals' own charge for one priced thing, on a person's credit, as its own entry naming the price. Nothing
 * when every switch for it is off. `ref` names what it's for, so it's charged once.
 */
export async function chargePetals(
  store: Store,
  price: Price,
  person: string,
  e: Priced,
  ref: string,
  at: string,
): Promise<number> {
  const account = `person:${person}`;
  const tip = await tipOfPerson(store, price, person);
  const charge = petalsCharge(price, tip, e, await billedSoFar(store, account));
  if (charge.total_usd <= 0) return 0;
  await store.credit.apply({
    id: `petals:${e.kind}:${ref}`,
    account_key: account,
    delta_usd: -charge.total_usd,
    reason: `Petals (${e.kind}, price ${priceHash(price).slice(0, 12)})`,
    at,
  });
  return charge.total_usd;
}
