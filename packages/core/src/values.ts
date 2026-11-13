// value/v1: monetary estimates of a map's petals, stakes and supply. A map's token in dollars, its supply, and
// its reading's totals at that price. Each petal's own
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
/** value/v2's treasury (11 Nov): what the map's treasury holds, each asset priced or not, and the priced total. */
export interface ValueTreasuryItem {
  kind: 'treasury asset';
  accounts?: string[];
  asset: { id: string; symbol: string | null };
  amount: string;
  price: ValuePrice | null;
  usd: string | null;
  source: { snapshot?: string; ref?: string; at: string };
}
export interface ValueTreasury {
  items: ValueTreasuryItem[];
  total: { usd: string; priced: number; unpriced: number };
}
/** value/v3 (12 Nov): an amount of the token as its source says it, the chain's own or an outside source's. */
export interface ValueSaid {
  amount: string;
  source: string;
  ref: string;
  at: string;
}
/** value/v3's max: amount null when its source says there is none (NEAR's inflation, from the chain). */
export interface ValueMax {
  amount: string | null;
  source: string;
  ref: string;
  at: string;
}
/** value/v3's market cap, in dollars as its source says it. */
export interface ValueMarketCap {
  usd: string;
  source: string;
  ref: string;
  at: string;
}
export const VALUE_V3 = 'value/v3';
export interface Value {
  petal: typeof VALUE_VERSION | 'value/v2' | typeof VALUE_V3;
  about: string;
  asset: { id: string; symbol: string | null };
  price: ValuePrice | null;
  supply: ValueSupply | null;
  snapshot: string | null;
  measure: string | null;
  totals: ValueTotal[];
  /** value/v2: the map's treasury, or null when none was read */
  treasury?: ValueTreasury | null;
  /** value/v3: how much is out there, as its source counts it, or null when none said */
  circulating?: ValueSaid | null;
  /** value/v3: the most there can ever be, the chain's where it proves one, or else an outside source's */
  max?: ValueMax | null;
  /** value/v3: the market cap as its source says it */
  market_cap?: ValueMarketCap | null;
  read_at: string;
}

const compiled = new Map<string, ReturnType<ReturnType<typeof createAjv>['getSchema']>>();

const VALUE_SCHEMA: Record<string, 'valueV2' | 'valueV3'> = {
  'value/v2': 'valueV2',
  'value/v3': 'valueV3',
};

/** The value, typed, or every reason it isn't one: value/v1, value/v2 with its treasury, or value/v3. */
export function validateValue(x: unknown): Result<Value> {
  const petal = (x as { petal?: unknown } | null)?.petal;
  const name = (typeof petal === 'string' && VALUE_SCHEMA[petal]) || 'value';
  if (!compiled.has(name)) compiled.set(name, createAjv().getSchema(schemaId(name)));
  const v = compiled.get(name);
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
