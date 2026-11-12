// A map's token as the markets count it, and its treasury (value/v3, 12 Nov): CoinGecko's circulating, max and
// market cap; the chain's max first; DefiLlama's treasury, each naming where it came from.
import { describe, expect, test } from 'vitest';
import {
  coinGeckoMarkets,
  type LlamaTreasury,
  llamaItems,
  llamaTreasuries,
  marketOf,
  readChainMax,
  treasuryFrom,
} from '../src/marks/finance.ts';

const AT = '2026-11-12T12:00:00.000Z';
const UNI = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const json = (x: unknown) => new Response(JSON.stringify(x));

describe("CoinGecko's markets, keyless", () => {
  test('finds each token by its address on its chain, NEAR by name, and leaves an address two coins claim unsaid', async () => {
    const asked: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      asked.push(url);
      if (url.includes('/coins/list'))
        return json([
          { id: 'uniswap', platforms: { ethereum: UNI.toUpperCase().replace('0X', '0x') } },
          { id: 'twin-a', platforms: { base: '0xaa' } },
          { id: 'twin-b', platforms: { base: '0xAA' } },
        ]);
      return json([
        {
          id: 'uniswap',
          circulating_supply: 607715895.875979,
          max_supply: 1e9,
          market_cap: 3695648655,
          last_updated: AT,
        },
        { id: 'near', circulating_supply: 1311498499, max_supply: null, market_cap: 4516665124 },
      ]);
    }) as typeof fetch;
    const r = await coinGeckoMarkets(fetchImpl, [
      { chain: 'ethereum', asset: UNI },
      { chain: 'near:mainnet', asset: 'NEAR' },
      { chain: 'base', asset: '0xaa' },
    ]);
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain('ids=uniswap,near');
    expect(marketOf(r.markets, 'ethereum', UNI)).toMatchObject({
      circulating: { amount: '607715895.875979', source: 'coingecko', at: AT },
      max: { amount: '1000000000', source: 'coingecko' },
      market_cap: { usd: '3695648655.00', source: 'coingecko' },
    });
    expect(marketOf(r.markets, 'ethereum', UNI)?.circulating?.ref).toContain(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=uniswap',
    );
    expect(marketOf(r.markets, 'near:mainnet', 'NEAR')?.max).toBeNull();
    expect(marketOf(r.markets, 'base', '0xaa')).toBeNull();
    expect(r.ambiguous).toEqual(['base|0xaa: twin-a, twin-b']);
  });

  test('a list that fails is said, and nothing is guessed', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 429 })) as typeof fetch;
    const r = await coinGeckoMarkets(fetchImpl, [{ chain: 'ethereum', asset: UNI }]);
    expect(r.markets.size).toBe(0);
    expect(r.failed[0]).toContain('/coins/list');
  });
});

describe("the chain's max first", () => {
  test("NEAR's inflation setting: no max, said by the chain", async () => {
    const fetchImpl = (async () =>
      json({ result: { max_inflation_rate: [1, 40] } })) as typeof fetch;
    expect(await readChainMax(fetchImpl, 'near:mainnet', 'NEAR', AT)).toEqual({
      amount: null,
      source: 'chain',
      ref: 'max_inflation_rate 1/40 in EXPERIMENTAL_protocol_config on near:mainnet: NEAR is minted each epoch, so it has no max',
      at: AT,
    });
  });

  test('a Solana mint with no mint authority: its supply is all there can be; one with an authority says nothing', async () => {
    const mint = (authority: string | null) =>
      (async () =>
        json({
          result: {
            value: {
              data: {
                parsed: {
                  info: { mintAuthority: authority, supply: '1000000000000', decimals: 6 },
                },
              },
            },
          },
        })) as typeof fetch;
    expect(await readChainMax(mint(null), 'solana', 'Mint1', AT)).toMatchObject({
      amount: '1000000',
      source: 'chain',
    });
    expect(await readChainMax(mint('Auth1'), 'solana', 'Mint1', AT)).toBeNull();
  });
});

describe("DefiLlama's treasury", () => {
  const T: LlamaTreasury = {
    chainTvls: {
      Ethereum: {
        tokens: [
          { date: 1, tokens: { USDC: 1 } },
          { date: 1794464231, tokens: { USDC: 135.38301, WETH: 0.23765 } },
        ],
        tokensInUsd: [{ date: 1794464231, tokens: { USDC: 135.34898, WETH: 486.64854 } }],
      },
      'Ethereum-OwnTokens': {
        tokens: [{ date: 1794464231, tokens: { UNI: 262247996.30584 } }],
        tokensInUsd: [{ date: 1794464231, tokens: { UNI: 1620435291.56865 } }],
      },
      OwnTokens: {
        tokens: [{ date: 1794464231, tokens: { UNI: 262247996.30584 } }],
        tokensInUsd: [{ date: 1794464231, tokens: { UNI: 1620435291.56865 } }],
      },
    },
  };

  test("each chain's newest assets, its own token by the map's id, its sum across chains left out, each naming DefiLlama's URL", () => {
    const items = llamaItems(T, 'uniswap', { id: UNI, symbol: 'UNI' });
    expect(items.map((i) => i.asset.id)).toEqual([
      'defillama:ethereum:USDC',
      'defillama:ethereum:WETH',
      UNI,
    ]);
    expect(items[2]).toMatchObject({
      amount: '262247996.30584',
      usd: '1620435291.57',
      price: { source: 'defillama', usd: 6.17902 },
      source: { ref: 'https://api.llama.fi/treasury/uniswap (Ethereum-OwnTokens)' },
    });
  });

  test("found by the map's token through its parent protocol; the treasury says it is DefiLlama's", async () => {
    const asked: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      asked.push(url);
      if (url.endsWith('/protocols'))
        return json([{ slug: 'uniswap-v3', address: UNI, parentProtocol: 'parent#uniswap' }]);
      if (url.endsWith('/treasury/uniswap')) return json(T);
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const l = llamaTreasuries(fetchImpl);
    const found = await l.treasuryOf('ethereum', UNI, { id: UNI, symbol: 'UNI' });
    expect(found?.slug).toBe('uniswap');
    expect(found?.treasury.total).toEqual({ usd: '1620435913.57', priced: 3, unpriced: 0 });
    expect(treasuryFrom(found?.treasury)).toBe('defillama');
    expect(await l.treasuryOf('base', UNI, null)).toBeNull();
    expect(asked.filter((u) => u.endsWith('/protocols'))).toHaveLength(1);
  });
});
