// biome-ignore-all lint/correctness/noUnusedFunctionParameters: stub signatures (T016); delete this line once built
// @petal/near/pay (W3): NEAR Intents 1Click. Dry quotes only (FR-031): a real payment needs Elco's OK.
import { notImplemented } from '@petal/core';
import type { QuoteRequest, QuoteResult } from '@petal/core/types';

export { fakeQuote } from './fake.ts';
export type { QuoteRequest, QuoteResult };

/** POST https://1click.chaindefuser.com/v0/quote with dry: true, swapType EXACT_OUTPUT. */
export async function quote1Click(req: QuoteRequest): Promise<QuoteResult> {
  return notImplemented('quote1Click');
}
