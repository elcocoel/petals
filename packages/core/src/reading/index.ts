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
import { HEIGHT_FLOOR, heightValues, metricOf, widthFactors } from './encodings.ts';
import { detailsOf, legendOf } from './legend.ts';
import { encodingsOf, labelsOf } from './view.ts';

/** Each piece's value for each account, of the pieces given beyond the snapshot's own. */
type Values = Map<string, Map<string, string>>;

function valuesOf(pieces: readonly SeamPiece[]): Values {
  const out: Values = new Map();
  for (const p of pieces) {
    if ('values' in p) out.set(p.name, new Map(p.values.map((v) => [v.participant, v.value])));
  }
  return out;
}

function colourKey(colour: Encoding, r: PetalRow): string {
  if (r.tail) return 'tail';
  if (colour.by === 'single') return 'single';
  if (colour.by === 'identity') return r.identity ? 'named' : 'anonymous';
  return r.kind;
}

/**
 * A petal's outline: how its identity is known, or, with outline on name_kind, how its name is known
 * (annotation-layer.md, section 3): the account's own word, the person's or a source's is solid, an
 * inference apart. Nothing known, or the tail: none.
 */
function outlineKey(spec: Spec, r: PetalRow, values: Values): ReadingPetal['outline'] {
  const by = spec.encodings.outline?.by;
  if (!by || r.tail) return null;
  if (by === 'name_kind') {
    const known = values.get('name_kind')?.get(r.id);
    return known === undefined ? null : known === 'inferred' ? 'inferred' : 'asserted';
  }
  if (!r.identity) return null;
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
): Reading {
  const spec = view ? { ...given, encodings: encodingsOf(view, given, s, pieces) } : given;
  const values = valuesOf(pieces);
  const labels = view ? labelsOf(view, s, pieces) : 'identity';
  // petals clockwise from twelve o'clock in encodings.order.by; measure_desc is the only order
  // this build draws, and selectPetals already returns it (tail last)
  const rows = selectPetals(s, spec.selection);
  const widths = widthFactors(rows, spec.encodings.width);
  const heights = heightValues(rows, spec.encodings.height, metricOf(s, spec, rows));
  const split = spec.encodings.segments?.by === 'backers';

  const petals = rows.map(
    (r, i): ReadingPetal => ({
      ...r,
      name: nameOf(r, labels, values),
      width: widths[i] ?? 1,
      height: Math.max(HEIGHT_FLOOR, Math.min(1, heights[i] ?? 0)),
      colour: colourKey(spec.encodings.colour, r),
      outline: outlineKey(spec, r, values),
      segments: split && !r.tail ? backerSegments(s, r.id) : [],
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
    details: detailsOf(spec, petals, (id) => values.get('name_kind')?.get(id)),
  };
}

/** reading_sha256: SHA-256 of the canonical reading. */
export function readingHash(reading: Reading): string {
  return sha256Hex(canonicalJson(reading));
}
