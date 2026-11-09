// nearUsd (9 Nov, specs/003-target/proposal-payment.md): NEAR's price in dollars, from NEAR Intents' own
// list of the tokens it swaps (1Click, keyless). A top-up becomes dollars at this price, because NEAR AI
// bills in dollars.
import { describe } from '../errors.ts';

export const ONE_CLICK_TOKENS_URL = 'https://1click.chaindefuser.com/v0/tokens';
/** NEAR on NEAR Intents: wrapped NEAR, one for one with NEAR. */
export const WRAPPED_NEAR = 'nep141:wrap.near';

export interface PriceDeps {
  fetch?: typeof fetch;
  url?: string;
  onWarning?: (message: string) => void;
}

/** Dollars per NEAR, or null when NEAR Intents can't say. */
export async function nearUsd(deps: PriceDeps = {}): Promise<number | null> {
  const warn = deps.onWarning ?? (() => {});
  try {
    const res = await (deps.fetch ?? globalThis.fetch)(deps.url ?? ONE_CLICK_TOKENS_URL);
    const list = (await res.json()) as { assetId?: string; price?: unknown }[];
    const price = Array.isArray(list) ? list.find((t) => t.assetId === WRAPPED_NEAR)?.price : null;
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) return price;
    warn("NEAR Intents' token list has no price for NEAR");
  } catch (e) {
    warn(`couldn't read NEAR's price from NEAR Intents: ${describe(e)}`);
  }
  return null;
}
