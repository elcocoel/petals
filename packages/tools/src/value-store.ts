// Each map's stored value (board #91), as the map's cards and readings take it: the values by the map's
// address, and a card's own block, with its supply and its own total in dollars.
import { usdString, type Value, validateValue } from '@petal/core';
import { treasurySource } from '@petal/inputs';
import { privateStore } from './drafts.ts';
import type { ToolContext } from './types.ts';

/** What a map's card carries of its value: as stored, with its supply and its own total in dollars. */
export interface CardValue {
  asset: Value['asset'];
  price: Value['price'];
  supply: Value['supply'];
  /** the supply at the price; null with no price or no supply */
  supply_usd: string | null;
  /** the reading's own measure's total at the price; null with no price */
  total_usd: string | null;
  measure: string | null;
  totals: Value['totals'];
  snapshot: string | null;
  /** value/v2: the treasury's priced total, and how many of its assets have no price; null with no treasury */
  treasury_usd: string | null;
  treasury_unpriced: number | null;
  /** value/v3: where the treasury's amounts were read, chain or defillama, and its address; null with no treasury */
  treasury_source: { source: string; ref: string } | null;
  /** value/v3: how much is out there, as its source counts it (CoinGecko's), or null */
  circulating: Value['circulating'] | null;
  /** value/v3: the most there can be, the chain's or CoinGecko's, amount null when its source says none */
  max: Value['max'] | null;
  /** value/v3: the market cap as its source says it, or null */
  market_cap: Value['market_cap'] | null;
  read_at: string;
}

export function cardValue(v: Value): CardValue {
  const supplyUsd = v.price && v.supply ? usdString(Number(v.supply.amount) * v.price.usd) : null;
  return {
    asset: v.asset,
    price: v.price,
    supply: v.supply,
    supply_usd: supplyUsd,
    total_usd: v.totals.find((t) => t.measure === v.measure)?.usd ?? null,
    measure: v.measure,
    totals: v.totals,
    snapshot: v.snapshot,
    treasury_usd: v.treasury?.total.usd ?? null,
    treasury_unpriced: v.treasury?.total.unpriced ?? null,
    treasury_source: treasurySource(v.treasury),
    circulating: v.circulating ?? null,
    max: v.max ?? null,
    market_cap: v.market_cap ?? null,
    read_at: v.read_at,
  };
}

/** The map's values by its address, as stored and valid. */
export async function valuesOf(ctx: ToolContext): Promise<Map<string, Value>> {
  const out = new Map<string, Value>();
  for (const r of await privateStore(ctx.config).value.list()) {
    const v = validateValue(JSON.parse(r.body));
    if (v.ok) out.set(r.about, v.value);
  }
  return out;
}
