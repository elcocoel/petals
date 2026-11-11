// How a flower reads beside its drawing: its title and date, the reading key and one petal's detail.
// Pure, from the spec and what the render returned; the renderer's numbers and words are never
// re-derived here, only laid out.
import { pictureQuery } from '@petal/core';
import type { LegendItem, PetalDetail, Spec, View } from '@petal/core/types';

/**
 * A flower's still picture, in the person's view (lib/person-view.ts). The browser and Vercel's edge keep
 * each one for a year, so its address names the look and the view it's drawn with: when either changes,
 * every picture has a new address and nobody sees the old one from a cache.
 */
export const flowerImage = (id: string, view: View) =>
  `/api/v1/flowers/${encodeURIComponent(id)}/svg?${pictureQuery(view)}`;

/** A row of GET /api/v1/flowers. */
export interface ListedFlower {
  id: string;
  title: string | null;
  network: string;
  as_of: string;
  maker: string | null;
  published_at: string | null;
  where: 'map' | 'fixture';
  tx_hash?: string;
}

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** 2026-11-03T19:42:00Z as "3 Nov 2026". Read from the text, so it never shifts with a timezone. */
export function dateLabel(asOf: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf);
  if (!m) return asOf;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

const CHAINS: Record<string, string> = {
  near: 'NEAR',
  'eip155:1': 'Ethereum',
  'eip155:8453': 'Base',
  'eip155:42161': 'Arbitrum',
  'eip155:100': 'Gnosis',
  // a reading off any chain, as a Snapshot vote is: its chain is 'none' (a draft word, META, 11 Nov)
  none: 'Off-chain',
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function chainLabel(chain: string): string {
  return (
    CHAINS[chain] ?? CHAINS[chain.split(':')[0] ?? ''] ?? capital(chain.split(':')[0] ?? chain)
  );
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** The title the renderer gave the drawing. */
export function svgTitle(svg: string): string | null {
  const m = /<svg[^>]*\saria-label="([^"]*)"/.exec(svg);
  return m?.[1]?.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e) ?? null;
}

/** The network's id in words, until the drawing can name it. */
export const networkLabel = (id: string) =>
  capital(id.replace(/[-_]+/g, ' ').replace(/\bnear\b/gi, 'NEAR'));

export interface ReadingKeyView {
  heading: string;
  body: string;
  note: string;
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Figma's "Reading key" (39:887): what the petals are, how to read them, and which data. */
export function readingKey(spec: Spec): ReadingKeyView {
  const { petals, tail } = spec.selection;
  const { height, order } = spec.encodings;
  const taller =
    height?.by === 'share' || height?.by === 'amount'
      ? 'A taller petal holds more.'
      : height?.meaning
        ? `${capital(height.meaning)}.`
        : '';
  const { block_height: block, as_of: asOf } = spec.snapshot;
  return {
    heading: `${petals} largest ${spec.network.population}${tail.group ? ` + ${tail.label}` : ''}`,
    body: [taller, order?.meaning ? `${capital(order.meaning)}.` : ''].filter(Boolean).join(' '),
    note: [block === undefined ? null : `Snapshot at block ${group(block)}`, dateLabel(asOf)]
      .filter(Boolean)
      .join('  ·  '),
  };
}

export interface LegendKey {
  label: string;
  swatch: string | undefined;
}

/** A swatch comes from the renderer as var(--k-pool); the generated CSS has a rule per colour. */
export const swatchKey = (swatch: string) => /^var\(--([\w-]+)\)$/.exec(swatch)?.[1];

/**
 * The colours a drawing paints, as its key: the legend's keys by kind or by band (core lookFills, since 11
 * Nov), then "everyone else". Several legends give one key, each colour once.
 */
export const colourKeys = (legends: readonly (readonly LegendItem[])[]): LegendKey[] =>
  oneKey(
    legends.map((legend) =>
      keysOf(
        legend
          .filter((item) => ['colour', 'segments', 'tail'].includes(item.primitive))
          .flatMap((item) => item.keys ?? []),
      ),
    ),
  );

/** The server's keys, { label, swatch: var(--k-pool) }, as a key's. */
export const keysOf = (keys: readonly { label: string; swatch: string }[]): LegendKey[] =>
  keys.map((k) => ({ label: k.label, swatch: swatchKey(k.swatch) }));

// "Everyone else" is grey since the keys (#76), as a value past the fifth is: told apart by its words.
const isTail = (k: LegendKey) => k.swatch === 'tail' || k.label.startsWith('everyone else');

/** One key from several: each colour once, and "everyone else" last. */
export function oneKey(lists: readonly (readonly LegendKey[])[]): LegendKey[] {
  const all = lists.flat();
  const out: LegendKey[] = [];
  for (const k of [...all.filter((k) => !isTail(k)), ...all.filter(isTail)]) {
    if (!out.some((o) => o.label === k.label && o.swatch === k.swatch)) out.push(k);
  }
  return out;
}

/** A drawing as an image source: an SVG in an <img> runs nothing and loads nothing. */
export const svgImage = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const shorten = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;

/** An account as people read it: a chain-qualified id (CAIP-10, eip155:1:0x…) is its address alone (#78). */
export const accountOf = (id: string) =>
  /^[a-z0-9-]+:[A-Za-z0-9-]+:/.test(id) ? id.slice(id.lastIndexOf(':') + 1) : id;

/** Named accounts stay whole; a long hash or address shows its ends, without its chain's prefix. */
export const shortId = (raw: string) => {
  const id = accountOf(raw);
  return id.includes('.') || id.length <= 16 ? id : shorten(id);
};

/** The whole units of an amount, with commas. It's text, because it may not fit a number. */
export const amountLabel = (amount: string) =>
  (amount.split('.')[0] ?? amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const percent = (x: number) => `${(x * 100).toFixed(2)}%`;

export interface PetalView {
  id: string;
  group: boolean;
  heading: string;
  /** the account in full, when the heading shortened it */
  full: string | null;
  stats: string;
  says: string;
  /** where the identity above comes from */
  source: string | null;
  values: PetalDetail['values'];
  segments: { key: string; label: string; share: string; amount: string }[];
}

export function petalView(petal: PetalDetail, unit?: string): PetalView {
  const isGroup = petal.id === '__tail';
  const heading = isGroup ? petal.label : shortId(petal.id);
  const amount = `${amountLabel(petal.amount)}${unit ? ` ${unit}` : ''}`;
  const says = isGroup
    ? `${petal.count === undefined ? 'Every other account' : `${group(petal.count)} accounts`} grouped into one petal. They still count toward the total.`
    : petal.identity
      ? `${petal.identity.name}, ${petal.identity.status}.`
      : 'The record gives a balance. The owner is unknown.';
  return {
    id: petal.id,
    group: isGroup,
    heading: isGroup ? capital(heading) : heading,
    full: !isGroup && heading !== accountOf(petal.id) ? accountOf(petal.id) : null,
    stats: `${amount}   ·   ${percent(petal.share)} of the total`,
    says,
    source: petal.identity?.source ?? null,
    values: petal.values,
    segments: (petal.segments ?? []).map((s) => ({
      key: s.key,
      label: s.label,
      share: percent(s.frac),
      amount: amountLabel(s.amount),
    })),
  };
}
