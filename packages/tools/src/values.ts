// What each map's token is worth, the run over the shared map: its price from 1Click, its supply from its
// chain, and its newest reading's totals at that price, kept by the map's address. Each petal's own value is
// drawn from it when a reading is made (valuePieces). scripts/map-values.ts runs it where the server runs.
// Read again, a map's value is replaced.
// value/v3 (12 Nov, keyless first): also its circulating supply and market cap as
// CoinGecko says them, its max from its chain where the chain proves one (else CoinGecko's), and its treasury.
// A treasury read from the chain (the mapping runs' value/v2) is kept as it is; where none was, DefiLlama's,
// read again each run. Each names where it came from.
import {
  type MarkSaid,
  usdString,
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

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The asset a kept value names, when it isn't the one this pass would pick: then the kept value stays. */
const keptAsset = (p: { asset: string; stored: Value | null }): string | null =>
  p.stored && !sameId(p.stored.asset.id, p.asset) ? p.stored.asset.id : null;

/** NEAR's own coin, as readings write it. */
const NEAR_FORMS = new Set(['NEAR', 'near:native', 'near:mainnet:NEAR']);

/** How the markets know an asset a reading names: NEAR by name, a NEAR token by its contract. */
const marketAsset = (id: string): string =>
  NEAR_FORMS.has(id)
    ? 'NEAR'
    : id.startsWith('near:mainnet:')
      ? id.slice('near:mainnet:'.length)
      : id;

export interface ValueRun {
  only?: string;
  save?: boolean;
  fetch?: Fetch;
  now?: () => Date;
  log?: (line: string) => void;
  /** CoinGecko's Demo key; default COINGECKO_API_KEY, keyless without it */
  coingeckoKey?: string;
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
    /** the value kept for this map, when there is one */
    stored: Value | null;
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
    const storedRow = await store.value.get(card.id);
    const checked = storedRow ? validateValue(JSON.parse(storedRow.body)) : null;
    plans.push({
      card,
      newest,
      snapshot,
      reader,
      measure,
      asset,
      stored: checked?.ok ? checked.value : null,
    });
  }
  // CoinGecko's markets for every token at once: its coin list, then 250 coins a call
  const gecko = await coinGeckoMarkets(
    fetchImpl,
    plans.map((p) => ({ chain: chainOf(p.card), asset: marketAsset(keptAsset(p) ?? p.asset) })),
    now,
    o.coingeckoKey ?? (process.env.COINGECKO_API_KEY?.trim() || undefined),
  );
  for (const a of gecko.ambiguous) log(`coingecko: two coins claim ${a}, left unsaid`);
  for (const plan of plans) {
    const { card, newest, snapshot, reader, measure, asset, stored } = plan;
    const at = now().toISOString();
    const chain = chainOf(card);
    // a value kept for another asset than this pass would pick (the mapping runs' own) stays whole, and
    // gains only what value/v3 adds: its token as the markets count it, and a treasury where it has none
    const other = keptAsset(plan);
    if (other && stored) {
      const m = marketAsset(other);
      // NEAR under a mapping run's name for it (near:native, near:mainnet:NEAR) is NEAR: today's price, as every
      // NEAR map has it, with its totals' dollars at that price; the rest of the run's value stays (else House of
      // Stake showed NEAR at 3.40 beside Sputnik DAOs at 3.74)
      const near = NEAR_FORMS.has(other) ? await prices.priceOf(chain, 'NEAR') : null;
      const price = near
        ? { usd: near.usd, source: near.source, ref: near.ref, at: near.at }
        : stored.price;
      const totals = near
        ? stored.totals.map((t) => ({ ...t, usd: usdString(Number(t.amount) * near.usd) }))
        : stored.totals;
      const market = marketOf(gecko.markets, chain, m);
      const max = (await readChainMax(fetchImpl, chain, m, at)) ?? market?.max ?? null;
      const kept =
        stored.treasury && treasurySource(stored.treasury)?.source === 'chain'
          ? stored.treasury
          : null;
      const found =
        kept || !card.address ? null : await llama.treasuryOf(chain, card.address, stored.asset);
      const value: Value = {
        petal: VALUE_V3,
        about: stored.about,
        asset: stored.asset,
        price,
        supply: stored.supply,
        circulating: market?.circulating ?? null,
        max,
        ...(market?.market_cap ? { market_cap: market.market_cap } : {}),
        snapshot: stored.snapshot,
        measure: stored.measure,
        totals,
        treasury: kept ?? found?.treasury ?? stored.treasury ?? null,
        read_at: at,
      };
      if (!validateValue(value).ok) {
        log(`${card.id}: kept as it was, its value/v3 isn't valid`);
        continue;
      }
      if (value.price) out.priced++;
      if (value.supply) out.supplied++;
      if (value.circulating) out.circulating++;
      if (max) out.maxed++;
      if (value.treasury) out.treasuries++;
      log(
        `${card.id}: kept for ${other}, ${near ? `at today's NEAR price, $${near.usd}` : 'as it was'} · circulating ${value.circulating?.amount ?? '-'} · max ${max ? (max.amount ?? 'none') : '-'}`,
      );
      if (o.save === false) continue;
      await store.value.put({ about: value.about, body: JSON.stringify(value), read_at: at });
      out.saved++;
      continue;
    }
    const sameKept = stored && sameId(stored.asset.id, asset) ? stored : null;
    const priced = await prices.priceOf(chain, asset);
    // the symbol its mark says, when the price doesn't
    const markRow = await store.mark.get(card.id);
    const mark = markRow ? validateMark(JSON.parse(markRow.body)) : null;
    const markSymbol = mark?.ok ? ((mark.value.symbol as MarkSaid | null)?.value ?? null) : null;
    const symbol = priced?.symbol ?? markSymbol;
    const pricedHere = priced || STAKED.has(reader ?? '') || PRICED.has(reader ?? '');
    // a price or supply read before stays when this read finds none: what's kept isn't lost
    const supply =
      (pricedHere ? await readSupply(fetchImpl, chain, asset, at, symbol ?? 'tokens') : null) ??
      sameKept?.supply ??
      null;
    const price = priced
      ? { usd: priced.usd, source: priced.source, ref: priced.ref, at: priced.at }
      : (sameKept?.price ?? null);
    const market = marketOf(gecko.markets, chain, asset);
    const max =
      (pricedHere ? await readChainMax(fetchImpl, chain, asset, at) : null) ?? market?.max ?? null;
    // a treasury the chain gave (the mapping runs' value/v2) stays; else DefiLlama's, read again
    const kept: ValueTreasury | null =
      stored?.treasury && treasurySource(stored.treasury)?.source === 'chain'
        ? stored.treasury
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
