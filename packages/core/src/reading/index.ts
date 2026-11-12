// The reading (renderer.md, reading/v1): the translator between a spec and any drawing. Who, how
// much, what kind, what's grouped, and what each encoding resolves to. No pixels: geometry and
// colour belong to the skin, so a skin can change freely while the reading stays locked. Pure, like
// the rest of core. It reads a spec that validateSpec accepted; renderFlower checks that first.
import { canonicalJson, sha256Hex, specHash } from '../hash.ts';
import type { SeamPiece } from '../seam.ts';
import { backerSegments } from '../segments/backers.ts';
import { selectPetals } from '../select.ts';
import { measureTable } from '../tables.ts';
import type {
  Encoding,
  PetalRow,
  Reading,
  ReadingPetal,
  Snapshot,
  Spec,
  View,
} from '../types/index.ts';
import { READING_VERSION } from '../versions.ts';
import { EVERY_FLOWER, inUse, latestView } from '../view/index.ts';
import { HEIGHT_FLOOR, heightValues, isStraight, metricOf, widthFactors } from './encodings.ts';
import { foldOf } from './fold.ts';
import { detailsOf, legendOf } from './legend.ts';
import { encodingsOf, labelsOf, piecesOf, RATIOS } from './view.ts';

/** Each piece's value for each account, of the pieces given beyond the snapshot's own. */
type Values = Map<string, Map<string, string>>;

function valuesOf(pieces: readonly SeamPiece[]): Values {
  const out: Values = new Map();
  for (const p of pieces) {
    if ('values' in p) out.set(p.name, new Map(p.values.map((v) => [v.participant, v.value])));
  }
  return out;
}

/**
 * Widths by a count given with the reading (votes cast): the most at the view's ratio, the fewest at one, in a
 * straight line between; the tail and a petal with none, one.
 */
function countWidths(
  rows: readonly PetalRow[],
  by: ReadonlyMap<string, string>,
  width: Encoding,
): number[] {
  const ratio = width.max_ratio ?? 2;
  const of = (r: PetalRow) => (r.tail ? null : Number(by.get(r.id) ?? Number.NaN));
  const xs = rows.map(of).filter((x): x is number => x !== null && Number.isFinite(x));
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return rows.map((r) => {
    const x = of(r);
    return x === null || !Number.isFinite(x) || hi <= lo
      ? 1
      : 1 + ((ratio - 1) * (x - lo)) / (hi - lo);
  });
}

/**
 * Heights by a count given with the reading (votes cast): each its own count over the most, in a straight line;
 * the tail its average member's, from the counts of those not drawn on their own.
 */
function countHeights(rows: readonly PetalRow[], by: ReadonlyMap<string, string>): number[] {
  const drawn = new Set(rows.filter((r) => !r.tail).map((r) => r.id));
  const own = rows.map((r) => (r.tail ? 0 : Number(by.get(r.id) ?? 0) || 0));
  const rest = [...by].filter(([id]) => !drawn.has(id)).map(([, v]) => Number(v) || 0);
  const tail = rest.length ? rest.reduce((a, b) => a + b, 0) / rest.length : 0;
  const max = Math.max(...own, tail) || 1;
  return rows.map((r, i) => (r.tail ? tail : (own[i] as number)) / max);
}

/** How many steps a grade has: a number or a date on Colour, lightest to darkest (render/wedge/keys.ts GRADES). */
export const GRADE_STEPS = 5;

/**
 * Each petal's colour key where Colour shows a piece of data or a number: a category's own values (voted); a count,
 * a date, a share or an amount as its grade, 'grade:0' (the fewest, oldest) to 'grade:4' (the most, newest), by
 * rank between the two ends, equal values on one step (Elco, 12 Nov, wave 4: "color graded by a number or a
 * date", last active as a fade). null where Colour shows the reading's own kind or who it is, or nothing.
 */
