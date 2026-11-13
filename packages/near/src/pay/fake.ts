// fakeQuote(): replays the recorded 1Click dry quote (T021), for tests and the keyless judge
// path. Same signature as quote1Click. It answers only what was recorded (1 USD from Base USDC)
// and refuses anything else rather than inventing numbers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { QuoteRequest, QuoteResult } from '@petal/core/types';

export const DRY_QUOTE_NOTE = 'Dry quote. Paying is not switched on.';
export const BASE_USDC = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';

/** The recorded dry quote: fixtures/transcripts/1click-dry-quote.json. */
export const RECORDED_QUOTE: string = fileURLToPath(
  new URL('../../../../fixtures/transcripts/1click-dry-quote.json', import.meta.url),
);

/** A 1Click POST /v0/quote response body, as far as Petal reads it. */
export interface OneClickQuoteResponse {
  correlationId: string;
  timestamp: string;
  signature: string;
  quoteRequest: Record<string, unknown> & { dry: boolean; originAsset: string; amount: string };
  quote: {
    amountIn: string;
    amountInFormatted: string;
    amountInUsd: string;
    minAmountIn: string;
    amountOut: string;
    timeEstimate: number;
    refundFee?: string;
    withdrawFee?: string;
    depositAddress?: string;
  };
}

/** Base units → decimal string. */
function units(raw: string, decimals: number): string {
  const s = raw.padStart(decimals + 1, '0');
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  const int = s.slice(0, s.length - decimals);
  return frac ? `${int}.${frac}` : int;
}

/** Map a dry 1Click response to QuoteResult. Refuses anything that is not dry. */
export function toQuoteResult(r: OneClickQuoteResponse, decimals = 6): QuoteResult {
  if (r.quoteRequest.dry !== true || r.quote.depositAddress) {
    throw new Error('not a dry quote: FR-031 forbids real payments without the operator’s OK');
  }
  const fees: Record<string, string> = {};
  if (r.quote.refundFee) fees.refund_fee = units(r.quote.refundFee, decimals);
  if (r.quote.withdrawFee) fees.withdraw_fee = units(r.quote.withdrawFee, decimals);
  const appFees = r.quoteRequest.appFees as { fee: number }[] | undefined;
  if (appFees?.length) fees.platform_fee_bps = String(appFees.reduce((a, f) => a + f.fee, 0));
  return {
    dry: true,
    amount_in: r.quote.amountInFormatted,
    amount_in_usd: r.quote.amountInUsd,
    min_amount_in: units(r.quote.minAmountIn, decimals),
    time_estimate_s: r.quote.timeEstimate,
    fees,
    correlation_id: r.correlationId,
    quoted_at: r.timestamp,
    note: DRY_QUOTE_NOTE,
  };
}

export function fakeQuote(
  file: string = RECORDED_QUOTE,
): (req: QuoteRequest) => Promise<QuoteResult> {
  const recorded = JSON.parse(readFileSync(file, 'utf8')) as {
    response: { body: OneClickQuoteResponse };
  };
  const result = toQuoteResult(recorded.response.body);
  return async (req) => {
    const amount = req.amount_usd ?? 1;
    const origin = req.origin_asset ?? BASE_USDC;
    if (amount !== 1 || origin !== BASE_USDC) {
      throw new Error('fakeQuote: only the recorded quote exists (1 USD paid from Base USDC)');
    }
    return { ...result, fees: { ...result.fees } };
  };
}
