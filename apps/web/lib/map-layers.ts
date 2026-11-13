// A map's layers, each with the period its data covers and who mapped it (Elco, 12 Nov, walk 3, Ref Finance:
// "the user should always be aware of the data they're seeing they should know the period that is contained in
// that data at each layer ... showing who mapped that layer"). From the map's card (SYSTEMS's GET /api/v1/maps/:id):
// its readings (the sediments, newest first), its proposals, its price; and from what Petals' mapping says about
// it, its insights. Each says only what its source says: a reading holds a moment, a price its day. Pure. Drafts.
import type { Claim } from '@petal/core/types';
import { dateLabel } from './flower-view.ts';
import { claimWho } from './map-claims.ts';
import type { CardAuthor, CardLayer } from './map-strata.ts';
import { type MapCard, makerWords } from './maps.ts';
import { dollars, sourceName } from './value-view.ts';

/** One layer, as Information lists it. */
export interface LayerLine {
  key: string;
  /** what was read, in people's words */
  name: string;
  /** the period its data covers, or the moment it was read */
  period: string;
  /** how much of it */
  count?: string | undefined;
  /** who mapped it, or where it came from */
  by?: string | undefined;
  /** where an outside source gave it */
  link?: string | undefined;
}

/**
 * What a card says of its proposals: how many, when they were read, and the span they cover, from the earliest
 * proposal's own time to the latest's (SYSTEMS's sys/cardperiod), when it says.
 */
export interface CardProposals {
  count: number;
  read_at: string;
  period?: { from: string; to: string } | null;
}

export type LayerCard = Pick<MapCard, 'readings' | 'value'> & {
  proposals?: CardProposals | null;
  /** wave 8 (composition.md §9): every layer anyone published, their authors, and how many slots differ */
  layers?: readonly CardLayer[];
  authors?: readonly CardAuthor[];
  differs?: number;
};

export const layerWords = {
  title: 'Layers',
  asOf: (day: string) => `As of ${day}`,
  on: (day: string) => `On ${day}`,
  span: (from: string, to: string) => (from === to ? `On ${from}` : `${from} to ${to}`),
  read: (day: string) => `Read ${day}`,
  accounts: (n: number) => (n === 1 ? '1 account' : `${n.toLocaleString('en-US')} accounts`),
  proposals: 'Proposals',
  proposalCount: (n: number) => n.toLocaleString('en-US'),
  price: (symbol: string | null) => (symbol ? `${symbol} price` : 'Price'),
  insights: 'Insights',
  insightCount: (n: number) => n.toLocaleString('en-US'),
} as const;

/** The address a price was read from, as its ref gives it in brackets. */
const linkOf = (ref: string): string | undefined => /\((https?:\/\/[^)\s]+)\)/.exec(ref)?.[1];

/** The span some dates cover, earliest to latest, in words. */
function spanOf(dates: readonly string[]): string | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return layerWords.span(dateLabel(sorted[0] as string), dateLabel(sorted.at(-1) as string));
}

/** The map's layers: its readings, newest first, then its proposals, its price and its insights. */
export function mapLayers(card: LayerCard, claims: readonly Claim[] | null): LayerLine[] {
  const lines: LayerLine[] = card.readings.map((r) => ({
    key: `reading:${r.snapshot}`,
    name: r.about,
    period: layerWords.asOf(dateLabel(r.as_of)),
    count: r.count === null ? undefined : layerWords.accounts(r.count),
    by: makerWords(r.made_by) ?? undefined,
  }));
  const p = card.proposals;
  if (p && p.count > 0)
    lines.push({
      key: 'proposals',
      name: layerWords.proposals,
      period: p.period
        ? layerWords.span(dateLabel(p.period.from), dateLabel(p.period.to))
        : layerWords.read(dateLabel(p.read_at)),
      count: layerWords.proposalCount(p.count),
    });
  const price = card.value?.price;
  if (price)
    lines.push({
      key: 'price',
      name: layerWords.price(card.value?.asset.symbol ?? null),
      period: layerWords.on(dateLabel(price.at)),
      count: dollars(price.usd),
      by: sourceName(price.source),
      link: price.source === 'chain' ? undefined : linkOf(price.ref),
    });
  const said = spanOf((claims ?? []).map((c) => c.issued_at));
  if (claims && claims.length > 0 && said)
    lines.push({
      key: 'insights',
      name: layerWords.insights,
      period: said,
      count: layerWords.insightCount(claims.length),
      by: [...new Set(claims.map((c) => claimWho(c.by)))].join(', '),
    });
  return lines;
}
