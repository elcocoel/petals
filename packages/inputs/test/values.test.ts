// A map's token in dollars and its supply (board #91): 1Click's price, matched by chain and address, and the
// supply from the token's own chain. On a fake fetch.
import { describe, expect, test } from 'vitest';
import { ETHEREUM } from '../src/evm/chains.ts';
import { NEAR_RPC, SOLANA_RPC } from '../src/marks/chain.ts';
import {
  LLAMA_PRICES,
  ONE_CLICK_TOKENS,
  oneClickPrices,
  readSupply,
  tokenPrices,
  wholeTokens,
} from '../src/marks/values.ts';

const AT = '2026-11-11T14:00:00.000Z';
const UNI = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const LIST = [
  {
    assetId: 'nep141:wrap.near',
    blockchain: 'near',
    symbol: 'wNEAR',
    price: 3.77,
    priceUpdatedAt: AT,
    contractAddress: 'wrap.near',
  },
  {
    assetId: `nep141:eth-${UNI}.omft.near`,
    blockchain: 'eth',
    symbol: 'UNI',
    price: 6.49,
    priceUpdatedAt: AT,
    contractAddress: '0x1F9840a85d5aF5bf1D1762F925BDADdC4201F984',
  },
  {
    assetId: 'nep141:eth.omft.near',
    blockchain: 'eth',
    symbol: 'ETH',
    price: 2051.83,
    priceUpdatedAt: AT,
  },
];
const json = (body: unknown) => new Response(JSON.stringify(body));

describe('prices from 1Click', () => {
  const prices = () => oneClickPrices((async () => json(LIST)) as unknown as typeof fetch);

  test('a token by its chain and address, in any case, saying which 1Click asset it is and when', async () => {
    expect(await prices().priceOf('ethereum', UNI)).toEqual({
      usd: 6.49,
      source: '1click',
      ref: `nep141:eth-${UNI}.omft.near (${ONE_CLICK_TOKENS})`,
      at: AT,
      symbol: 'UNI',
    });
  });

  test("NEAR is priced as wNEAR, one to one, and says so; a token 1Click doesn't list has no price", async () => {
    const p = prices();
    expect(await p.priceOf('near:mainnet', 'NEAR')).toMatchObject({ usd: 3.77, symbol: 'NEAR' });
    expect((await p.priceOf('near:mainnet', 'NEAR'))?.ref).toMatch(
      /^NEAR, priced as wNEAR one to one/,
    );
    expect(await p.priceOf('gnosis', '0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6')).toBeNull();
    // a chain's own coin, which has no contract, never stands in for a token
    expect(await p.priceOf('ethereum', '')).toBeNull();
  });

  test("a list that can't be read prices nothing and says so", async () => {
    const p = oneClickPrices(
      (async () => new Response('down', { status: 503 })) as unknown as typeof fetch,
    );
    expect(await p.priceOf('ethereum', UNI)).toBeNull();
    expect(p.failed).toEqual([ONE_CLICK_TOKENS]);
  });
});

describe("1Click first, then DefiLlama (Elco's pick, 11 Nov)", () => {
  const SKR = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === ONE_CLICK_TOKENS) return json(LIST);
    if (url === `${LLAMA_PRICES}solana:${SKR}`)
      return json({
        coins: {
          [`solana:${SKR}`]: {
            price: 0.0111,
            symbol: 'SKR',
            timestamp: 1794406086,
            confidence: 0.999,
          },
        },
      });
    if (url.startsWith(LLAMA_PRICES)) return json({ coins: {} });
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;

  test("1Click's price when it lists the token, DefiLlama's when it doesn't, with its confidence and time; neither, no price", async () => {
    const p = tokenPrices(fetchImpl);
    expect((await p.priceOf('ethereum', UNI))?.source).toBe('1click');
    expect(await p.priceOf('solana', SKR)).toEqual({
      usd: 0.0111,
      source: 'defillama',
      ref: `solana:${SKR}, confidence 0.999 (${LLAMA_PRICES}solana:${SKR})`,
      at: new Date(1794406086 * 1000).toISOString(),
      symbol: 'SKR',
    });
    expect(await p.priceOf('gnosis', '0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6')).toBeNull();
    expect(p.failed).toEqual([]);
  });
});

describe('supply from the chain', () => {
  test('whole tokens from a raw amount and its decimals', () => {
    expect(wholeTokens(1000000000000000000000000000n, 18)).toBe('1000000000');
    expect(wholeTokens(1234500n, 6)).toBe('1.2345');
    expect(wholeTokens(42n, 0)).toBe('42');
  });

  test("an EVM token's totalSupply() and decimals(), a Solana mint's getTokenSupply, NEAR's total at a block", async () => {
    const endpoints = new Set(ETHEREUM.endpoints.map((e) => e.url));
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as { method: string; params: [{ data: string }] };
      if (endpoints.has(url)) {
        const sel = body.params[0].data.slice(0, 10);
        const word = (n: bigint) => `0x${n.toString(16).padStart(64, '0')}`;
        return json({
          jsonrpc: '2.0',
          id: 'petal',
          result: sel === '0x18160ddd' ? word(10n ** 27n) : word(18n),
        });
      }
      if (url === SOLANA_RPC)
        return json({ result: { value: { uiAmountString: '10717849450.85' } } });
      if (url === NEAR_RPC)
        return json({
          result: { header: { total_supply: '1311421176746615225167821223387495', height: 7 } },
        });
      return new Response('', { status: 404 });
    }) as typeof fetch;
    expect(await readSupply(fetchImpl, 'ethereum', UNI, AT, 'UNI')).toEqual({
      amount: '1000000000',
      unit: 'UNI',
      source: 'chain',
      ref: `totalSupply() and decimals() on eip155:1:${UNI}`,
      at: AT,
    });
    expect(
      await readSupply(
        fetchImpl,
        'solana',
        'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3',
        AT,
        'SKR',
      ),
    ).toMatchObject({
      amount: '10717849450.85',
      unit: 'SKR',
    });
    expect(await readSupply(fetchImpl, 'near:mainnet', 'NEAR', AT)).toMatchObject({
      amount: '1311421176.746615225167821223387495',
      unit: 'NEAR',
      ref: "NEAR's total supply in block 7 on near:mainnet",
    });
  });
});
