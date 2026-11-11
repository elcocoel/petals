// What each map's token is worth, the run over the shared map (board #91; Elco, 11 Nov: "monetary estimates
// of the value of these petals and the stakes and the supply"): its price from 1Click, its supply from its
// chain, and its newest reading's totals at that price, kept as value/v1 by the map's address. Each petal's own
// value is drawn from it when a reading is made (valuePieces). scripts/map-values.ts runs it where the server
// runs. Read again, a map's value is replaced.
import {
  type MarkSaid,
  VALUE_VERSION,
  type Value,
  validateMark,
  validateValue,
  valueTotals,
} from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { type Fetch, readSupply, tokenPrices } from '@petal/inputs';
import { privateStore } from './drafts.ts';
import { type MapCard, mapsOf, mapViews } from './map.ts';
import { findSnapshot } from './tools/shared.ts';
import type { ToolContext } from './types.ts';
import { cardValue } from './value-store.ts';

const PRICED = new Set(['erc20-holders', 'erc20-votes', 'solana-spl-holders']);
const STAKED = new Set(['near-validators', 'near-house-of-stake']);

/** What a map's reading holds that a price is for: its token, NEAR for stake, or its own unpriced unit. */
function assetOf(
  card: MapCard,
  reader: string | null,
  s: Snapshot,
  measure: string | null,
): string | null {
  if (reader && PRICED.has(reader) && card.address)
    return card.chain.startsWith('solana') ? card.address : card.address.toLowerCase();
  if (reader && STAKED.has(reader)) return 'NEAR';
  const h = s.holdings.find((x) => x.measure === measure) ?? s.holdings[0];
  return typeof h?.asset === 'string' ? h.asset : null;
}

export interface ValueRun {
  only?: string;
  save?: boolean;
  fetch?: Fetch;
  now?: () => Date;
  log?: (line: string) => void;
}
export interface ValueRunResult {
  maps: number;
  saved: number;
  priced: number;
  supplied: number;
  failed_lists: string[];
}

export async function valueMaps(ctx: ToolContext, o: ValueRun = {}): Promise<ValueRunResult> {
  const store = privateStore(ctx.config);
  const fetchImpl = o.fetch ?? ((...a: Parameters<Fetch>) => globalThis.fetch(...a));
  const prices = tokenPrices(fetchImpl);
  const log = o.log ?? (() => {});
  const cards = mapsOf(await mapViews(ctx)).filter((c) => !o.only || c.id.includes(o.only));
  const out: ValueRunResult = {
    maps: cards.length,
    saved: 0,
    priced: 0,
    supplied: 0,
    failed_lists: [],
  };
  for (const card of cards) {
    const newest = card.readings[0];
    const snapshot = newest ? await findSnapshot(ctx, newest.snapshot) : null;
    if (!newest || !snapshot) {
      log(`${card.id}: no reading to value`);
      continue;
    }
    const reader = newest.network ?? null;
    const caps = reader ? ctx.modules[reader]?.descriptor.capabilities : undefined;
    const measure = caps?.defaults.measure ?? caps?.measures[0]?.id ?? null;
    const asset = assetOf(card, reader, snapshot, measure);
    if (!asset) {
      log(`${card.id}: holds nothing to value`);
      continue;
    }
    const at = (o.now ?? (() => new Date()))().toISOString();
    const priced = await prices.priceOf(
      card.chain.startsWith('solana') ? 'solana' : card.chain,
      asset,
    );
    // the symbol its mark says, when the price doesn't
    const markRow = await store.mark.get(card.id);
    const mark = markRow ? validateMark(JSON.parse(markRow.body)) : null;
    const markSymbol = mark?.ok ? ((mark.value.symbol as MarkSaid | null)?.value ?? null) : null;
    const symbol = priced?.symbol ?? markSymbol;
    const pricedHere = priced || STAKED.has(reader ?? '') || PRICED.has(reader ?? '');
    const supply = pricedHere
      ? await readSupply(
          fetchImpl,
          card.chain.startsWith('solana') ? 'solana' : card.chain,
          asset,
          at,
          symbol ?? 'tokens',
        )
      : null;
    const price = priced
      ? { usd: priced.usd, source: priced.source, ref: priced.ref, at: priced.at }
      : null;
    const value: Value = {
      petal: VALUE_VERSION,
      about: card.id,
      asset: { id: asset, symbol },
      price,
      supply,
      snapshot: newest.snapshot,
      measure,
      totals: valueTotals(snapshot, asset, price),
      read_at: at,
    };
    const checked = validateValue(value);
    if (!checked.ok) {
      log(
        `${card.id}: not kept, ${checked.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`,
      );
      continue;
    }
    if (price) out.priced++;
    if (supply) out.supplied++;
    const own = cardValue(value);
    log(
      `${card.id}: ${price ? `$${price.usd} a ${symbol ?? 'token'}` : 'no price'} · supply ${supply ? `${supply.amount} ${supply.unit}` : '-'} · total ${own.total_usd ? `$${own.total_usd}` : '-'}`,
    );
    if (o.save === false) continue;
    await store.value.put({ about: value.about, body: JSON.stringify(value), read_at: at });
    out.saved++;
  }
  out.failed_lists = [...prices.failed];
  return out;
}
