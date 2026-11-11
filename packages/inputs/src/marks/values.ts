// A map's token in dollars and its supply (board #91; Elco, 11 Nov): the price from NEAR Intents' 1Click list,
// the same 229 tokens a person tops up from, read once a run, then DefiLlama's open prices for what 1Click
// doesn't list (Elco's pick, 11 Nov: "1Click, then DefiLlama"); the supply from the token's own chain. A token
// neither prices has no price: never a guess. NEAR itself (validators' and House of Stake's stake) is priced
// as wNEAR, one to one, and says so.
import type { ValuePrice, ValueSupply } from '@petal/core';
import { encodeCall } from '../evm/abi.ts';
import { askChain } from '../evm/ask.ts';
import { EVM_CHAINS } from '../evm/chains.ts';
import { NEAR_RPC, SOLANA_RPC } from './chain.ts';
import type { Fetch } from './lists.ts';

export const ONE_CLICK_TOKENS = 'https://1click.chaindefuser.com/v0/tokens';

/** How 1Click names each chain a map can be on. */
const ONE_CLICK_CHAIN: Record<string, string> = {
  ethereum: 'eth',
  base: 'base',
  arbitrum: 'arb',
  gnosis: 'gnosis',
  solana: 'sol',
  'near:mainnet': 'near',
};
/** NEAR's own coin, as 1Click lists it: wrapped one to one. */
const WNEAR = 'wrap.near';

interface Listed {
  assetId: string;
  blockchain: string;
  symbol: string;
  price: number;
  priceUpdatedAt?: string;
  contractAddress?: string;
}

/** 1Click's token list, read once and kept for the run; what it can't read is said in `failed`. */
export function oneClickPrices(fetchImpl: Fetch = globalThis.fetch) {
  let list: Promise<Listed[] | null> | null = null;
  const failed: string[] = [];
  const read = () => {
    list ??= fetchImpl(ONE_CLICK_TOKENS, { headers: { accept: 'application/json' } })
      .then(async (res) => (res.ok ? ((await res.json()) as Listed[]) : null))
      .catch(() => null)
      .then((l) => {
        if (!Array.isArray(l)) failed.push(ONE_CLICK_TOKENS);
        return Array.isArray(l) ? l : null;
      });
    return list;
  };

  /** The price of a map's asset: an EVM token or a Solana mint by its address, or NEAR. Null: no price. */
  async function priceOf(
    chain: string,
    asset: string,
  ): Promise<(ValuePrice & { symbol: string }) | null> {
    const l = await read();
    if (!l) return null;
    const near = asset === 'NEAR';
    const code = ONE_CLICK_CHAIN[near ? 'near:mainnet' : chain];
    const contract = near ? WNEAR : asset;
    if (!code || !contract) return null;
    const same =
      code === 'sol'
        ? (x: string) => x === contract
        : (x: string) => x.toLowerCase() === contract.toLowerCase();
    const t = l.find(
      (x) =>
        x.blockchain === code &&
        typeof x.contractAddress === 'string' &&
        x.contractAddress !== '' &&
        same(x.contractAddress) &&
        typeof x.price === 'number' &&
        x.price > 0,
    );
    if (!t) return null;
    return {
      usd: t.price,
      source: '1click',
      ref: near
        ? `NEAR, priced as wNEAR one to one: ${t.assetId} (${ONE_CLICK_TOKENS})`
        : `${t.assetId} (${ONE_CLICK_TOKENS})`,
      at: t.priceUpdatedAt ?? new Date().toISOString(),
      symbol: near ? 'NEAR' : t.symbol,
    };
  }
  return { priceOf, failed };
}
export const LLAMA_PRICES = 'https://coins.llama.fi/prices/current/';

/** How DefiLlama names each chain a map can be on. */
const LLAMA_CHAIN: Record<string, string> = {
  ethereum: 'ethereum',
  base: 'base',
  arbitrum: 'arbitrum',
  gnosis: 'xdai',
  solana: 'solana',
};

