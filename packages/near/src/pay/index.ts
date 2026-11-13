// @petal/near/pay (W3): NEAR Intents 1Click, dry quotes only (FR-031); and paying for Petals' agent:
// a NEAR transfer read back from the chain (readTransfer) and NEAR's price from NEAR Intents (nearUsd).
import type { QuoteRequest, QuoteResult } from '@petal/core/types';

export {
  type CreditContract,
  type CreditDeps,
  callAsAccount,
  chargeCredit,
  creditBalance,
  networkOfAccount,
  usdToYocto,
  yoctoToUsd,
} from './credit.ts';
export {
  type DepositDeps,
  type DepositQuote,
  depositQuote,
  ONE_CLICK,
  payTokens,
  type SwapStatus,
  swapStatus,
} from './deposit.ts';
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
export { nearUsd, ONE_CLICK_TOKENS_URL, type PriceDeps, WRAPPED_NEAR } from './price.ts';
export {
  PAY_RECEIVER,
  readTransfer,
  type Transfer,
  type TransferDeps,
  TX_HASH,
  yoctoToNear,
} from './transfer.ts';
export type { QuoteRequest, QuoteResult };
