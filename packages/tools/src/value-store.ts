// Each map's stored value/v1 (board #91), as the map's cards and readings take it: the values by the map's
// address, and a card's own block, with its supply and its own total in dollars.
import { usdString, type Value, validateValue } from '@petal/core';
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
