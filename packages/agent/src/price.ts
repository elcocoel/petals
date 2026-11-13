// The price a person pays (price/v2, packages/core's price.ts): NEAR AI's
// bill, plus a base fee, plus their own tip. It's this file, versioned with the code: changing it is a
// commit, and every charge names its hash. Every switch of the base fee is off and the tip is 0 by default,
// so today Petals runs at cost.
import { readFileSync } from 'node:fs';
import { baseFee, type Price, type Priced, priceHash, tipOn, tipPercentOf } from '@petal/core';
import type { Store } from '@petal/store';
import type { UsageRecord } from './usage.ts';

/** Where the price lives, read as prompt.md is, beside this file. */
export const PRICE_FILE: URL = new URL('./price.json', import.meta.url);
export const PRICE: Price = JSON.parse(readFileSync(PRICE_FILE, 'utf8')) as Price;

/** The reason a tip goes onto the credit with: a donation, never part of the fee. */
export const TIP = 'Tip to Petals';

/** The person's tip, as a percent of their usage: theirs, or the price's default. */
export async function tipPercentOfPerson(
  store: Store,
  price: Price,
  person: string,
): Promise<number> {
  return tipPercentOf(price, (await store.person.get(person))?.tip ?? null);
}

/** What NEAR AI has billed a person in all so far, for the free allowance. */
async function billedSoFar(store: Store, account: string): Promise<number> {
  return (await store.usage.ofAccount(account, 100_000)).reduce((sum, r) => {
    const rec = JSON.parse(r.body) as UsageRecord;
    return sum + (r.billed_usd ?? rec.computed_usd);
  }, 0);
}

/**
 * The base fee for one priced thing, on a person's credit, as its own entry naming the price. Nothing while
 * its switches are off. `ref` names what it's for, so it's charged once.
 */
export async function chargeBase(
  store: Store,
  price: Price,
  person: string,
  e: Priced,
  ref: string,
  at: string,
): Promise<number> {
  const account = `person:${person}`;
  const fee = baseFee(price, e, await billedSoFar(store, account));
  if (fee <= 0) return 0;
  await store.credit.apply({
    id: `base:${e.kind}:${ref}`,
    account_key: account,
    delta_usd: -fee,
    reason: `Petals base fee (${e.kind}, price ${priceHash(price).slice(0, 12)})`,
    at,
  });
  return fee;
}

/** The person's tip on a call NEAR AI billed: their percent of it, as its own entry, a donation. */
export async function chargeTip(
  store: Store,
  price: Price,
  person: string,
  billedUsd: number,
  ref: string,
  at: string,
): Promise<number> {
  const tip = tipOn(billedUsd, await tipPercentOfPerson(store, price, person));
  if (tip <= 0) return 0;
  await store.credit.apply({
    id: `tip:${ref}`,
    account_key: `person:${person}`,
    delta_usd: -tip,
    reason: `${TIP} (price ${priceHash(price).slice(0, 12)})`,
    at,
  });
  return tip;
}
