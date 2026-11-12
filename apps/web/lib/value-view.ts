// What a map's token is worth, in people's words (board #91; SYSTEMS's value/v1, on each map's card): a petal's
// dollars in its box, and the map's total and its token's supply on the map's page, each with where and when its
// price was read. No price says so, never a guess. The sums are core's (usdString), so a petal's dollars here are
// the server's to the cent.
import { usdString } from '@petal/core';

/** A map card's value, as GET /api/v1/maps carries it (packages/tools/src/value-store.ts, CardValue). */
export interface MapValue {
  asset: { id: string; symbol: string | null };
  price: { usd: number; source: string; ref: string; at: string } | null;
  supply: { amount: string; unit: string; source: 'chain'; ref: string; at: string } | null;
  supply_usd: string | null;
  total_usd: string | null;
  measure: string | null;
  totals: { measure: string; unit: string; amount: string; usd: string | null }[];
  snapshot: string | null;
  read_at: string;
}

/** Where a price comes from, by its source's own name. */
const SOURCES: Record<string, string> = {
  '1click': '1Click',
  defillama: 'DefiLlama',
  chain: 'the chain',
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Dollars as people read them: whole above a hundred, cents above a cent, three figures below. */
export function dollars(usd: string | number): string {
  const n = Number(usd);
  if (!Number.isFinite(n)) return '$0';
  if (n >= 100) return `$${Math.round(n).toLocaleString('en-US')}`;
  return `$${n >= 0.01 ? n.toFixed(2) : String(Number(n.toPrecision(3)))}`;
}

const whole = (amount: string) => Math.round(Number(amount)).toLocaleString('en-US');

export interface WorthLine {
  text: string;
  /** where and when, as a source line */
  source: string;
  /** where an outside source gave it (a price), linked beside it; none for what Petals read itself */
  link?: string;
}

/** The address a value was read from, as its ref says it in brackets; the chain's own reading has none. */
const linkOf = (ref: string): string | undefined => /\((https?:\/\/[^)\s]+)\)/.exec(ref)?.[1];

/** A price's source and, when it's outside Petals, where it was read. */
const priced = (p: NonNullable<MapValue['price']>) => {
  const link = p.source === 'chain' ? undefined : linkOf(p.ref);
  return { source: priceSource(p), ...(link ? { link } : {}) };
};

/** Where and when a price was read. */
export const priceSource = (p: NonNullable<MapValue['price']>): string =>
  `${SOURCES[p.source] ?? p.source}, ${day(p.at)}`;

/** A token's name in a line: its symbol, or "token". */
const tokenOf = (v: MapValue) => v.asset.symbol ?? 'token';

/**
 * A petal's dollars: its amount of the reading's measure at the price, when that measure is held in the priced
 * token. 'no price' when the map has a value but no price; null when there's nothing to say.
 */
export function petalWorth(
  amount: string,
  measure: string,
  v: MapValue | null | undefined,
): WorthLine | 'no price' | null {
  if (!v) return null;
  if (!v.totals.some((t) => t.measure === measure)) return null;
  if (!v.price) return 'no price';
  return {
    text: `${dollars(usdString(Number(amount) * v.price.usd))} at ${dollars(v.price.usd)} per ${tokenOf(v)}`,
    ...priced(v.price),
  };
}

/** A map's worth for its page: the reading's total, and the token's whole supply, each at the price. */
export function mapWorth(v: MapValue | null | undefined): WorthLine[] | 'no price' | null {
  if (!v) return null;
  if (!v.price) return 'no price';
  const lines: WorthLine[] = [];
  const total = v.totals.find((t) => t.measure === v.measure);
  if (total && v.total_usd)
    lines.push({
      text: `${dollars(v.total_usd)} in this reading: ${whole(total.amount)} ${total.unit} at ${dollars(v.price.usd)}`,
      ...priced(v.price),
    });
  if (v.supply)
    lines.push({
      text: `Supply ${whole(v.supply.amount)} ${v.supply.unit}${v.supply_usd ? `, ${dollars(v.supply_usd)}` : ''}`,
      source: `${SOURCES[v.supply.source] ?? v.supply.source}, ${day(v.supply.at)}`,
    });
  return lines;
}
