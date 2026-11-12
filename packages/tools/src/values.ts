// What each map's token is worth, the run over the shared map (board #91; Elco, 11 Nov: "monetary estimates
// of the value of these petals and the stakes and the supply"): its price from 1Click, its supply from its
// chain, and its newest reading's totals at that price, kept by the map's address. Each petal's own value is
// drawn from it when a reading is made (valuePieces). scripts/map-values.ts runs it where the server runs.
// Read again, a map's value is replaced.
// value/v3 (12 Nov; Elco: "knowing the sizes of treasuries and all of the usual cap information, so
// circulating supply, max cap"; "bias towards keyless"): also its circulating supply and market cap as
// CoinGecko says them, its max from its chain where the chain proves one (else CoinGecko's), and its treasury.
// A treasury read from the chain (the mapping waves' value/v2) is kept as it is; where none was, DefiLlama's,
// read again each run. Each names where it came from.
import {
  type MarkSaid,
  VALUE_V3,
  type Value,
  type ValueTreasury,
  validateMark,
  validateValue,
  valueTotals,
} from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import {
  coinGeckoMarkets,
  type Fetch,
  llamaTreasuries,
  marketOf,
  readChainMax,
  readSupply,
  tokenPrices,
  treasurySource,
} from '@petal/inputs';
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
  /** value/v3: how many have a circulating supply, a max, a treasury */
  circulating: number;
  maxed: number;
  treasuries: number;
  failed_lists: string[];
}

/** The chain a map's token is read on, as the readers name it. */
const chainOf = (card: MapCard) => (card.chain.startsWith('solana') ? 'solana' : card.chain);

export async function valueMaps(ctx: ToolContext, o: ValueRun = {}): Promise<ValueRunResult> {
  const store = privateStore(ctx.config);
  const fetchImpl = o.fetch ?? ((...a: Parameters<Fetch>) => globalThis.fetch(...a));
  const prices = tokenPrices(fetchImpl);
  const llama = llamaTreasuries(fetchImpl);
  const log = o.log ?? (() => {});
  const now = o.now ?? (() => new Date());
  const cards = mapsOf(await mapViews(ctx)).filter((c) => !o.only || c.id.includes(o.only));
  const out: ValueRunResult = {
    maps: cards.length,
    saved: 0,
    priced: 0,
    supplied: 0,
    circulating: 0,
    maxed: 0,
    treasuries: 0,
    failed_lists: [],
  };
  const plans: Array<{
    card: MapCard;
    newest: MapCard['readings'][number];
    snapshot: Snapshot;
    reader: string | null;
    measure: string | null;
    asset: string;
  }> = [];
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
    plans.push({ card, newest, snapshot, reader, measure, asset });
  }
  // CoinGecko's markets for every token at once: its coin list, then 250 coins a call
  const gecko = await coinGeckoMarkets(
    fetchImpl,
    plans.map((p) => ({ chain: chainOf(p.card), asset: p.asset })),
    now,
  );
  for (const a of gecko.ambiguous) log(`coingecko: two coins claim ${a}, left unsaid`);
  for (const { card, newest, snapshot, reader, measure, asset } of plans) {
    const at = now().toISOString();
    const chain = chainOf(card);
    const priced = await prices.priceOf(chain, asset);
    // the symbol its mark says, when the price doesn't
    const markRow = await store.mark.get(card.id);
    const mark = markRow ? validateMark(JSON.parse(markRow.body)) : null;
    const markSymbol = mark?.ok ? ((mark.value.symbol as MarkSaid | null)?.value ?? null) : null;
    const symbol = priced?.symbol ?? markSymbol;
    const pricedHere = priced || STAKED.has(reader ?? '') || PRICED.has(reader ?? '');
    const supply = pricedHere
      ? await readSupply(fetchImpl, chain, asset, at, symbol ?? 'tokens')
      : null;
    const price = priced
      ? { usd: priced.usd, source: priced.source, ref: priced.ref, at: priced.at }
      : null;
    const market = marketOf(gecko.markets, chain, asset);
    const max =
      (pricedHere ? await readChainMax(fetchImpl, chain, asset, at) : null) ?? market?.max ?? null;
    // a treasury the chain gave (the waves' value/v2) stays; else DefiLlama's, read again
    const storedRow = await store.value.get(card.id);
    const stored = storedRow ? validateValue(JSON.parse(storedRow.body)) : null;
    const kept: ValueTreasury | null =
      stored?.ok &&
      stored.value.treasury &&
      treasurySource(stored.value.treasury)?.source === 'chain'
        ? stored.value.treasury
        : null;
    const llamaFound =
      kept || !card.address
        ? null
        : await llama.treasuryOf(chain, card.address, { id: asset, symbol });
    const treasury = kept ?? llamaFound?.treasury ?? null;
    const value: Value = {
      petal: VALUE_V3,
      about: card.id,
      asset: { id: asset, symbol },
      price,
      supply,
      circulating: market?.circulating ?? null,
      max,
      ...(market?.market_cap ? { market_cap: market.market_cap } : {}),
      snapshot: newest.snapshot,
      measure,
      totals: valueTotals(snapshot, asset, price),
      treasury,
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
    if (value.circulating) out.circulating++;
    if (max) out.maxed++;
    if (treasury) out.treasuries++;
    const own = cardValue(value);
    log(
      `${card.id}: ${price ? `$${price.usd} a ${symbol ?? 'token'}` : 'no price'} · supply ${supply ? `${supply.amount} ${supply.unit}` : '-'} · total ${own.total_usd ? `$${own.total_usd}` : '-'} · circulating ${value.circulating ? `${value.circulating.amount} (${value.circulating.source})` : '-'} · max ${max ? `${max.amount ?? 'none'} (${max.source})` : '-'} · treasury ${treasury ? `$${treasury.total.usd} (${kept ? 'kept, chain' : `defillama ${llamaFound?.slug}`})` : '-'}`,
    );
    if (o.save === false) continue;
    await store.value.put({ about: value.about, body: JSON.stringify(value), read_at: at });
    out.saved++;
  }
  out.failed_lists = [...prices.failed, ...gecko.failed, ...llama.failed];
  return out;
}
