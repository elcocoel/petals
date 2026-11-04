// The renderer (contracts/renderer.md, render/v1). A pure function: no fetch, clock, randomness,
// DOM or locale. Same spec and snapshot give the same SVG bytes (FR-010, SC-005).

import { formatDecimal } from '../decimal.ts';
import { BadInputError, InvalidSpecError } from '../errors.ts';
import { sha256Hex, specHash } from '../hash.ts';
import { PRIMITIVES } from '../primitives.ts';
import { backerSegments, hasBackers } from '../segments/backers.ts';
import { selectPetals } from '../select.ts';
import { holdingMeasures, measureTable } from '../tables.ts';
import type {
  Capabilities,
  PetalRow,
  RenderOptions,
  RenderResult,
  Segment,
  Snapshot,
  Spec,
  SpecPrimitive,
} from '../types/index.ts';
import { validateSpec } from '../validate/spec.ts';
import { heightValues, layout, widthFactors } from './geometry.ts';
import { buildLegend, colourOf, outlineOf, pct, petalDetails } from './legend.ts';
import { SEGMENT_STYLE } from './style.ts';
import { type BarSegment, type DrawnPetal, writeSvg } from './svg.ts';

/**
 * What a snapshot alone can show: the capabilities renderFlower validates against when no module
 * descriptor is at hand. Permissive: every `by` this build draws, backers when delegations exist.
 * The tools validate against the descriptor's (stricter) capabilities before they render.
 */
export function snapshotCapabilities(s: Snapshot): Capabilities {
  const by: Capabilities['by'] = {};
  for (const p of PRIMITIVES) if (p.status === 'available') by[p.id as SpecPrimitive] = [...p.by];
  return {
    measures: holdingMeasures(s).map((m) => ({ id: m.id, unit: m.unit, label: m.id })),
    by,
    segments: hasBackers(s) ? ['backers'] : [],
    relationships: [...new Set(s.relationships.map((r) => r.type))].sort(),
    defaults: {},
    meanings: {},
  };
}

const MAX_NAME = 22;
function labelText(r: PetalRow): string {
  if (r.tail) return `${r.label} (${r.count ?? 0}) ${pct(r.share)}`;
  const named = r.identity && r.identity.status !== 'inferred' ? r.identity.name : r.label;
  const name = named.length > MAX_NAME ? `${named.slice(0, MAX_NAME - 2)}…` : named;
  return `${name} ${pct(r.share)}`;
}

export function renderFlower(spec: Spec, s: Snapshot, o?: RenderOptions): RenderResult {
  const size = o?.size ?? 800;
  const thumb = o?.thumb ?? false;
  if (!Number.isInteger(size) || size < 32 || size > 8192)
    throw new BadInputError('size is a whole number of pixels from 32 to 8192', {
      hint: `got ${String(size)}`,
    });
  const check = validateSpec(spec, { snapshot: s, capabilities: snapshotCapabilities(s) });
  if (!check.valid) throw new InvalidSpecError(check.errors);

  // petals clockwise from twelve o'clock in encodings.order.by; measure_desc is the only order
  // this build draws, and selectPetals already returns it (tail last)
  const rows = selectPetals(s, spec.selection);
  const table = measureTable(s, spec.selection.measure);

  const heightBy = spec.encodings.height.by;
  let metric = (_r: PetalRow) => 0;
  if (heightBy.startsWith('m:')) {
    const mt = measureTable(s, heightBy.slice(2));
    const values = new Map(
      (mt?.rows ?? []).map((x) => [x.id, Number(formatDecimal(x.value, mt?.scale ?? 0))]),
    );
    const folded = (table?.rows ?? []).slice(rows.filter((r) => !r.tail).length);
    const tailMean = folded.length
      ? folded.reduce((t, x) => t + (values.get(x.id) ?? 0), 0) / folded.length
      : 0;
    metric = (r) => (r.tail ? tailMean : (values.get(r.id) ?? 0));
  }

  const lay = layout(
    rows,
    widthFactors(rows, spec.encodings.width),
    heightValues(rows, spec.encodings.height, metric),
    { size, thumb },
  );

  const segments = new Map<number, Segment[]>();
  if (spec.encodings.segments?.by === 'backers')
    for (const r of rows) {
      if (r.tail) continue;
      const list = backerSegments(s, r.id);
      if (list.length) segments.set(r.index, list);
    }

  const sha = specHash(spec);
  const hatchId = `petal-hatch-${sha.slice(0, 8)}`;
  const drawn: DrawnPetal[] = lay.petals.map((g) => {
    const r = g.row;
    let bars: BarSegment[];
    const list = segments.get(r.index);
    if (r.tail) bars = [{ key: 'tail', h0: 0, h1: g.H, fill: `url(#${hatchId})` }];
    else if (list?.length) {
      let acc = 0;
      bars = list.map((x, j) => {
        const h0 = g.H * acc;
        acc += x.frac;
        const key = x.key as keyof typeof SEGMENT_STYLE;
        return {
          key: x.key,
          h0,
          h1: j === list.length - 1 ? g.H : g.H * acc,
          cls: SEGMENT_STYLE[key]?.cls ?? 'c-unknown',
        };
      });
    } else bars = [{ key: 'bar', h0: 0, h1: g.H, cls: colourOf(spec.encodings.colour, g).cls }];
    return { geo: g, segments: bars, outline: outlineOf(spec, g), label: labelText(r) };
  });

  const svg = writeSvg({
    layout: lay,
    thumb,
    title: s.network.title,
    specSha256: sha,
    hatchId,
    petals: drawn,
  });
  return {
    svg,
    legend: buildLegend(spec, lay.petals, segments, table?.sources ?? []),
    petals: petalDetails(spec, lay.petals, segments),
    render_sha256: sha256Hex(svg),
  };
}
