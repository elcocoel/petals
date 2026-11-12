// A map's token as the markets count it, and its treasury (12 Nov; Elco: "knowing the sizes of treasuries and
// all of the usual cap information, so circulating supply, max cap"; "bias towards keyless"). Keyless, each
// value naming where it came from (research/treasury-2026-11-12.md):
//   max:          the chain's first: a cap() the token holds, a Solana mint whose mint authority is gone, NEAR's
//                 own inflation setting (no max); otherwise CoinGecko's
//   circulating:  CoinGecko's (no chain can prove it: it's a method)
//   market cap:   CoinGecko's
//   treasury:     DefiLlama's, where it knows the map's token or DAO, one protocol at a time
// Nothing a source doesn't say is guessed: no answer is null.
import type {
  ValueMarketCap,
  ValueMax,
  ValueSaid,
  ValueTreasury,
  ValueTreasuryItem,
} from '@petal/core';
import { usdString } from '@petal/core';
import { encodeCall } from '../evm/abi.ts';
import { askChain } from '../evm/ask.ts';
import { EVM_CHAINS } from '../evm/chains.ts';
import { NEAR_RPC, SOLANA_RPC } from './chain.ts';
import type { Fetch } from './lists.ts';
import { wholeTokens } from './values.ts';

export const COINGECKO = 'https://api.coingecko.com/api/v3';
export const LLAMA_PROTOCOLS = 'https://api.llama.fi/protocols';
export const LLAMA_TREASURY = 'https://api.llama.fi/treasury/';

/** How CoinGecko names each chain a map can be on (its platforms). */
const GECKO_PLATFORM: Record<string, string> = {
  ethereum: 'ethereum',
  base: 'base',
  arbitrum: 'arbitrum-one',
  gnosis: 'xdai',
  solana: 'solana',
  'near:mainnet': 'near-protocol',
};
/** NEAR's own coin on CoinGecko. */
const GECKO_NEAR = 'near';

/** How DefiLlama's protocols name each chain in a token's address ("arbitrum:0x…"; a bare 0x… is Ethereum). */
const LLAMA_CHAIN: Record<string, string> = {
  ethereum: 'ethereum',
  base: 'base',
  arbitrum: 'arbitrum',
  gnosis: 'xdai',
  solana: 'solana',
  'near:mainnet': 'near',
};
/** EIP-155 chain ids, for DefiLlama's governance ids ("eip155:1:0x…"). */
const CHAIN_ID: Record<string, string> = {
  '1': 'ethereum',
  '8453': 'base',
  '42161': 'arbitrum',
  '100': 'gnosis',
};

const key = (chain: string, asset: string) =>
  `${chain}|${chain === 'solana' || chain === 'near:mainnet' ? asset : asset.toLowerCase()}`;

/** A whole-token number as the format writes it: decimal text, never negative. */
const decimal = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return null;
  const s = String(n);
  return /^[0-9]+(\.[0-9]+)?(e[-+]?[0-9]+)?$/.test(s) ? s : null;
};

async function getJson<T>(fetchImpl: Fetch, url: string): Promise<T | null> {
  try {
    const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function rpc<T>(
  fetchImpl: Fetch,
  url: string,
  method: string,
  params: unknown,
): Promise<T | null> {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: T };
    return body.result ?? null;
  } catch {
    return null;
  }
}

/** What CoinGecko's markets say of one coin. */
export interface CoinMarket {
  id: string;
  circulating: ValueSaid | null;
  max: ValueMax | null;
  market_cap: ValueMarketCap | null;
}

interface GeckoCoin {
  id: string;
  platforms?: Record<string, string | null>;
}
interface GeckoMarket {
  id: string;
  circulating_supply?: number | null;
  max_supply?: number | null;
  market_cap?: number | null;
  last_updated?: string | null;
}

/**
 * CoinGecko's market data for the map's tokens, keyless: its coin list once (each coin's address on each
 * platform), then its markets 250 coins a call. An address two coins claim is left unsaid.
 */
