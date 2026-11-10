// How a person's view (view/v1, specs/006-the-map/contracts/view.md) becomes what the reading draws
// (specs/006-the-map/plan.md, "Drawing from the viewer's view"). The view picks a piece of data for each
// dimension; this turns each pick into the encoding today's look draws for it, in spec/v1's shape, so the
// reading keeps reading/v1's fields and only its values follow the view. A pick the look can't draw yet,
// or a piece of data the flower doesn't have, draws nothing: equal widths and heights, one colour, no
// outline, no bands. Where a pick is what the spec already chose, the spec's own encoding is kept, with its
// words and its sources, so the default view changes no default flower. Pure.
import { STANDARD_MEANINGS } from '../convention/default.ts';
import { choiceOf, shape } from '../convention/shape.ts';
import { hasBackers } from '../segments/backers.ts';
import { holdingMeasures, measureTable } from '../tables.ts';
import type { Encoding, Snapshot, SourceIds, Spec, SpecPrimitive, View } from '../types/index.ts';
import { EVERY_FLOWER, inUse, type Piece } from '../view/index.ts';

/** The dimensions a view picks for that today's look can draw, in spec/v1's words. Order isn't one yet. */
const FIELDS = ['width', 'height', 'colour', 'outline', 'segments', 'lines', 'markings'] as const;
type Field = (typeof FIELDS)[number];

/** Width keeps its band to the ratios the look has words for. */
const RATIOS = [1.5, 2, 3];

/**
 * The pieces of data a snapshot holds, as seamOf names them from a reading: the four every flower has, each
 * holding as an amount under its own name, and backers where there are delegations.
 */
export function piecesOf(s: Snapshot): Piece[] {
  const out: Piece[] = [...EVERY_FLOWER];
  for (const m of holdingMeasures(s)) {
    if (!out.some((p) => p.name === m.id)) out.push({ name: m.id, kind: 'amount' });
  }
  if (hasBackers(s)) out.push({ name: 'backers', kind: 'parts' });
  return out;
}

/** For each dimension, the choice (in propose_spec's words) that draws what the view picks, or nothing. */
export function choicesOf(view: View, s: Snapshot): Record<Field, string> {
  const used = inUse(view, piecesOf(s));
  const d = view.dimensions;
  let height = 'equal';
  if (used.height === 'share') height = d.height?.scale === 'linear' ? 'linear' : 'sqrt';
  else if (used.height === 'amount') height = 'log';
  else if (used.height !== null && measureTable(s, used.height)) height = `m:${used.height}`;
  const ratio = d.width?.max_ratio ?? 2;
  const near = RATIOS.reduce((a, b) => (Math.abs(b - ratio) < Math.abs(a - ratio) ? b : a));
  return {
    width: used.width === 'share' ? `r${near}` : 'equal',
    height,
    colour: used.colour === 'kind' ? 'kind' : used.colour === 'identity' ? 'identity' : 'single',
    outline: used.outline === 'identity' ? 'identity_status' : 'none',
    segments: used.segments === 'backers' ? 'backers' : 'none',
    lines: 'none',
    markings: 'none',
  };
}

/**
 * The encodings the reading draws with, for this view: the spec's own where the view picks what the spec
 * chose, and otherwise the standard words for the pick (the measure's and the metric's names put in, as
 * propose_spec does), with the sources of the data it draws.
 */
export function encodingsOf(view: View, spec: Spec, s: Snapshot): Spec['encodings'] {
  const choices = choicesOf(view, s);
  const label = spec.selection.measure.replaceAll('_', ' ');
  const out: Record<string, Encoding | null> = { ...spec.encodings };
  for (const field of FIELDS) {
    const choice = choices[field];
    const own = spec.encodings[field as SpecPrimitive & keyof Spec['encodings']] ?? null;
    if (choiceOf(field, own) === choice) continue;
    const drawn = shape(field, choice);
    if (!drawn) {
      out[field] = null;
      continue;
    }
    const metric = field === 'height' && choice.startsWith('m:') ? choice.slice(2) : null;
    const meaning = (STANDARD_MEANINGS[metric !== null ? 'height:m:' : `${field}:${choice}`] ?? '')
      .replace('the measure', label)
      .replace('the metric', metric !== null ? metric.replaceAll('_', ' ') : '');
    const metricSources = metric !== null ? (measureTable(s, metric)?.sources ?? []) : [];
    const sources: SourceIds =
      metricSources.length > 0
        ? (metricSources as SourceIds)
        : (own?.sources ?? spec.encodings.height.sources);
    out[field] = { ...drawn, meaning, sources };
  }
  return out as Spec['encodings'];
}
