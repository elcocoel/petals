import { afterEach, describe, expect, test, vi } from 'vitest';
import { BASE_USDC, fakeQuote, RECORDED_QUOTE } from '../src/pay/fake.ts';
import {
  DEFAULT_PAYOUT_ACCOUNT,
  NEAR_USDC,
  ONE_CLICK_QUOTE_URL,
  oneClickQuoteBody,
  quote1Click,
  usdcUnits,
} from '../src/pay/one-click.ts';
import { type Recording, recording, replay } from './helpers/recorded.ts';

const live = recording('1click/dry-quote.json');
const recordedAt = new Date(
  Date.parse((live.request.body as { deadline: string }).deadline) - 600_000,
);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('quote1Click on the recorded dry quote (2026-11-04)', () => {
  test('sends exactly the recorded request and maps the answer', async () => {
    const f = replay(['1click/dry-quote.json']);
    const q = await quote1Click(
      { purpose: 'sponsor_refresh', amount_usd: 1 },
      { fetch: f, now: () => recordedAt },
    );
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.url).toBe(ONE_CLICK_QUOTE_URL);
    expect(q).toEqual({
      dry: true,
      amount_in: '1.010226',
      amount_in_usd: '1.009933034460',
      min_amount_in: '1.000123',
      time_estimate_s: 35,
      fees: { refund_fee: '0.0024', withdraw_fee: '0', platform_fee_bps: '1' },
      correlation_id: '3a8c7989-2ae3-46c9-8da4-3c748fe7f035',
      quoted_at: '2026-11-04T19:45:39.856Z',
      note: 'Dry quote. Paying is not switched on.',
    });
  });

  test('the request: dry, EXACT_OUTPUT, 1 USDC on NEAR Intents to the payout account, from Base USDC', () => {
    const body = oneClickQuoteBody(
      { purpose: 'sponsor_refresh' },
      { recipient: DEFAULT_PAYOUT_ACCOUNT, now: recordedAt },
    );
    expect(body).toEqual(live.request.body);
    expect(body).toMatchObject({
      dry: true,
      swapType: 'EXACT_OUTPUT',
      originAsset: BASE_USDC,
      destinationAsset: NEAR_USDC,
      amount: '1000000',
      recipient: 'petal-demo.near',
      recipientType: 'INTENTS',
    });
    expect(Date.parse(body.deadline) - recordedAt.getTime()).toBe(600_000);
  });

  test('the answer has no deposit address: nothing can be paid', () => {
    const quote = (live.response.body as { quote: Record<string, unknown> }).quote;
    expect(quote.depositAddress).toBeUndefined();
    expect((live.response.body as { quoteRequest: { dry: boolean } }).quoteRequest.dry).toBe(true);
  });

  test('agrees with the M0 stand-in (fakeQuote) on everything that was measured', async () => {
    // the M0 recording (fixtures/transcripts/, reconstructed from the 4 Nov try) has the same shape
    const m0 = '../../../../fixtures/transcripts/1click-dry-quote.json';
    expect(RECORDED_QUOTE.endsWith('fixtures/transcripts/1click-dry-quote.json')).toBe(true);
    const f = replay([m0], { ignore: ['deadline', 'referral'] });
    const fromM0 = await quote1Click({ purpose: 'sponsor_refresh' }, { fetch: f });
    expect(fromM0).toEqual(await fakeQuote()({ purpose: 'sponsor_refresh' }));
  });
});

describe('quote1Click guards (FR-031: dry only)', () => {
  const answer = (body: unknown, status = 201) =>
    (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

  test('refuses an answer that is not dry or carries a deposit address', async () => {
    const res = structuredClone(live.response.body) as Recording['response']['body'] & {
      quote: Record<string, unknown>;
      quoteRequest: Record<string, unknown>;
    };
    res.quote.depositAddress = '0xabc';
    await expect(
      quote1Click({ purpose: 'sponsor_refresh' }, { fetch: answer(res) }),
    ).rejects.toMatchObject({
      code: 'internal',
      message: expect.stringMatching(/dry/),
    });
    const notDry = structuredClone(live.response.body) as typeof res;
    notDry.quoteRequest.dry = false;
    await expect(
      quote1Click({ purpose: 'sponsor_refresh' }, { fetch: answer(notDry) }),
    ).rejects.toThrow(/dry/);
  });

  test('pays out to PETAL_PAYOUT_ACCOUNT when set', async () => {
    vi.stubEnv('PETAL_PAYOUT_ACCOUNT', 'petals.near');
    const f = replay(['1click/dry-quote.json'], { ignore: ['recipient', 'deadline'] });
    await quote1Click({ purpose: 'sponsor_coverage' }, { fetch: f });
    expect(f.calls[0]?.body).toMatchObject({ recipient: 'petals.near', dry: true });
  });

  test('bad input is refused before any request', async () => {
    const f = replay([]);
    for (const req of [
      { purpose: 'sponsor_refresh' as const, amount_usd: 0 },
      { purpose: 'sponsor_refresh' as const, amount_usd: -1 },
      { purpose: 'sponsor_refresh' as const, amount_usd: 1_000_000 },
      { purpose: 'sponsor_refresh' as const, amount_usd: 1.0000001 },
      { purpose: 'sponsor_refresh' as const, origin_asset: 'nep141:btc.omft.near' },
      { purpose: 'pay_me' as 'sponsor_refresh' },
    ]) {
      await expect(quote1Click(req, { fetch: f })).rejects.toMatchObject({ code: 'bad_input' });
    }
    expect(f.calls).toHaveLength(0);
    expect(usdcUnits(2.5)).toBe('2500000');
    expect(
      oneClickQuoteBody(
        {
          purpose: 'sponsor_refresh',
          origin_asset: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
        },
        { recipient: 'r.near', now: recordedAt },
      ).originAsset,
    ).toMatch(/^nep141:arb-/);
  });

  test('HTTP errors carry tools.md codes', async () => {
    const req = { purpose: 'sponsor_refresh' as const };
    await expect(
      quote1Click(req, { fetch: answer({ message: 'refundTo is not valid' }, 400) }),
    ).rejects.toMatchObject({
      code: 'bad_input',
      message: expect.stringMatching(/refundTo is not valid/),
    });
    await expect(quote1Click(req, { fetch: answer({}, 429) })).rejects.toMatchObject({
      code: 'rate_limited',
    });
    await expect(quote1Click(req, { fetch: answer({}, 502) })).rejects.toMatchObject({
      code: 'source_failed',
    });
    await expect(quote1Click(req, { fetch: answer({ nope: 1 }) })).rejects.toMatchObject({
      code: 'source_failed',
      message: expect.stringMatching(/shape/),
    });
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(quote1Click(req, { fetch: down })).rejects.toMatchObject({
      code: 'source_failed',
    });
  });
});
