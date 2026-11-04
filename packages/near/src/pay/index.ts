// @petal/near/pay (W3): NEAR Intents 1Click. Dry quotes only (FR-031): a real payment needs Elco's OK.
import type { QuoteRequest, QuoteResult } from '@petal/core/types';

export {
  BASE_USDC,
  DRY_QUOTE_NOTE,
  fakeQuote,
  type OneClickQuoteResponse,
  RECORDED_QUOTE,
  toQuoteResult,
} from './fake.ts';
export {
  DEFAULT_PAYOUT_ACCOUNT,
  DRY_REFUND_PLACEHOLDER,
  NEAR_USDC,
  ONE_CLICK_QUOTE_URL,
  type OneClickQuoteBody,
  oneClickQuoteBody,
  type QuoteDeps,
  quote1Click,
  usdcUnits,
} from './one-click.ts';
export type { QuoteRequest, QuoteResult };
