// A top-up through NEAR Intents, for real: pay with any token from any chain. 1Click quotes a swap from any
// token it lists, on any chain it
// lists, into USDC for Petals' account, and gives a deposit address: the person sends one plain transfer
// there, from whatever wallet they have, and 1Click does the rest. The quote is asked for EXACT_OUTPUT, so
// the dollars Petals receives are the dollars the person asked for, and delivered into NEAR Intents under
// Petals' account (INTENTS), which needs no token storage on chain. The dry module (one-click.ts) stays dry.
// With Petals' partner key (ONE_CLICK_API_KEY), sent as X-API-Key, 1Click takes 0.20%, and
// 0.01% between stablecoins or the same token across chains; without one, 0.25% (its authentication page).
import { describe, NearError } from '../errors.ts';
import { NEAR_USDC, usdcUnits } from './one-click.ts';

export const ONE_CLICK = 'https://1click.chaindefuser.com/v0';

export interface DepositDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  base?: string;
  /** Petals' 1Click partner key; none: keyless */
  apiKey?: string;
}

/** What the person is told to send, and what it becomes. */
export interface DepositQuote {
  deposit_address: string;
  /** some chains need one beside the address */
  deposit_memo: string | null;
  origin_asset: string;
  /** in the origin token's smallest units, and as people write it */
  amount_in: string;
  amount_in_formatted: string;
  amount_in_usd: string | null;
  /** USDC on NEAR, six decimals */
  amount_out: string;
  amount_out_usd: string | null;
  /** after it, the address stops taking deposits and anything late is refunded */
  deadline: string;
}

/** Where a top-up stands. Only SUCCESS is money in. */
export interface SwapStatus {
  status: string;
  amount_out: string | null;
  amount_out_usd: string | null;
  origin_tx: string[];
  destination_tx: string[];
}

async function oneClick(deps: DepositDeps, path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (deps.apiKey) headers.set('X-API-Key', deps.apiKey);
  const res = await (deps.fetch ?? globalThis.fetch)(`${deps.base ?? ONE_CLICK}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new NearError(
      'source_failed',
      `NEAR Intents answered ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new NearError('source_failed', `NEAR Intents answered what isn't JSON: ${describe(e)}`);
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** A real quote: `usd` dollars of USDC to `recipient` inside NEAR Intents, from `originAsset`. */
export async function depositQuote(
  o: { usd: number; originAsset: string; refundTo: string; recipient: string },
  deps: DepositDeps = {},
): Promise<DepositQuote> {
  const now = (deps.now ?? (() => new Date()))();
  const body = {
    dry: false,
    swapType: 'EXACT_OUTPUT',
    slippageTolerance: 100,
    originAsset: o.originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: NEAR_USDC,
    amount: usdcUnits(o.usd),
    refundTo: o.refundTo,
    refundType: 'ORIGIN_CHAIN',
    recipient: o.recipient,
    recipientType: 'INTENTS',
    deadline: new Date(now.getTime() + 60 * 60_000).toISOString(),
    referral: 'petals',
  };
  const answer = (await oneClick(deps, '/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })) as { quote?: Record<string, unknown> };
  const q = answer.quote ?? {};
  const deposit = str(q.depositAddress);
  const amountIn = str(q.amountIn);
  const amountOut = str(q.amountOut);
  if (!deposit || !amountIn || !amountOut) {
    throw new NearError('source_failed', "NEAR Intents' quote has no deposit address or amounts");
  }
  return {
    deposit_address: deposit,
    deposit_memo: str(q.depositMemo),
    origin_asset: o.originAsset,
    amount_in: amountIn,
    amount_in_formatted: str(q.amountInFormatted) ?? amountIn,
    amount_in_usd: str(q.amountInUsd),
    amount_out: amountOut,
    amount_out_usd: str(q.amountOutUsd),
    deadline: str(q.deadline) ?? body.deadline,
  };
}

/** Where a deposit address's swap stands (GET /v0/status). */
export async function swapStatus(
  depositAddress: string,
  memo: string | null,
  deps: DepositDeps = {},
): Promise<SwapStatus> {
  const q = new URLSearchParams({ depositAddress, ...(memo ? { depositMemo: memo } : {}) });
  const answer = (await oneClick(deps, `/status?${q}`)) as {
    status?: unknown;
    swapDetails?: Record<string, unknown>;
  };
  const d = answer.swapDetails ?? {};
  const hashes = (v: unknown) =>
    Array.isArray(v)
      ? v.flatMap((h) => (typeof h?.hash === 'string' ? [h.hash as string] : []))
      : [];
  return {
    status: str(answer.status) ?? 'UNKNOWN',
    amount_out: str(d.amountOut),
    amount_out_usd: str(d.amountOutUsd),
    origin_tx: hashes(d.originChainTxHashes),
    destination_tx: hashes(d.destinationChainTxHashes),
  };
}

/** The tokens and chains a person can pay from, with their price in dollars (GET /v0/tokens). */
export async function payTokens(
  deps: DepositDeps = {},
): Promise<{ asset: string; chain: string; symbol: string; decimals: number; usd: number }[]> {
  const list = (await oneClick(deps, '/tokens')) as Record<string, unknown>[];
  return (Array.isArray(list) ? list : []).flatMap((t) =>
    typeof t.assetId === 'string' &&
    typeof t.blockchain === 'string' &&
    typeof t.symbol === 'string' &&
    typeof t.decimals === 'number' &&
    typeof t.price === 'number'
      ? [
          {
            asset: t.assetId,
            chain: t.blockchain,
            symbol: t.symbol,
            decimals: t.decimals,
            usd: t.price,
          },
        ]
      : [],
  );
}
