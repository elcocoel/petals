// What the width and height encodings resolve to, per petal: plain numbers, no pixels. A skin turns
// them into a shape. Moved here from the renderer's geometry, unchanged (renderer.md).
import { formatDecimal } from '../decimal.ts';
import { measureTable } from '../tables.ts';
import type { Encoding, PetalRow, Snapshot, Spec } from '../types/index.ts';

/** A bar never vanishes: the height encoding resolves into [HEIGHT_FLOOR, 1]; on the straight scale it can. */
export const HEIGHT_FLOOR = 0.03;

/**
 * Straight heights (share on the linear scale; the art direction's, the default since 11 Nov, #76): twice as
 * much is twice as tall, with no minimum, and everyone else as tall as all it holds, on the one scale whose top
 * is the largest petal, it included (Elco, 11 Nov: "everyone else should be 1 petal, the correct size for the
 * percentage it represents").
 */
export const isStraight = (height: Encoding): boolean =>
  height.by === 'share' && height.scale === 'linear';

/** Width: log share mapped onto [1, max_ratio], so the widest side is at most max_ratio times the
 * narrowest. `equal` gives every side the same length. The tail takes part like any petal. */
export function widthFactors(rows: PetalRow[], width: Encoding): number[] {
  if (width.by === 'equal') return rows.map(() => 1);
  const ratio = width.max_ratio ?? 2;
  const ls = rows.map((r) => Math.log(Math.max(r.share, 1e-12)));
  const lo = Math.min(...ls);
  const hi = Math.max(...ls);
  return ls.map((l) => (hi > lo ? 1 + ((ratio - 1) * (l - lo)) / (hi - lo) : 1));
}

/**
 * Height per petal: `sqrt` share / max share, `linear` share / max share, `log` amount between the
 * smallest and largest petal, `m:<metric>` metric / max metric, `equal` 0.82. The tail stands for
 * its average member (its mean share, mean amount, mean metric), except on the straight scale, where it
 * stands for all it holds (isStraight).
 */
export function heightValues(
  rows: PetalRow[],
  height: Encoding,
  metric: (row: PetalRow) => number,
): number[] {
  const real = rows.filter((r) => !r.tail);
  const per = (r: PetalRow, x: number) => (r.tail && r.count ? x / r.count : x);
  if (height.by === 'equal') return rows.map(() => 0.82);
  if (isStraight(height)) {
    const max = Math.max(...rows.map((r) => r.share)) || 1;
    return rows.map((r) => r.share / max);
  }
  if (height.by === 'share') {
    const max = Math.max(...real.map((r) => r.share)) || 1;
    return rows.map((r) => {
      const x = per(r, r.share) / max;
      return height.scale === 'linear' ? x : Math.sqrt(x);
    });
  }
  if (height.by === 'amount') {
    const amounts = real.map((r) => Number(r.amount)).filter((a) => a > 0);
    const lo = Math.min(...amounts);
    const hi = Math.max(...amounts);
    return rows.map((r) => {
      const a = per(r, Number(r.amount));
      return hi > lo && a > 0 ? Math.max(0, Math.log(a / lo) / Math.log(hi / lo)) : 1;
    });
  }
  // m:<metric>; metric() already averages the tail
  const values = rows.map(metric);
  const max = Math.max(...real.map(metric)) || 1;
  return values.map((v) => v / max);
}

/** The metric behind `height: m:<metric>` per petal; the tail is the mean of those it folds. */
export function metricOf(s: Snapshot, spec: Spec, rows: PetalRow[]): (row: PetalRow) => number {
  const heightBy = spec.encodings.height.by;
  if (!heightBy.startsWith('m:')) return () => 0;
  const mt = measureTable(s, heightBy.slice(2));
  const values = new Map(
    (mt?.rows ?? []).map((x) => [x.id, Number(formatDecimal(x.value, mt?.scale ?? 0))]),
  );
  const table = measureTable(s, spec.selection.measure);
  const folded = (table?.rows ?? []).slice(rows.filter((r) => !r.tail).length);
  const tailMean = folded.length
    ? folded.reduce((t, x) => t + (values.get(x.id) ?? 0), 0) / folded.length
    : 0;
  return (r) => (r.tail ? tailMean : (values.get(r.id) ?? 0));
}
