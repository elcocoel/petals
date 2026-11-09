// The view (view/v1, specs/006-the-map/contracts/view.md): which piece of data each dimension shows.
// One per person, for every flower they look at; the default for everyone else. The data never names a
// dimension, and the look never sees a data name: this joins them. Pure.
import { canonicalJson, sha256Hex } from '../hash.ts';
import type { MeasureKind } from '../layers.ts';
import type { View } from '../types/index.ts';
import { VIEW_VERSION } from '../versions.ts';

/** The handful of dimensions, fixed: the visual primitives a view can give a piece of data to. */
export const DIMENSIONS = [
  'height',
  'width',
  'order',
  'colour',
  'outline',
  'texture',
  'markings',
  'segments',
  'lines',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/**
 * The kinds a piece of data can be: 005's five (layers.ts), and `date`, `parts` (a petal cut into what it's
 * made of, backers today) and `relation` (petal to petal). The same list SYSTEMS puts in core with seam/v1
 * (DATA_KINDS); when it lands, this points at it and nothing else changes. No dimension takes a date yet.
 */
export type DataKind = MeasureKind | 'date' | 'parts' | 'relation';

/** A piece of data a flower has: its name, as the view names it, and its kind. */
export interface Piece {
  name: string;
  kind: DataKind;
}

/** What each dimension accepts (view.md, "The dimensions"). Any piece of data of these kinds can go there. */
export const ACCEPTS: Record<Dimension, readonly DataKind[]> = {
  height: ['amount', 'count', 'share'],
  width: ['amount', 'count', 'share'],
  order: ['amount', 'count', 'share', 'category'],
  colour: ['category', 'amount', 'count', 'share'],
  outline: ['flag', 'category'],
  texture: ['flag', 'category'],
  markings: ['count', 'flag'],
  segments: ['parts'],
  lines: ['relation'],
};

/** Can a piece of data of this kind go in this dimension? */
export const fits = (dimension: Dimension, kind: DataKind): boolean =>
  ACCEPTS[dimension].includes(kind);

/** The pieces of data every flower's reading has today (view.md, "Pieces of data a view can name"). */
export const EVERY_FLOWER: readonly Piece[] = [
  { name: 'share', kind: 'share' },
  { name: 'amount', kind: 'amount' },
  { name: 'kind', kind: 'category' },
  { name: 'identity', kind: 'category' },
];

/** The default: default/v1's choices (convention/default.ts), written as a view. */
export const DEFAULT_VIEW: View = {
  petal: VIEW_VERSION,
  dimensions: {
    height: { data: 'share', scale: 'sqrt' },
    width: { data: 'share', scale: 'log', max_ratio: 2 },
    order: { data: 'share' },
    colour: { data: 'kind' },
    outline: { data: 'identity' },
    texture: null,
    markings: null,
    segments: { data: 'backers' },
    lines: null,
  },
};

/** A view's identity: the hash of its canonical JSON, as a spec's is. */
export const viewHash = (view: View): string => sha256Hex(canonicalJson(view));

/**
 * What each dimension draws on one flower: the piece of data the view names there, or null where the view
 * leaves it out, the flower lacks that piece, or has it as a kind the dimension doesn't accept. There's no
 * fallback: a missing fact shows nothing.
 */
export function inUse(view: View, data: readonly Piece[]): Record<Dimension, string | null> {
  const kinds = new Map(data.map((p) => [p.name, p.kind]));
  const out = {} as Record<Dimension, string | null>;
  for (const d of DIMENSIONS) {
    const name = view.dimensions[d]?.data ?? null;
    const kind = name === null ? undefined : kinds.get(name);
    out[d] = name !== null && kind !== undefined && fits(d, kind) ? name : null;
  }
  return out;
}
