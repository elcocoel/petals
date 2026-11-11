// value/v1 (board #91; Elco, 11 Nov: "monetary estimates of the value of these petals and the stakes and the
// supply"): a map's token in dollars, its supply, and its reading's totals at that price. Each petal's own
// value is a piece of data beside the snapshot's (valuePieces), like a person's names: the look draws it only
// where a view names it. A token with no price has no value pieces and no totals in dollars, never a guess.
import { canonicalJson, sha256Hex } from './hash.ts';
import { createAjv, schemaId } from './schema/ajv.ts';
import type { SeamPiece } from './seam.ts';
import type { Result, Snapshot, ValidationIssue } from './types/index.ts';

export const VALUE_VERSION = 'value/v1';

export interface ValuePrice {
  usd: number;
  source: string;
  ref: string;
  at: string;
}
export interface ValueSupply {
  amount: string;
  unit: string;
  source: 'chain';
  ref: string;
  at: string;
}
export interface ValueTotal {
  measure: string;
  unit: string;
  amount: string;
  usd: string | null;
}
export interface Value {
  petal: typeof VALUE_VERSION;
  about: string;
  asset: { id: string; symbol: string | null };
  price: ValuePrice | null;
  supply: ValueSupply | null;
  snapshot: string | null;
  measure: string | null;
  totals: ValueTotal[];
  read_at: string;
}

let compiled: ReturnType<ReturnType<typeof createAjv>['getSchema']> | undefined;

/** The value, typed, or every reason it isn't one. */
export function validateValue(x: unknown): Result<Value> {
  if (!compiled) compiled = createAjv().getSchema(schemaId('value'));
  const v = compiled;
  if (!v) throw new Error('value schema not registered');
  if (v(x)) return { ok: true, value: x as Value };
  return {
    ok: false,
    errors: (v.errors ?? []).map(
      (e): ValidationIssue => ({
        path: e.instancePath,
        rule: 'schema',
        message: e.message ?? 'invalid',
      }),
    ),
  };
}

/** Dollars, as the format writes them: cents, or three significant figures below a cent. */
export function usdString(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 0.01) return n.toFixed(2);
  return String(Number(n.toPrecision(3)));
}

/** A whole-token amount as the format writes it, from a sum. */
const amountString = (n: number) => (Number.isFinite(n) && n > 0 ? String(n) : '0');

const sameAsset = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Each amount measure the snapshot holds in this asset: its unit and, per participant, its sum. */
function heldIn(s: Snapshot, asset: string) {
  const out = new Map<string, { unit: string; by: Map<string, number> }>();
  for (const h of s.holdings) {
    if (typeof h.asset !== 'string' || !sameAsset(h.asset, asset)) continue;
    const amount = Number(h.amount);
    if (!Number.isFinite(amount)) continue;
    const m = out.get(h.measure) ?? { unit: h.unit, by: new Map<string, number>() };
    m.by.set(h.participant, (m.by.get(h.participant) ?? 0) + amount);
    out.set(h.measure, m);
  }
  return out;
}

/** The reading's totals in the asset, each in dollars at the price, or null without one. */
export function valueTotals(s: Snapshot, asset: string, price: ValuePrice | null): ValueTotal[] {
  return [...heldIn(s, asset)].map(([measure, m]) => {
    const sum = [...m.by.values()].reduce((a, b) => a + b, 0);
    return {
      measure,
      unit: m.unit,
      amount: amountString(sum),
      usd: price ? usdString(sum * price.usd) : null,
    };
  });
}

/**
 * Each petal's value in dollars, as pieces of data beside the snapshot's own: one per amount measure held in
 * the priced asset, named <measure>_usd, standing inferred (a price times what the chain says), as of the
 * price's time, and named by the hash of what it was made from. No price: none.
 */
export function valuePieces(s: Snapshot, v: Value | null): SeamPiece[] {
  if (!v?.price) return [];
  // the price is the token's, whichever reading of the map: a newer one is priced the same
  const price = v.price;
  return [...heldIn(s, v.asset.id)].map(([measure, m]) => ({
    name: `${measure}_usd`,
    kind: 'amount' as const,
    unit: 'USD',
    label: `${measure.replaceAll('_', ' ')} in dollars`,
    standing: 'inferred' as const,
    layer: sha256Hex(canonicalJson({ value: VALUE_VERSION, about: v.about, measure, price })),
    as_of: price.at,
    values: [...m.by].map(([participant, amount]) => ({
      participant,
      value: usdString(amount * price.usd),
    })),
  }));
}
