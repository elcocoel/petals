// The view (view/v2, specs/006-the-map/contracts/view.md): which piece of data each dimension shows.
// One per person, for every flower they look at; the default for everyone else. The data never names a
// dimension, and the look never sees a data name: this joins them. Pure.
import { canonicalJson, sha256Hex } from '../hash.ts';
import type { DataKind } from '../seam.ts';
import type { View, ViewV1, ViewV2 } from '../types/index.ts';
import { VIEW_VERSION } from '../versions.ts';

/**
 * The handful of dimensions, fixed: the visual primitives a view can give a piece of data to. view/v2 added
 * labels, the words that name each petal (annotation-layer.md, section 3).
 */
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
  'labels',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** The kinds a piece of data can be: seam/v1's eight (seam.ts, DATA_KINDS). No dimension takes a date yet. */
export type { DataKind };

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
  labels: ['category'],
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

/**
 * The pieces of data a person's annotations give the accounts they name (seam.ts, namePieces): the one name a
 * petal shows, and how it's known (declared, stated, sourced or inferred). A flower has them for the accounts
 * someone named; the rest keep their short address.
 */
export const FROM_ANNOTATIONS: readonly Piece[] = [
  { name: 'name', kind: 'category' },
  { name: 'name_kind', kind: 'category' },
];

/** The default before labels: default/v1's choices (convention/default.ts), written as a view/v1. */
export const DEFAULT_VIEW_V1: ViewV1 = {
  petal: 'view/v1',
  dimensions: {
    height: { data: 'share', scale: 'sqrt' },
    width: { data: 'share', scale: 'log', max_ratio: 2 },
    order: { data: 'share' },
    colour: { data: 'kind' },
    outline: { data: 'identity' },
    texture: null,
    markings: null,
    segments: null,
    lines: null,
  },
};

/**
 * Any view as the latest version: a view/v1 is the same view with labels on identity, the names every
 * petal had before labels, so it draws exactly as it did. A v2 view is itself.
 */
export function latestView(view: View): ViewV2 {
  if (view.petal === VIEW_VERSION) return view;
  return {
    petal: VIEW_VERSION,
    dimensions: { ...view.dimensions, labels: { data: 'identity' } },
  };
}

/**
 * The default: default/v1's choices, with labels on identity, written as a view/v2. It draws what
 * DEFAULT_VIEW_V1 draws; its hash is new, and the v1 default's still means the default.
 */
export const DEFAULT_VIEW: ViewV2 = latestView(DEFAULT_VIEW_V1);

/** A view's identity: the hash of its canonical JSON, as a spec's is. A v1 view keeps its own. */
export const viewHash = (view: View): string => sha256Hex(canonicalJson(view));

/** The default's hashes: the v2 default's, and the v1 default's, which addresses made before v2 carry. */
export const DEFAULT_HASHES: readonly string[] = [
  viewHash(DEFAULT_VIEW),
  viewHash(DEFAULT_VIEW_V1),
];

/**
 * What each dimension draws on one flower: the piece of data the view names there, or null where the view
 * leaves it out, the flower lacks that piece, or has it as a kind the dimension doesn't accept. There's no
 * fallback: a missing fact shows nothing.
 */
export function inUse(view: View, data: readonly Piece[]): Record<Dimension, string | null> {
  const kinds = new Map(data.map((p) => [p.name, p.kind]));
  const dims = latestView(view).dimensions;
  const out = {} as Record<Dimension, string | null>;
  for (const d of DIMENSIONS) {
    const name = dims[d]?.data ?? null;
    const kind = name === null ? undefined : kinds.get(name);
    out[d] = name !== null && kind !== undefined && fits(d, kind) ? name : null;
  }
  return out;
}
