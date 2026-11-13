// A real 1Click quote: Petals' partner key goes as X-API-Key when it's set,
// and nothing is sent when it isn't. A fake 1Click: no money moves.
import { describe, expect, test } from 'vitest';
import { depositQuote } from '../src/pay/deposit.ts';

const QUOTE = {
  quote: {
    depositAddress: '0xdeposit',
    amountIn: '1000000',
    amountInFormatted: '1',
    amountOut: '1000000',
    deadline: '2026-11-11T00:00:00.000Z',
  },
};

function fake() {
  const keys: (string | null)[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    keys.push(new Headers(init?.headers).get('x-api-key'));
    return new Response(JSON.stringify(QUOTE), { headers: { 'content-type': 'application/json' } });
  };
  return { fetch, keys };
}

const ASK = {
  usd: 1,
  originAsset: 'nep141:base-0xusdc.omft.near',
  refundTo: '0xme',
  recipient: 'petals.near',
};

describe('depositQuote', () => {
  test("sends Petals' partner key as X-API-Key when it's set, and none when it isn't", async () => {
    const keyed = fake();
    expect(
      (await depositQuote(ASK, { fetch: keyed.fetch, apiKey: 'jwt-test' })).deposit_address,
    ).toBe('0xdeposit');
    expect(keyed.keys).toEqual(['jwt-test']);
    const keyless = fake();
    await depositQuote(ASK, { fetch: keyless.fetch });
    expect(keyless.keys).toEqual([null]);
  });
});
