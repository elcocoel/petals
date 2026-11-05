// The reading (renderer.md, reading/v1): the translator between a spec and any drawing. Who, how
// much, what kind, what's grouped, and what each encoding resolves to. No pixels: geometry and
// colour belong to the skin, so a skin can change freely while the reading stays locked. Pure, like
// the rest of core. It reads a spec that validateSpec accepted; renderFlower checks that first.
import { canonicalJson, sha256Hex, specHash } from '../hash.ts';
import { backerSegments } from '../segments/backers.ts';
import { selectPetals } from '../select.ts';
import { measureTable } from '../tables.ts';
import type { Encoding, PetalRow, Reading, ReadingPetal, Snapshot, Spec } from '../types/index.ts';
import { READING_VERSION } from '../versions.ts';
import { HEIGHT_FLOOR, heightValues, metricOf, widthFactors } from './encodings.ts';
import { detailsOf, legendOf } from './legend.ts';

function colourKey(colour: Encoding, r: PetalRow): string {
  if (r.tail) return 'tail';
  if (colour.by === 'single') return 'single';
  if (colour.by === 'identity') return r.identity ? 'named' : 'anonymous';
  return r.kind;
}

function outlineKey(spec: Spec, r: PetalRow): ReadingPetal['outline'] {
  if (!spec.encodings.outline || r.tail || !r.identity) return null;
  return r.identity.status === 'inferred' ? 'inferred' : 'asserted';
}

/** What a label calls a petal: its identity's name, unless that name is only inferred. */
function nameOf(r: PetalRow): string {
  return r.identity && r.identity.status !== 'inferred' ? r.identity.name : r.label;
}

export function readFlower(spec: Spec, s: Snapshot): Reading {
  // petals clockwise from twelve o'clock in encodings.order.by; measure_desc is the only order
  // this build draws, and selectPetals already returns it (tail last)
  const rows = selectPetals(s, spec.selection);
  const widths = widthFactors(rows, spec.encodings.width);
  const heights = heightValues(rows, spec.encodings.height, metricOf(s, spec, rows));
  const split = spec.encodings.segments?.by === 'backers';

  const petals = rows.map(
    (r, i): ReadingPetal => ({
      ...r,
      name: nameOf(r),
      width: widths[i] ?? 1,
      height: Math.max(HEIGHT_FLOOR, Math.min(1, heights[i] ?? 0)),
      colour: colourKey(spec.encodings.colour, r),
      outline: outlineKey(spec, r),
      segments: split && !r.tail ? backerSegments(s, r.id) : [],
    }),
  );
  return {
    petal: READING_VERSION,
    spec_sha256: specHash(spec),
    title: s.network.title,
    chain: spec.network.chain,
    encodings: spec.encodings,
    petals,
    legend: legendOf(spec, petals, measureTable(s, spec.selection.measure)?.sources ?? []),
    details: detailsOf(spec, petals),
  };
}

/** reading_sha256: SHA-256 of the canonical reading. */
export function readingHash(reading: Reading): string {
  return sha256Hex(canonicalJson(reading));
}
