// quote1Click (T042): a NEAR Intents 1Click quote, DRY ONLY (FR-031). Someone would pay
// `amount_usd` USDC, received on NEAR Intents by Petal's payout account, from Base USDC by default
// (EXACT_OUTPUT). A dry quote creates no deposit address, so no money can move. This module never
// sends a request without `dry: true` and refuses any answer that carries a deposit address.
// Keyless: 1Click allowed 1,200 dry quotes per 60 s without a JWT on 2026-11-04.
import { runSignal } from '@petal/core';
import type { QuoteRequest, QuoteResult } from '@petal/core/types';
import { describe, NearError } from '../errors.ts';
import { BASE_USDC, type OneClickQuoteResponse, toQuoteResult } from './fake.ts';

export const ONE_CLICK_QUOTE_URL = 'https://1click.chaindefuser.com/v0/quote';
/** USDC on NEAR (the destination: what Petal's account would receive) */
export const NEAR_USDC = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
/** Stand-in payout account, as in the 4 Nov try, from before petals.near existed (T147). */
export const DEFAULT_PAYOUT_ACCOUNT = 'petal-demo.near';
/**
 * The example refund address from the 1Click OpenAPI spec. A dry quote creates no deposit, so
 * nothing is ever refunded to it; 1Click only checks that it is a valid address on the origin
 * chain (the dead address 0x…dEaD is refused).
 */
export const DRY_REFUND_PLACEHOLDER = '0x2527D02599Ba641c19FEa793cD0F167589a0f10D';
/** origin assets on EVM chains, where the placeholder above is a valid refund address */
const EVM_ORIGIN = /^nep141:(base|arb|eth|op|pol|bsc|avax|gnosis)(-0x[0-9a-f]{40})?\.omft\.near$/;
const MAX_USD = 1000;

export interface OneClickQuoteBody {
  dry: true;
  swapType: 'EXACT_OUTPUT';
  slippageTolerance: number;
  originAsset: string;
  depositType: 'ORIGIN_CHAIN';
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: 'ORIGIN_CHAIN';
  recipient: string;
  recipientType: 'INTENTS';
  deadline: string;
  referral: string;
}

export interface QuoteDeps {
  fetch?: typeof fetch;
  /** default PETAL_PAYOUT_ACCOUNT, else petal-demo.near */
  recipient?: string;
  now?: () => Date;
  url?: string;
  /** per request; default 10 s */
  timeoutMs?: number;
}

function bad(message: string): never {
  throw new NearError('bad_input', message);
}

/** USD → USDC base units (6 decimals), as a decimal string. 1 USDC is taken as 1 USD. */
export function usdcUnits(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0 || usd > MAX_USD)
    bad(`amount_usd must be more than 0 and at most ${MAX_USD}`);
  const units = Math.round(usd * 1e6);
  if (Math.abs(units - usd * 1e6) > 1e-6) bad('amount_usd has more than 6 decimals');
  return String(units);
}

/** The exact body quote1Click sends. Always dry. */
export function oneClickQuoteBody(
  req: QuoteRequest,
  opts: { recipient: string; now: Date },
): OneClickQuoteBody {
  if (req.purpose !== 'sponsor_refresh' && req.purpose !== 'sponsor_coverage')
    bad('purpose must be sponsor_refresh or sponsor_coverage');
  const originAsset = req.origin_asset ?? BASE_USDC;
  if (!EVM_ORIGIN.test(originAsset))
    bad(`origin_asset ${originAsset}: dry quotes support EVM origins only (default Base USDC)`);
  return {
    dry: true,
    swapType: 'EXACT_OUTPUT',
    slippageTolerance: 100,
    originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: NEAR_USDC,
    amount: usdcUnits(req.amount_usd ?? 1),
    refundTo: DRY_REFUND_PLACEHOLDER,
    refundType: 'ORIGIN_CHAIN',
    recipient: opts.recipient,
    recipientType: 'INTENTS',
    deadline: new Date(opts.now.getTime() + 10 * 60_000).toISOString(),
    referral: 'petal',
  };
}

function isQuoteResponse(x: unknown): x is OneClickQuoteResponse {
  const r = x as OneClickQuoteResponse | null;
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.correlationId === 'string' &&
    typeof r.timestamp === 'string' &&
    typeof r.quoteRequest === 'object' &&
    typeof r.quote === 'object' &&
    r.quote !== null &&
    typeof r.quote.amountInFormatted === 'string' &&
    typeof r.quote.minAmountIn === 'string'
  );
}

/** POST https://1click.chaindefuser.com/v0/quote with dry: true, swapType EXACT_OUTPUT. */
export async function quote1Click(req: QuoteRequest, deps: QuoteDeps = {}): Promise<QuoteResult> {
  const recipient = deps.recipient || process.env.PETAL_PAYOUT_ACCOUNT || DEFAULT_PAYOUT_ACCOUNT;
  const body = oneClickQuoteBody(req, { recipient, now: (deps.now ?? (() => new Date()))() });
  // FR-031: belt and braces, in case anyone edits the builder above.
  if (body.dry !== true) throw new NearError('internal', 'refusing a non-dry 1Click quote');

  const doFetch = deps.fetch ?? globalThis.fetch;
  let res: Response;
  try {
    res = await doFetch(deps.url ?? ONE_CLICK_QUOTE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: runSignal(AbortSignal.timeout(deps.timeoutMs ?? 10_000)),
    });
  } catch (e) {
    throw new NearError('source_failed', `1Click quote: ${describe(e)}`, { cause: e });
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const message = (json as { message?: unknown } | undefined)?.message;
    const detail = typeof message === 'string' ? message : text.slice(0, 200);
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after'));
      throw new NearError('rate_limited', `1Click quote: HTTP 429 ${detail}`, {
        ...(Number.isFinite(retry) && retry > 0 ? { retry_after_s: retry } : {}),
      });
    }
    if (res.status >= 400 && res.status < 500)
      throw new NearError('bad_input', `1Click quote: HTTP ${res.status} ${detail}`);
    throw new NearError('source_failed', `1Click quote: HTTP ${res.status} ${detail}`);
  }
  if (!isQuoteResponse(json))
    throw new NearError('source_failed', '1Click quote: unexpected response shape');
  try {
    return toQuoteResult(json);
  } catch (e) {
    // a quote that is not dry, or carries a deposit address: never shown, never paid
    throw new NearError('internal', `1Click quote refused: ${describe(e)}`, { cause: e });
  }
}
