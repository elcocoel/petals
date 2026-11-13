// payouts/v1 (12 Nov): an unopinionated "payouts from this treasury over a period": what a DAO paid out, one
// payout each, read from its own chain, kept by the map's address. A payout is money that left the
// DAO for someone, by a proposal that passed and ran: from, to, what, how much, when it was paid, the proposal
// and its kind, and its dollars on the day it was paid, named as its source's. A move between the DAO's own
// accounts isn't one; neither is a proposal's bond coming back. What isn't known is null, never a guess.
import { createAjv, schemaId } from './schema/ajv.ts';
import type { Result, ValidationIssue } from './types/index.ts';

export const PAYOUTS_VERSION = 'payouts/v1';

export interface PayoutUsd {
  /** the amount in dollars, as decimal text */
  usd: string;
  /** one whole token in dollars, as its source priced it nearest the payout */
  price: number;
  source: string;
  ref: string;
  /** when its source priced it */
  at: string;
}
export interface Payout {
  from: string;
  to: string;
  /** what was paid: NEAR, or a token by its contract (near:mainnet:<account>), its symbol and decimals as its contract says */
  asset: { id: string; symbol: string | null; decimals: number | null };
  /** whole tokens as decimal text, or null when the token's decimals couldn't be read */
  amount: string | null;
  /** the amount in the token's smallest unit, as the chain says it */
  raw: string;
  /** when it was paid: the block of the DAO's own transfer; null when that transfer wasn't found */
  when: string | null;
  proposal: { id: string; kind: string; ref: string; at: string };
  usd: PayoutUsd | null;
  /** the transaction that paid it, when found */
  evidence: { tx: string; block: number; ref: string } | null;
}
export interface Payouts {
  petal: typeof PAYOUTS_VERSION;
  about: string;
  source: { kind: string; contract: string; ref: string; at: string };
  payouts: Payout[];
  read_at: string;
}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** The payouts, typed, or every reason they aren't. */
export function validatePayouts(x: unknown): Result<Payouts> {
  compiled ??= createAjv().getSchema(schemaId('payouts'));
  if (!compiled) throw new Error('payouts schema not registered');
  if (compiled(x)) return { ok: true, value: x as Payouts };
  return {
    ok: false,
    errors: (compiled.errors ?? []).map(
      (e): ValidationIssue => ({
        path: e.instancePath,
        rule: 'schema',
        message: e.message ?? 'invalid',
      }),
    ),
  };
}

/** A whole-token sum as decimal text, from the smallest units and the token's decimals. */
function wholeOf(raw: bigint, decimals: number): string {
  if (decimals <= 0) return raw.toString();
  const s = raw.toString().padStart(decimals + 1, '0');
  const frac = s.slice(-decimals).replace(/0+$/, '');
  return frac ? `${s.slice(0, -decimals)}.${frac}` : s.slice(0, -decimals);
}
export interface PayoutsAsk {
  /** paid at or after (ISO) */
  since?: string;
  /** paid before (ISO) */
  until?: string;
}
export interface PayoutsInPeriod {
  period: { since: string | null; until: string | null };
  payouts: Payout[];
  totals: {
    count: number;
    recipients: number;
    /** the priced payouts' dollars, as decimal text; unpriced aren't in it */
    usd: string;
    priced: number;
    unpriced: number;
    /** each asset's sum, in whole tokens, and its dollars at each payout's own day */
    assets: Array<{
      asset: Payout['asset'];
      amount: string | null;
      count: number;
      usd: string | null;
    }>;
  };
  /** payouts with no known date: out of any period asked for, counted here */
  undated: number;
}

const usdText = (n: number) => (n > 0 ? n.toFixed(2) : '0');

/**
 * The payouts in a period, by when each was paid (since inclusive, until exclusive; neither: all of them),
 * and their totals: how many, to how many recipients, each asset's sum, and the dollars of those priced.
 */
export function payoutsIn(p: Payouts, ask: PayoutsAsk = {}): PayoutsInPeriod {
  const since = ask.since ? Date.parse(ask.since) : null;
  const until = ask.until ? Date.parse(ask.until) : null;
  const period = since !== null || until !== null;
  const undated = period ? p.payouts.filter((x) => x.when === null).length : 0;
  const payouts = p.payouts.filter((x) => {
    if (!period) return true;
    if (x.when === null) return false;
    const t = Date.parse(x.when);
    return (since === null || t >= since) && (until === null || t < until);
  });
  const byAsset = new Map<
    string,
    { asset: Payout['asset']; raw: bigint; count: number; usd: number; priced: number }
  >();
  let usd = 0;
  let priced = 0;
  for (const x of payouts) {
    const a = byAsset.get(x.asset.id) ?? {
      asset: x.asset,
      raw: 0n,
      count: 0,
      usd: 0,
      priced: 0,
    };
    a.raw += BigInt(x.raw);
    a.count++;
    if (x.usd) {
      a.usd += Number(x.usd.usd);
      a.priced++;
      usd += Number(x.usd.usd);
      priced++;
    }
    byAsset.set(x.asset.id, a);
  }
  return {
    period: { since: ask.since ?? null, until: ask.until ?? null },
    payouts,
    totals: {
      count: payouts.length,
      recipients: new Set(payouts.map((x) => x.to)).size,
      usd: usdText(usd),
      priced,
      unpriced: payouts.length - priced,
      assets: [...byAsset.values()].map((a) => ({
        asset: a.asset,
        amount: a.asset.decimals === null ? null : wholeOf(a.raw, a.asset.decimals),
        count: a.count,
        usd: a.priced ? usdText(a.usd) : null,
      })),
    },
    undated,
  };
}