export async function coinGeckoMarkets(
  fetchImpl: Fetch,
  wanted: Array<{ chain: string; asset: string }>,
  now: () => Date = () => new Date(),
): Promise<{ markets: Map<string, CoinMarket>; failed: string[]; ambiguous: string[] }> {
  const failed: string[] = [];
  const ambiguous: string[] = [];
  const markets = new Map<string, CoinMarket>();
  const ids = new Map<string, string>();
  const needsList = wanted.some((w) => w.asset !== 'NEAR');
  const listUrl = `${COINGECKO}/coins/list?include_platform=true`;
  const list = needsList ? await getJson<GeckoCoin[]>(fetchImpl, listUrl) : [];
  if (!Array.isArray(list)) failed.push(listUrl);
  const byAddress = new Map<string, string[]>();
  for (const c of Array.isArray(list) ? list : []) {
    for (const [platform, address] of Object.entries(c.platforms ?? {})) {
      if (!address) continue;
      const chain = Object.entries(GECKO_PLATFORM).find(([, p]) => p === platform)?.[0];
      if (!chain) continue;
      const k = key(chain, address);
      byAddress.set(k, [...(byAddress.get(k) ?? []), c.id]);
    }
  }
  for (const w of wanted) {
    const k = key(w.chain, w.asset);
    if (w.asset === 'NEAR') {
      ids.set(k, GECKO_NEAR);
      continue;
    }
    const found = [...new Set(byAddress.get(k) ?? [])];
    if (found.length === 1 && found[0]) ids.set(k, found[0]);
    else if (found.length > 1) ambiguous.push(`${k}: ${found.join(', ')}`);
  }
  const unique = [...new Set(ids.values())];
  const byId = new Map<string, GeckoMarket>();
  for (let i = 0; i < unique.length; i += 250) {
    const part = unique.slice(i, i + 250);
    const url = `${COINGECKO}/coins/markets?vs_currency=usd&per_page=250&ids=${part.join(',')}`;
    const got = await getJson<GeckoMarket[]>(fetchImpl, url);
    if (!Array.isArray(got)) {
      failed.push(url);
      continue;
    }
    for (const m of got) byId.set(m.id, m);
  }
  for (const [k, id] of ids) {
    const m = byId.get(id);
    if (!m) continue;
    const ref = (field: string) =>
      `${id}, ${field} (${COINGECKO}/coins/markets?vs_currency=usd&ids=${id})`;
    const at = m.last_updated ?? now().toISOString();
    const circulating = decimal(m.circulating_supply ?? 0);
    const max = decimal(m.max_supply ?? 0);
    const cap = typeof m.market_cap === 'number' && m.market_cap > 0 ? m.market_cap : null;
    markets.set(k, {
      id,
      circulating: circulating
        ? { amount: circulating, source: 'coingecko', ref: ref('circulating_supply'), at }
        : null,
      max: max ? { amount: max, source: 'coingecko', ref: ref('max_supply'), at } : null,
      market_cap: cap
        ? { usd: usdString(cap), source: 'coingecko', ref: ref('market_cap'), at }
        : null,
    });
  }
  return { markets, failed, ambiguous };
}

/** The market data CoinGecko gave for one of the map's tokens. */
export const marketOf = (
  markets: Map<string, CoinMarket>,
  chain: string,
  asset: string,
): CoinMarket | null => markets.get(key(chain, asset)) ?? null;

/**
 * The most there can ever be, as the chain proves it: an EVM token's cap(), a Solana mint with no mint
 * authority (its supply is all there will be), or NEAR's inflation setting (minted each epoch: no max).
 * Null when the chain can't say; the caller then takes an outside source's, named.
 */
