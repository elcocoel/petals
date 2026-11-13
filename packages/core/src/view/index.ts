// The view (view/v2, specs/006-the-map/contracts/view.md): which piece of data each dimension shows.
// One per person, for every flower they look at; the default for everyone else. The data never names a
// dimension, and the look never sees a data name: this joins them. Pure.
import { canonicalJson, sha256Hex } from '../hash.ts';
import type { DataKind } from '../seam.ts';
import type { View, ViewV1, ViewV2, ViewV3 } from '../types/index.ts';
import { VIEW_VERSION } from '../versions.ts';

/**
 * The handful of dimensions, fixed: the visual primitives a view can give a piece of data to. view/v2 added
 * labels, the words that name each petal.
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

/** The kinds a piece of data can be: seam/v1's eight (seam.ts, DATA_KINDS). Order takes a date, newest first. */
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
  // a date orders newest first ('Last active'), a count most first ('Votes cast'), so time can order the petals
  // too, and not only size, which always draws a nautilus-like shell
  order: ['amount', 'count', 'share', 'category', 'date'],
  // a category's values, each in its key; an amount, a count, a share or a date as a grade of one hue, lightest to
  // darkest
  colour: ['category', 'amount', 'count', 'share', 'date'],
  outline: ['flag', 'category'],
  // texture and markings take no data until the look draws them: a choice draws, or isn't offered
  texture: [],
  markings: [],
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
 * The pieces of data some flowers' readings have (reading/view.ts piecesOf): a petal cut into who backs it, where
 * its reading has delegations. The only data of parts today, so the only data Segments can show.
 */
export const BACKERS: Piece = { name: 'backers', kind: 'parts' };

/**
 * Each petal's activity, where its map's proposals were read (activity.ts), time as data: how many it voted
 * on, when it last voted, and whether it ever did.
 */
export const ACTIVITY: readonly Piece[] = [
  { name: 'votes_cast', kind: 'count' },
  { name: 'last_active', kind: 'date' },
  { name: 'voted', kind: 'category' },
];

/**
 * Each petal's vesting, where its map's vesting schedules were read (vesting.ts, a reader for any token's
 * vesting): what it holds cut into unlocked, next unlock and later; its next unlock; and, where it
 * holds one allocation, which.
 */
export const VESTING: readonly Piece[] = [
  { name: 'vesting', kind: 'parts' },
  { name: 'next_unlock', kind: 'date' },
  { name: 'tranche', kind: 'category' },
];

/** What some flowers have and others don't: who backs each petal, each petal's activity, and its vesting. */
export const SOME_FLOWERS: readonly Piece[] = [BACKERS, ...ACTIVITY, ...VESTING];

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

/** view/v3 (12 Nov): view/v2 with colour's keys, the key each value takes as the person chose it. */
export const VIEW_KEYS_VERSION = 'view/v3';

/**
 * Any view as the latest version: a view/v1 is the same view with labels on identity, the names every
 * petal had before labels, so it draws exactly as it did. A v2 view is itself, and so is a v3, which only adds
 * colour's chosen keys.
 */
export function latestView(view: View): ViewV2 | ViewV3 {
  if (view.petal === VIEW_VERSION || view.petal === VIEW_KEYS_VERSION) return view;
  return {
    petal: VIEW_VERSION,
    dimensions: { ...view.dimensions, labels: { data: 'identity' } },
  };
}

/**
 * The default from view/v2 until 11 Nov: default/v1's choices, with labels on identity. Addresses made then
 * carry its hash, and it draws as it did.
 */
export const DEFAULT_VIEW_V2_0 = latestView(DEFAULT_VIEW_V1) as ViewV2;

/**
 * The default since 11 Nov, the art direction's (V1): heights straight, so twice as much is twice as tall,
 * everyone else too, with no minimum (the linear scale, reading/encodings.ts); every petal as wide. The rest
 * as before.
 */