function coloursOf(
  by: string | null,
  rows: readonly PetalRow[],
  values: Values,
  kinds: ReadonlyMap<string, string>,
): Map<string, string> | null {
  if (!by) return null;
  const given = values.get(by);
  const kind = given ? kinds.get(by) : by === 'share' || by === 'amount' ? 'share' : null;
  if (!kind) return null;
  if (kind === 'category') return new Map(given);
  const real = rows.filter((r) => !r.tail);
  const numberOf = (r: PetalRow): number | null => {
    if (kind === 'share') return r.share;
    const v = given?.get(r.id);
    if (v === undefined) return null;
    const x = kind === 'date' ? Date.parse(v) : Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const known = real
    .map((r) => ({ id: r.id, x: numberOf(r) }))
    .filter((v): v is { id: string; x: number } => v.x !== null)
    .sort((a, b) => a.x - b.x);
  const out = new Map<string, string>();
  const firstAt = new Map<number, number>();
  known.forEach((v, i) => {
    if (!firstAt.has(v.x)) firstAt.set(v.x, i);
    const rank = firstAt.get(v.x) as number;
    // the fewest (oldest) the lightest, the most (newest) the darkest, the rest between by rank
    const step =
      known.length > 1
        ? Math.round((rank / (known.length - 1)) * (GRADE_STEPS - 1))
        : GRADE_STEPS - 1;
    out.set(v.id, `grade:${step}`);
  });
  return out;
}

/** A petal's colour key where the piece Colour shows has no value for it: drawn grey (render/wedge/keys.ts). */
export const NO_VALUE = 'no value';

/**
 * The petals in the order a piece of data gives them (Elco, 12 Nov: "make sure ... we add the capacity to show last
 * active and other ways to on how we organize how the petals go around the circle"): a date newest first, a count or
 * an amount most first, a category its commonest value first; between equals, as before (biggest first); a petal
 * with no value after those with one; the tail last.
 */
function orderedBy(
  rows: readonly PetalRow[],
  by: ReadonlyMap<string, string>,
  kind: string | undefined,
): PetalRow[] {
  const real = rows.filter((r) => !r.tail);
  const tail = rows.filter((r) => r.tail);
  const counts = new Map<string, number>();
  for (const r of real) {
    const v = by.get(r.id);
    if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const rank = (v: string): number => {
    if (kind === 'date') return Date.parse(v) || 0;
    if (kind === 'category') return counts.get(v) ?? 0;
    return Number(v) || 0;
  };
  const keyed = real.map((r, i) => ({ r, i, v: by.get(r.id) }));
  keyed.sort((a, b) => {
    if (a.v === undefined || b.v === undefined)
      return a.v === b.v ? a.i - b.i : a.v === undefined ? 1 : -1;
    const d = rank(b.v) - rank(a.v);
    if (d !== 0) return d;
    if (kind === 'category' && a.v !== b.v) return a.v < b.v ? -1 : 1;
    return a.i - b.i;
  });
  return [...keyed.map((k) => k.r), ...tail];
}

function colourKey(colour: Encoding, r: PetalRow): string {
  if (r.tail) return 'tail';
  if (colour.by === 'single') return 'single';
  if (colour.by === 'identity') return r.identity ? 'named' : 'anonymous';
  return r.kind;
}

/**
 * A petal's outline, where the spec's own outline (identity) is drawn. Outline can take any category, such as
 * name_kind, but how a category is drawn on any dimension stays undecided until the look designs it (Elco,
 * 11 Nov: "dont give data hard coded use of visual manifestations"), so nothing else gives it one.
 */
function outlineKey(spec: Spec, r: PetalRow): ReadingPetal['outline'] {
  if (!spec.encodings.outline || r.tail || !r.identity) return null;
  return r.identity.status === 'inferred' ? 'inferred' : 'asserted';
}

/**
 * What a label calls a petal, by the piece of data the view names petals by (labels, view/v2). Identity: its
 * name, unless that name is only inferred. The kind of account: the kind. Any other: its value for this
 * account, such as the name a person's annotations give it. None, or none for this account: its own label,
 * the short address. The tail keeps its own label.
 */
function nameOf(r: PetalRow, by: string | null, values: Values): string {
  if (r.tail || by === null) return r.label;
  if (by === 'identity')
    return r.identity && r.identity.status !== 'inferred' ? r.identity.name : r.label;
  if (by === 'kind') return r.kind.replaceAll('_', ' ');
  return values.get(by)?.get(r.id) ?? r.label;
}

/**
 * What a dimension other than labels reads for a petal from a category piece of data: identity's value is how
 * the identity is known (verified, self-declared, inferred), the kind of account's is its kind, and any other
 * piece's is its value for that account among the pieces given (a person's name_kind, say). None, and the
 * tail: null. It says the value only; how a value looks is the look's, and nothing fixes one (Elco, 11 Nov).
 */
export function categoryOf(
  by: string,
  pieces: readonly SeamPiece[] = [],
): (p: Pick<PetalRow, 'id' | 'kind' | 'identity' | 'tail'>) => string | null {
  const values = valuesOf(pieces);
  return (p) => {
    if (p.tail) return null;
    if (by === 'identity') return p.identity?.status ?? null;
    if (by === 'kind') return p.kind;
    return values.get(by)?.get(p.id) ?? null;
  };
}

export interface ReadOptions {
  /**
   * The least height a bar is given: none on the straight scale (Elco's art direction, 11 Nov: "no artificial
   * minimum"; #76), so a petal is exactly as tall as its share, and HEIGHT_FLOOR on the others, unless said.
   */
  floor?: number;
}

/**
 * The reading of a spec over its snapshot. With a person's view (view/v1 or v2), each dimension draws what
 * the view picks (reading/view.ts) and the spec's own choices stay in the spec, as the agent's proposal; the
 * reading is still of that spec. Without one, the spec's choices are drawn, as they always were, and petals
 * are named by identity. Pieces of data beyond the snapshot's own (a person's names, core's namePieces) can
 * be drawn when the view names them.
 */
export function readFlower(
  given: Spec,
  s: Snapshot,
  view?: View,
  pieces: readonly SeamPiece[] = [],
  options: ReadOptions = {},
): Reading {
  const spec = view ? { ...given, encodings: encodingsOf(view, given, s, pieces) } : given;
  const floor = options.floor ?? (isStraight(spec.encodings.height) ? 0 : HEIGHT_FLOOR);
  const values = valuesOf(pieces);
  const labels = view ? labelsOf(view, s, pieces) : 'identity';
  // what the view gives Order and Colour, where it's a piece of data given with the reading (last_active,
  // votes_cast, voted: SYSTEMS's activity); the reading's own pieces (share, kind, identity) draw as they did
  const used = view ? inUse(view, piecesOf(s, pieces)) : null;
  const kinds = new Map(pieces.map((p) => [p.name, p.kind]));
  // Order by a piece given with the reading, or by the reading's own kind, who it is, or the name each petal shows
  // (a person's, else its own label): every choice Tools offers turns the petals (VISUAL QA, 12 Nov)
  const orderData = view ? (latestView(view).dimensions.order?.data ?? null) : null;
  const ownOrder = (rs: readonly PetalRow[]): Map<string, string> | null => {
    if (orderData === 'kind') return new Map(rs.map((r) => [r.id, r.kind]));
    if (orderData === 'identity')
      return new Map(rs.map((r) => [r.id, r.identity?.name ?? r.label]));
    if (orderData === 'name') return new Map(rs.map((r) => [r.id, nameOf(r, 'name', values)]));
    return null;
  };
  const orderBy = used?.order && values.has(used.order) ? used.order : null;
  // Width and Height by a count given with the reading (votes cast): each petal by its own count
  const sizeBy = (d: 'width' | 'height') => {
    const name = used?.[d];
    return name && values.has(name) && kinds.get(name) === 'count' ? name : null;
  };
  const widthBy = sizeBy('width');
  const heightBy = sizeBy('height');
  // Colour by a piece or a number: a category's values (voted), or a number's or a date's grade (Elco, wave 4)
  // petals clockwise from twelve o'clock: by size (selectPetals gives them so, tail last), or by the piece Order
  // shows (Elco, 12 Nov: "last active, most active")
  const selected = selectPetals(s, spec.selection);
  const own = orderBy ? null : ownOrder(selected);
  const rows = orderBy
    ? orderedBy(selected, values.get(orderBy) as Map<string, string>, kinds.get(orderBy))
    : own
      ? orderedBy(selected, own, 'category')
      : selected;
  const widths = widthBy
    ? countWidths(rows, values.get(widthBy) as Map<string, string>, spec.encodings.width)
    : widthFactors(rows, spec.encodings.width);
  const heights = heightBy
    ? countHeights(rows, values.get(heightBy) as Map<string, string>)
    : heightValues(rows, spec.encodings.height, metricOf(s, spec, rows));
  const split = spec.encodings.segments?.by === 'backers';
  const fold = tailFold(s, spec.selection, rows);
  const colours = coloursOf(used?.colour ?? null, rows, values, kinds);

  const petals = rows.map(
    (r, i): ReadingPetal => ({
      ...r,
      name: nameOf(r, labels, values),
      width: widths[i] ?? 1,
      height: Math.max(floor, Math.min(1, heights[i] ?? 0)),
      colour:
        colours && !r.tail ? (colours.get(r.id) ?? NO_VALUE) : colourKey(spec.encodings.colour, r),
      outline: outlineKey(spec, r),
      segments: split && !r.tail ? backerSegments(s, r.id) : [],
      ...(r.tail && fold ? { fold } : {}),
    }),
  );
  return {
    petal: READING_VERSION,
    spec_sha256: specHash(given),
    title: s.network.title,
    chain: spec.network.chain,
    encodings: spec.encodings,
    petals,
    legend: legendOf(spec, petals, measureTable(s, spec.selection.measure)?.sources ?? []),
    details: detailsOf(spec, petals),
  };
}

/**
 * The tail's members as stripes (Elco, 11 Nov: "everyone else should be 1 petal, the correct size for the
 * percentage it represents - the stripey pattern would work better inverted (smaller closer to the center)"): each
 * member's share of all the tail holds, the smallest first (reading/fold.ts), as render/wedge/fold.ts draws them.
 */
function tailFold(
  s: Snapshot,
  selection: Spec['selection'],
  rows: readonly PetalRow[],
): number[] | null {
  if (!rows.some((r) => r.tail)) return null;
  const table = measureTable(s, selection.measure);
  if (!table) return null;
  const members = table.rows.slice(rows.length - 1);
  const sum = members.reduce((a, r) => a + r.value, 0n);
  if (sum <= 0n) return null;
  const { fold } = foldOf(members.map((r) => Number((r.value * 1_000_000_000n) / sum) / 1e9));
  return fold.cells.length > 0 ? fold.cells : null;
}

/** reading_sha256: SHA-256 of the canonical reading. */
export function readingHash(reading: Reading): string {
  return sha256Hex(canonicalJson(reading));
}

/**
 * A reading's petals dressed again through another view, in the browser, at once (Elco, 12 Nov, wave 4: after a
 * change in Tools the map redraws without the second's wait): their own data (share, amount, kind, who it is,
 * their label) and the pieces given with the reading (`given`: a person's names, the dollars, the activity) turn,
 * size, colour and name them as readFlower would. What only the snapshot knows stays as it was until the server's
 * reading comes: heights by another measure (a metric), and the bands inside a petal.
 */
export function redress(
  petals: readonly ReadingPetal[],
  view: View,
  given: readonly SeamPiece[] = [],
): ReadingPetal[] {
  const values = valuesOf(given);
  const kinds = new Map(given.map((p) => [p.name, p.kind]));
  const used = inUse(view, [
    ...EVERY_FLOWER,
    ...given.map((p) => ({ name: p.name, kind: p.kind })),
  ]);
  const dims = latestView(view).dimensions;
  const before = new Map(petals.map((p) => [p.id, p]));
  // as selectPetals gives them: by rank, the tail last
  const base: PetalRow[] = [...petals]
    .sort((a, b) => (a.tail ? 1 : 0) - (b.tail ? 1 : 0) || a.rank - b.rank)
    .map((p) => ({
      index: p.index,
      id: p.id,
      label: p.label,
      kind: p.kind,
      identity: p.identity,
      amount: p.amount,
      share: p.share,
      rank: p.rank,
      ...(p.tail ? { tail: p.tail } : {}),
      ...(p.count !== undefined ? { count: p.count } : {}),
    }));
  // Order: a piece given, or the reading's own kind, who it is, or the name each petal shows
  const orderData = dims.order?.data ?? null;
  const orderBy = used.order && values.has(used.order) ? used.order : null;
  const own =
    orderData === 'kind'
      ? new Map(base.map((r) => [r.id, r.kind]))
      : orderData === 'identity'
        ? new Map(base.map((r) => [r.id, r.identity?.name ?? r.label]))
        : orderData === 'name'
          ? new Map(base.map((r) => [r.id, nameOf(r, 'name', values)]))
          : null;
  const rows = orderBy
    ? orderedBy(base, values.get(orderBy) as Map<string, string>, kinds.get(orderBy))
    : own
      ? orderedBy(base, own, 'category')
      : base;
  // Width: a count given, else the share's (or the amount's, in proportion), else equal
  const countOf = (d: 'width' | 'height') => {
    const name = used[d];
    return name && values.has(name) && kinds.get(name) === 'count' ? name : null;
  };
  const ratio = dims.width?.max_ratio ?? 2;
  const near = RATIOS.reduce((a, b) => (Math.abs(b - ratio) < Math.abs(a - ratio) ? b : a));
  const widthEnc = (
    used.width === 'share' || used.width === 'amount'
      ? { by: 'share', scale: 'log', max_ratio: near }
      : { by: 'equal', scale: 'equal' }
  ) as Encoding;
  const widthBy = countOf('width');
  const widths = widthBy
    ? countWidths(rows, values.get(widthBy) as Map<string, string>, widthEnc)
    : widthFactors(rows, widthEnc);
  // Height: a count given, the share (straight or as its root), the amount, equal; another measure waits
  const heightBy = countOf('height');
  const heightData = dims.height?.data ?? null;
  const heightEnc = (
    used.height === 'share'
      ? { by: 'share', scale: dims.height?.scale === 'linear' ? 'linear' : 'sqrt' }
      : used.height === 'amount'
        ? { by: 'amount', scale: 'log' }
        : { by: 'equal', scale: 'equal' }
  ) as Encoding;
  const metric =
    heightData !== null && !heightBy && used.height !== 'share' && used.height !== 'amount';
  const floor = isStraight(heightEnc) ? 0 : HEIGHT_FLOOR;
  const heights = heightBy
    ? countHeights(rows, values.get(heightBy) as Map<string, string>)
    : heightValues(rows, heightEnc, () => 0);
  // Colour: a category given, a number's or a date's grade, else the reading's own kind, who it is, or one colour
  const colours = coloursOf(used.colour, rows, values, kinds);
  const colourEnc = {
    by: used.colour === 'kind' ? 'kind' : used.colour === 'identity' ? 'identity' : 'single',
  } as Encoding;
  return rows.map((r, i): ReadingPetal => {
    const was = before.get(r.id) as ReadingPetal;
    return {
      ...was,
      ...r,
      name: nameOf(r, used.labels, values),
      width: widths[i] ?? 1,
      height: metric ? was.height : Math.max(floor, Math.min(1, heights[i] ?? 0)),
      colour: colours && !r.tail ? (colours.get(r.id) ?? NO_VALUE) : colourKey(colourEnc, r),
      outline:
        used.outline === 'identity' && !r.tail && r.identity
          ? r.identity.status === 'inferred'
            ? 'inferred'
            : 'asserted'
          : null,
    };
  });
}
