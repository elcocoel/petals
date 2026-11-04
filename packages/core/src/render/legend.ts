// The legend and the petal details (renderer.md): every primitive used appears in the legend with
// its meaning and sources (FR-011), an order line included; every petal says why it looks the way
// it does (FR-012). Part of the render result, so the web never re-derives them.
import { round6 } from '../decimal.ts';
import { BACKER_LABELS, BACKER_ORDER } from '../segments/backers.ts';
import type {
  Encoding,
  LegendItem,
  PetalDetail,
  Segment,
  Spec,
  SpecPrimitive,
} from '../types/index.ts';
import { usedEncodings } from '../validate/spec.ts';
import type { PetalGeo } from './geometry.ts';
import {
  IDENTITY_STYLE,
  KIND_ORDER,
  KIND_STYLE,
  SEGMENT_STYLE,
  SINGLE_STYLE,
  TAIL_SWATCH,
} from './style.ts';

/** 0.0561 -> "5.61%"; 0.1234 -> "12.3%"; under 0.1% -> "<0.1%" (the spike's format). */
export function pct(x: number): string {
  if (x >= 0.1) return `${(x * 100).toFixed(1)}%`;
  if (x >= 0.001) return `${(x * 100).toFixed(2)}%`;
  return '<0.1%';
}

export function colourOf(
  colour: Encoding,
  g: PetalGeo,
): { cls: string; swatch: string; label: string } {
  const r = g.row;
  if (colour.by === 'single') return SINGLE_STYLE;
  if (colour.by === 'identity') return r.identity ? IDENTITY_STYLE.named : IDENTITY_STYLE.anonymous;
  return KIND_STYLE[r.kind] ?? KIND_STYLE.unknown;
}

export function outlineOf(spec: Spec, g: PetalGeo): 'solid' | 'dashed' | null {
  if (!spec.encodings.outline || g.row.tail || !g.row.identity) return null;
  return g.row.identity.status === 'inferred' ? 'dashed' : 'solid';
}

export function buildLegend(
  spec: Spec,
  petals: PetalGeo[],
  segments: Map<number, Segment[]>,
  tailSources: string[],
): LegendItem[] {
  const real = petals.filter((p) => !p.row.tail);
  const items: LegendItem[] = [];
  for (const [p, e] of usedEncodings(spec)) {
    const item: LegendItem = { primitive: p, meaning: e.meaning, sources: [...e.sources] };
    if (p === 'colour') {
      const keys = new Map<string, string>();
      const styles =
        e.by === 'kind'
          ? KIND_ORDER.filter((k) => real.some((g) => g.row.kind === k)).map((k) => KIND_STYLE[k])
          : real.map((g) => colourOf(e as Encoding, g));
      for (const st of styles) if (!keys.has(st.label)) keys.set(st.label, st.swatch);
      item.keys = [...keys].map(([label, swatch]) => ({ swatch, label }));
    }
    if (p === 'outline') {
      const statuses = new Set(real.map((g) => g.row.identity?.status).filter(Boolean));
      item.keys = [
        ...(statuses.has('self-declared') || statuses.has('verified')
          ? [{ swatch: 'var(--ink-2)', label: 'solid: self-declared or verified' }]
          : []),
        ...(statuses.has('inferred')
          ? [{ swatch: 'var(--ink-2)', label: 'dashed: inferred' }]
          : []),
      ];
    }
    if (p === 'segments') {
      const present = new Set([...segments.values()].flatMap((list) => list.map((s) => s.key)));
      item.keys = BACKER_ORDER.filter((k) => present.has(k)).map((k) => ({
        swatch: SEGMENT_STYLE[k].swatch,
        label: BACKER_LABELS[k],
      }));
    }
    items.push(item);
  }
  const tail = petals.find((g) => g.row.tail);
  if (tail)
    items.push({
      primitive: 'tail',
      meaning: `${tail.row.label}: ${tail.row.count ?? 0} more participants grouped into one hatched petal, ${pct(tail.row.share)} of the total; its height is their average`,
      sources: tailSources,
      keys: [{ swatch: TAIL_SWATCH, label: tail.row.label }],
    });
  return items;
}

const HEIGHT_EXPLAINS: Record<string, string> = {
  sqrt: 'square root of its share, relative to the largest petal',
  linear: 'its share, relative to the largest petal',
  log: 'its amount on a log scale between the smallest and largest petal',
  equal: 'the same for every petal',
};

export function petalDetails(
  spec: Spec,
  petals: PetalGeo[],
  segments: Map<number, Segment[]>,
): PetalDetail[] {
  const narrowest = Math.min(...petals.map((p) => p.w));
  return petals.map((g) => {
    const r = g.row;
    const values: PetalDetail['values'] = [];
    const share = pct(r.share);
    for (const [p, e] of usedEncodings(spec) as [SpecPrimitive, Encoding][]) {
      if (p === 'width')
        values.push({
          primitive: p,
          value: r.share,
          explains:
            e.by === 'equal'
              ? 'every side the same length'
              : `share ${share}: side ${(g.w / narrowest).toFixed(2)}x the narrowest`,
        });
      else if (p === 'height')
        values.push({
          primitive: p,
          value: round6(Math.max(0.03, Math.min(1, g.h))),
          explains: `${e.by.startsWith('m:') ? `${e.by.slice(2)}, relative to the largest petal` : (HEIGHT_EXPLAINS[e.scale ?? 'sqrt'] ?? e.meaning)}${r.tail ? ' (average member)' : ''}`,
        });
      else if (p === 'colour')
        values.push(
          r.tail
            ? { primitive: p, value: 'tail', explains: 'hatched: grouped, not one account' }
            : {
                primitive: p,
                value: e.by === 'kind' ? r.kind : colourOf(e, g).label,
                explains: `${e.by === 'kind' ? 'kind' : e.by}: ${colourOf(e, g).label}`,
              },
        );
      else if (p === 'outline') {
        const o = outlineOf(spec, g);
        values.push({
          primitive: p,
          value: o ?? 'none',
          explains: r.tail
            ? 'grouped: no single identity'
            : r.identity
              ? `identity ${r.identity.status} (${r.identity.source})`
              : 'no source names this account',
        });
      } else if (p === 'segments') {
        const list = segments.get(r.index) ?? [];
        values.push({
          primitive: p,
          value: list.length,
          explains: list.length
            ? list.map((s) => `${s.label} ${pct(s.frac)}`).join(', ')
            : r.tail
              ? 'grouped: not split'
              : 'no backers recorded',
        });
      } else if (p === 'order')
        values.push({
          primitive: p,
          value: r.rank,
          explains: r.tail
            ? `after the top ${r.index}: ${e.meaning}`
            : `rank ${r.rank}: ${e.meaning}`,
        });
    }
    const segs = segments.get(r.index);
    return {
      index: r.index,
      id: r.id,
      label: r.label,
      kind: r.kind,
      identity: r.identity
        ? { name: r.identity.name, source: r.identity.source, status: r.identity.status }
        : null,
      amount: r.amount,
      share: r.share,
      rank: r.rank,
      values,
      ...(segs?.length ? { segments: segs.map((s) => ({ ...s })) } : {}),
      ...(r.tail ? { count: r.count ?? 0 } : {}),
    };
  });
}