export async function readChainMax(
  fetchImpl: Fetch,
  chain: string,
  asset: string,
  at: string,
): Promise<ValueMax | null> {
  const evm = EVM_CHAINS[chain];
  if (evm) {
    const call = async (sig: string) => {
      try {
        const { result } = await askChain<string>(
          evm,
          'eth_call',
          [{ to: asset, data: encodeCall(sig) }, 'latest'],
          { fetch: fetchImpl },
        );
        return result && /^0x[0-9a-f]{1,64}$/i.test(result) ? BigInt(result) : null;
      } catch {
        return null;
      }
    };
    const cap = await call('cap()');
    if (!cap) return null;
    const decimals = await call('decimals()');
    if (decimals === null || decimals > 77n) return null;
    return {
      amount: wholeTokens(cap, Number(decimals)),
      source: 'chain',
      ref: `cap() and decimals() on ${evm.caip2}:${asset.toLowerCase()}`,
      at,
    };
  }
  if (chain === 'solana') {
    const r = await rpc<{
      value?: {
        data?: {
          parsed?: { info?: { mintAuthority?: string | null; supply?: string; decimals?: number } };
        };
      } | null;
    }>(fetchImpl, SOLANA_RPC, 'getAccountInfo', [asset, { encoding: 'jsonParsed' }]);
    const info = r?.value?.data?.parsed?.info;
    if (!info || info.mintAuthority !== null || typeof info.supply !== 'string') return null;
    if (typeof info.decimals !== 'number') return null;
    return {
      amount: wholeTokens(BigInt(info.supply), info.decimals),
      source: 'chain',
      ref: `getAccountInfo on solana:${asset}: no mint authority, so its supply is all there can be`,
      at,
    };
  }
  if (asset === 'NEAR') {
    const c = await rpc<{ max_inflation_rate?: [number, number] }>(
      fetchImpl,
      NEAR_RPC,
      'EXPERIMENTAL_protocol_config',
      { finality: 'final' },
    );
    const rate = c?.max_inflation_rate;
    if (!Array.isArray(rate) || !(rate[0] > 0) || !(rate[1] > 0)) return null;
    return {
      amount: null,
      source: 'chain',
      ref: `max_inflation_rate ${rate[0]}/${rate[1]} in EXPERIMENTAL_protocol_config on near:mainnet: NEAR is minted each epoch, so it has no max`,
      at,
    };
  }
  return null;
}

interface LlamaProtocol {
  slug?: string;
  address?: string | null;
  parentProtocol?: string | null;
  governanceID?: string[] | null;
}
export interface LlamaSeries {
  date: number;
  tokens: Record<string, number>;
}
export interface LlamaTreasury {
  chainTvls?: Record<string, { tokens?: LlamaSeries[]; tokensInUsd?: LlamaSeries[] }>;
}

/** DefiLlama's protocol a map's address names, as its token or its DAO, by DefiLlama's treasury slugs. */
function protocolIndex(list: LlamaProtocol[]) {
  const out = new Map<string, Set<string>>();
  const add = (chain: string, address: string, slugs: string[]) => {
    const k = key(chain, address);
    const s = out.get(k) ?? new Set<string>();
    for (const x of slugs) s.add(x);
    out.set(k, s);
  };
  for (const p of list) {
    if (!p.slug) continue;
    // the parent first: a protocol's versions (uniswap-v2, -v3) share their parent's treasury
    const parent = p.parentProtocol?.startsWith('parent#') ? p.parentProtocol.slice(7) : null;
    const slugs = parent ? [parent, p.slug] : [p.slug];
    const a = p.address ?? '';
    const m = /^(?:([a-z0-9_-]+):)?(.+)$/i.exec(a);
    if (m?.[2]) {
      const named = m[1]?.toLowerCase();
      const chain = named
        ? Object.entries(LLAMA_CHAIN).find(([, c]) => c === named)?.[0]
        : m[2].startsWith('0x')
          ? 'ethereum'
          : undefined;
      if (chain) add(chain, m[2], slugs);
    }
    for (const g of p.governanceID ?? []) {
      const e = /^eip155:(\d+):(0x[0-9a-fA-F]{40})$/.exec(g);
      const chain = e?.[1] ? CHAIN_ID[e[1]] : undefined;
      if (chain && e?.[2]) add(chain, e[2], slugs);
      const c = /^[a-z]+:([a-z0-9]+):(0x[0-9a-fA-F]{40})$/.exec(g);
      const cChain = c?.[1]
        ? Object.entries(LLAMA_CHAIN).find(([, x]) => x === c[1])?.[0]
        : undefined;
      if (cChain && c?.[2]) add(cChain, c[2], slugs);
    }
  }
  return out;
}

/** The newest of a DefiLlama series, by date. */
const newest = (s: LlamaSeries[] | undefined) =>
  (s ?? []).reduce<LlamaSeries | null>((a, b) => (!a || b.date > a.date ? b : a), null);

/**
 * DefiLlama's treasury, keyless, one protocol at a time (the list of them all is paid): its protocols once,
 * then the treasury of the protocol whose token or DAO is the map's address, each asset as DefiLlama names it
 * on each chain (its own tokens apart), priced at DefiLlama's own dollars, each naming DefiLlama's URL.
 */