export const DEFAULT_VIEW: ViewV2 = {
  petal: VIEW_VERSION,
  dimensions: {
    ...DEFAULT_VIEW_V2_0.dimensions,
    height: { data: 'share', scale: 'linear' },
    width: null,
  },
};

/** A view's identity: the hash of its canonical JSON, as a spec's is. A v1 view keeps its own. */
export const viewHash = (view: View): string => sha256Hex(canonicalJson(view));

/** The defaults before this one, by hash: an address that carries one still draws as it did. */
export const FORMER_DEFAULTS: ReadonlyMap<string, View> = new Map<string, View>([
  [viewHash(DEFAULT_VIEW_V2_0), DEFAULT_VIEW_V2_0],
  [viewHash(DEFAULT_VIEW_V1), DEFAULT_VIEW_V1],
]);

/** The default's hashes: today's, then the former defaults', which older addresses carry. */
export const DEFAULT_HASHES: readonly string[] = [
  viewHash(DEFAULT_VIEW),
  ...FORMER_DEFAULTS.keys(),
];

/**
 * What each dimension draws on one flower: the piece of data the view names there, or null where the view
 * leaves it out, the flower lacks that piece, or has it as a kind the dimension doesn't accept. There's no
 * fallback: a missing fact shows nothing.
 */
/**
 * The pieces a dimension draws, where it draws only some of what fits (a choice draws, or isn't offered): an
 * outline says how a petal's identity is known (asserted or inferred), and nothing else yet.
 */
export const DRAWS_ONLY: Partial<Record<Dimension, readonly string[]>> = { outline: ['identity'] };

/** Does this dimension draw this piece of data: it fits, and the dimension draws it (DRAWS_ONLY)? */
export const draws = (dimension: Dimension, piece: Piece): boolean =>
  fits(dimension, piece.kind) && (DRAWS_ONLY[dimension]?.includes(piece.name) ?? true);

export function inUse(view: View, data: readonly Piece[]): Record<Dimension, string | null> {
  const kinds = new Map(data.map((p) => [p.name, p.kind]));
  const dims = latestView(view).dimensions;
  const out = {} as Record<Dimension, string | null>;
  for (const d of DIMENSIONS) {
    const name = dims[d]?.data ?? null;
    const kind = name === null ? undefined : kinds.get(name);
    out[d] = name !== null && kind !== undefined && draws(d, { name, kind }) ? name : null;
  }
  return out;
}

/** The look's keys a person can give a value (view/v3's colour.keys). */
export const COLOUR_KEYS = ['mint', 'blue', 'coral', 'apricot', 'pink', 'grey'] as const;
export type ColourKey = (typeof COLOUR_KEYS)[number];

/** The keys a person chose for colour's values; none for a v1 or v2 view. */
export function colourKeysOf(view: View): Readonly<Record<string, ColourKey>> {
  if (view.petal !== VIEW_KEYS_VERSION) return {};
  return (view.dimensions.colour?.keys ?? {}) as Record<string, ColourKey>;
}

/**
 * The view with colour's keys as given, the colour a person chose for each value: a view/v3
 * when any key is chosen, a view/v2 when none is, so a view with nothing chosen keeps the hash it had.
 */
export function withColourKeys(
  view: View,
  keys: Readonly<Record<string, ColourKey>>,
): ViewV2 | ViewV3 {
  const latest = latestView(view);
  const { keys: _was, ...colour } = (latest.dimensions.colour ?? {}) as NonNullable<
    ViewV3['dimensions']['colour']
  >;
  const chosen = Object.keys(keys).length > 0;
  if (!latest.dimensions.colour) return latest;
  if (!chosen)
    return { petal: VIEW_VERSION, dimensions: { ...latest.dimensions, colour } } as ViewV2;
  return {
    petal: VIEW_KEYS_VERSION,
    dimensions: { ...latest.dimensions, colour: { ...colour, keys: { ...keys } } },
  } as ViewV3;
}