/** DefiLlama's open prices, one token a call, each kept for the run. */
export function llamaPrices(fetchImpl: Fetch = globalThis.fetch) {
  const seen = new Map<string, Promise<(ValuePrice & { symbol: string }) | null>>();
  const failed: string[] = [];
  function priceOf(
    chain: string,
    asset: string,
  ): Promise<(ValuePrice & { symbol: string }) | null> {
    const code = LLAMA_CHAIN[chain];
    if (!code || !asset || asset === 'NEAR') return Promise.resolve(null);
    const key = `${code}:${asset}`;
    let p = seen.get(key);
    if (!p) {
      const url = `${LLAMA_PRICES}${key}`;
      p = fetchImpl(url, { headers: { accept: 'application/json' } })
        .then(async (res) => {
          if (!res.ok) {
            failed.push(url);
            return null;
          }
          const body = (await res.json()) as {
            coins?: Record<
              string,
              { price?: number; symbol?: string; timestamp?: number; confidence?: number }
            >;
          };
          const c = Object.entries(body.coins ?? {}).find(
            ([k]) => k.toLowerCase() === key.toLowerCase(),
          )?.[1];
          if (!c || typeof c.price !== 'number' || !(c.price > 0)) return null;
          return {
            usd: c.price,
            source: 'defillama',
            ref: `${key}${typeof c.confidence === 'number' ? `, confidence ${c.confidence}` : ''} (${url})`,
            at:
              typeof c.timestamp === 'number'
                ? new Date(c.timestamp * 1000).toISOString()
                : new Date().toISOString(),
            symbol: c.symbol ?? '',
          };
        })
        .catch(() => {
          failed.push(url);
          return null;
        });
      seen.set(key, p);
    }
    return p;
  }
  return { priceOf, failed };
}

/** 1Click first, then DefiLlama for what 1Click doesn't list (Elco, 11 Nov); neither: no price. */
export function tokenPrices(fetchImpl: Fetch = globalThis.fetch) {
  const oneClick = oneClickPrices(fetchImpl);
  const llama = llamaPrices(fetchImpl);
  return {
    async priceOf(chain: string, asset: string) {
      return (await oneClick.priceOf(chain, asset)) ?? (await llama.priceOf(chain, asset));
    },
    get failed() {
      return [
        ...oneClick.failed,
        ...(llama.failed.length ? [`${LLAMA_PRICES} (${llama.failed.length} tokens)`] : []),
      ];
    },
  };
}
export type PriceReader = ReturnType<typeof tokenPrices>;

/** A raw integer amount over 10^decimals, as a decimal string with no trailing zeros. */
export function wholeTokens(raw: bigint, decimals: number): string {
  if (decimals <= 0) return raw.toString();
  const s = raw.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
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

/** How much of the asset there is, from its own chain: totalSupply() on EVM, getTokenSupply on Solana, NEAR's total. */
export async function readSupply(
  fetchImpl: Fetch,
  chain: string,
  asset: string,
  at: string,
  /** what one is called: the token's symbol */
  unit = 'tokens',
): Promise<ValueSupply | null> {
  const evm = EVM_CHAINS[chain];
  if (evm) {
    const call = async (sig: string) => {
      try {
        const { result } = await askChain<string>(
          evm,
          'eth_call',
          [{ to: asset, data: encodeCall(sig) }, 'latest'],
          {
            fetch: fetchImpl,
          },
        );
        return result && result !== '0x' ? BigInt(result) : null;
      } catch {
        return null;
      }
    };
    const supply = await call('totalSupply()');
    const decimals = await call('decimals()');
    if (supply === null || decimals === null || decimals > 77n) return null;
    return {
      amount: wholeTokens(supply, Number(decimals)),
      unit,
      source: 'chain',
      ref: `totalSupply() and decimals() on ${evm.caip2}:${asset.toLowerCase()}`,
      at,
    };
  }
  if (chain === 'solana') {
    const r = await rpc<{ value?: { uiAmountString?: string } }>(
      fetchImpl,
      SOLANA_RPC,
      'getTokenSupply',
      [asset],
    );
    const amount = r?.value?.uiAmountString;
    return amount
      ? { amount, unit, source: 'chain', ref: `getTokenSupply on solana:${asset}`, at }
      : null;
  }
  if (asset === 'NEAR') {
    const b = await rpc<{ header?: { total_supply?: string; height?: number } }>(
      fetchImpl,
      NEAR_RPC,
      'block',
      {
        finality: 'final',
      },
    );
    const yocto = b?.header?.total_supply;
    return yocto
      ? {
          amount: wholeTokens(BigInt(yocto), 24),
          unit: 'NEAR',
          source: 'chain',
          ref: `NEAR's total supply in block ${b?.header?.height ?? '?'} on near:mainnet`,
          at,
        }
      : null;
  }
  return null;
}
