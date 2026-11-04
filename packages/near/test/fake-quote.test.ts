import { describe, expect, test } from 'vitest';
import { BASE_USDC, fakeQuote, toQuoteResult } from '../src/pay/fake.ts';

describe('fakeQuote (recorded 1Click dry quote)', () => {
  const quote = fakeQuote();

  test('answers the quickstart request with a dry quote of about 1.01 USDC', async () => {
    const q = await quote({ purpose: 'sponsor_refresh', amount_usd: 1 });
    expect(q).toMatchObject({
      dry: true,
      amount_in: '1.010219',
      min_amount_in: '1.000116',
      time_estimate_s: 35,
      fees: { refund_fee: '0.0024', platform_fee_bps: '1' },
      note: 'Dry quote. Paying is not switched on.',
    });
    expect(Number(q.amount_in)).toBeGreaterThan(1);
    expect(q.quoted_at).toMatch(/^2026-11-04T/);
  });

  test('defaults to 1 USD from Base USDC, for either purpose', async () => {
    await expect(quote({ purpose: 'sponsor_coverage' })).resolves.toMatchObject({ dry: true });
    await expect(
      quote({ purpose: 'sponsor_refresh', origin_asset: BASE_USDC }),
    ).resolves.toBeDefined();
  });

  test('refuses what was not recorded instead of inventing numbers', async () => {
    await expect(quote({ purpose: 'sponsor_refresh', amount_usd: 5 })).rejects.toThrow(/recorded/);
    await expect(
      quote({ purpose: 'sponsor_refresh', origin_asset: 'nep141:btc.omft.near' }),
    ).rejects.toThrow();
  });

  test('never maps a quote that could move money', () => {
    const live = {
      correlationId: 'c',
      timestamp: '2026-11-04T00:00:00.000Z',
      signature: 's',
      quoteRequest: { dry: false, originAsset: BASE_USDC, amount: '1000000' },
      quote: {
        amountIn: '1',
        amountInFormatted: '1',
        amountInUsd: '1',
        minAmountIn: '1',
        amountOut: '1',
        timeEstimate: 1,
        depositAddress: '0xabc',
      },
    };
    expect(() => toQuoteResult(live)).toThrow(/dry/);
  });
});