export function llamaTreasuries(fetchImpl: Fetch = globalThis.fetch) {
  let index: Promise<Map<string, Set<string>> | null> | null = null;
  const failed: string[] = [];
  const read = () => {
    index ??= getJson<LlamaProtocol[]>(fetchImpl, LLAMA_PROTOCOLS).then((l) => {
      if (!Array.isArray(l)) {
        failed.push(LLAMA_PROTOCOLS);
        return null;
      }
      return protocolIndex(l);
    });
    return index;
  };
  const seen = new Map<string, Promise<LlamaTreasury | null>>();
  const treasury = (slug: string) => {
    let p = seen.get(slug);
    if (!p) {
      p = getJson<LlamaTreasury>(fetchImpl, `${LLAMA_TREASURY}${slug}`);
      seen.set(slug, p);
    }
    return p;
  };

  /** The map's treasury as DefiLlama counts it, or null when DefiLlama doesn't know the map's address. */
  async function treasuryOf(
    chain: string,
    address: string,
    own: { id: string; symbol: string | null } | null,
  ): Promise<{ slug: string; treasury: ValueTreasury } | null> {
    const idx = await read();
    const slugs = idx?.get(key(chain, address));
    for (const slug of slugs ?? []) {
      const t = await treasury(slug);
      const items = t ? llamaItems(t, slug, own) : [];
      if (!items.length) continue;
      const priced = items.filter((i) => i.usd !== null);
      return {
        slug,
        treasury: {
          items,
          total: {
            usd: usdString(priced.reduce((a, i) => a + Number(i.usd), 0)),
            priced: priced.length,
            unpriced: items.length - priced.length,
          },
        },
      };
    }
    return null;
  }
  return { treasuryOf, failed };
}

/** DefiLlama's per-chain keys a treasury's assets sit under: "Ethereum", "Ethereum-OwnTokens". */
const TREASURY_KEY = /^([A-Za-z0-9 ]+?)(-OwnTokens)?$/;

/** A DefiLlama treasury's newest assets, chain by chain, skipping its sum across chains ("OwnTokens"). */
export function llamaItems(
  t: LlamaTreasury,
  slug: string,
  own: { id: string; symbol: string | null } | null,
): ValueTreasuryItem[] {
  const url = `${LLAMA_TREASURY}${slug}`;
  const items: ValueTreasuryItem[] = [];
  for (const [chainKey, series] of Object.entries(t.chainTvls ?? {})) {
    if (chainKey === 'OwnTokens') continue;
    const m = TREASURY_KEY.exec(chainKey);
    if (!m?.[1]) continue;
    const ownTokens = Boolean(m[2]);
    const amounts = newest(series.tokens);
    if (!amounts) continue;
    const dollars = newest(series.tokensInUsd);
    const at = new Date(amounts.date * 1000).toISOString();
    for (const [symbol, n] of Object.entries(amounts.tokens)) {
      const amount = decimal(n);
      if (!amount) continue;
      const usdN = dollars?.date === amounts.date ? dollars.tokens[symbol] : undefined;
      const usd = typeof usdN === 'number' && usdN > 0 ? usdN : null;
      const isOwn = ownTokens && own?.symbol && own.symbol.toLowerCase() === symbol.toLowerCase();
      items.push({
        kind: 'treasury asset',
        asset: {
          id:
            isOwn && own
              ? own.id
              : `defillama:${m[1].toLowerCase().replaceAll(' ', '-')}:${symbol}`,
          symbol,
        },
        amount,
        price:
          usd !== null
            ? {
                usd: Number((usd / n).toPrecision(6)),
                source: 'defillama',
                ref: `${symbol} on ${chainKey}, its dollars over its amount (${url})`,
                at,
              }
            : null,
        usd: usd !== null ? usdString(usd) : null,
        source: { ref: `${url} (${chainKey})`, at },
      });
    }
  }
  return items;
}

/** Where a treasury's amounts were read, in a word: defillama when every item is DefiLlama's, else chain. */
export function treasuryFrom(t: ValueTreasury | null | undefined): string | null {
  if (!t) return null;
  return t.items.length > 0 && t.items.every((i) => i.source.ref?.startsWith(LLAMA_TREASURY))
    ? 'defillama'
    : 'chain';
}
