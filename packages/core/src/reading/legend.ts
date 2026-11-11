// The legend and the petal details (renderer.md): every primitive used appears in the legend with
// its meaning and sources (FR-011), an order line included; every petal says why it looks the way
// it does (FR-012). Legend keys name what they stand for; a skin says what they look like.
import { round6 } from '../decimal.ts';
import { BACKER_LABELS, BACKER_ORDER } from '../segments/backers.ts';
import type {
  Encoding,
  PetalDetail,
  ReadingLegendItem,
  ReadingPetal,
  Spec,
  SpecPrimitive,
} from '../types/index.ts';
import { usedEncodings } from '../validate/spec.ts';
import { colourLabel, KIND_ORDER, pct } from './words.ts';

export function legendOf(
  spec: Spec,
  petals: ReadingPetal[],
  tailSources: string[],
): ReadingLegendItem[] {
  const real = petals.filter((p) => !p.tail);
  const items: ReadingLegendItem[] = [];
  for (const [p, e] of usedEncodings(spec)) {
    const item: ReadingLegendItem = { primitive: p, meaning: e.meaning, sources: [...e.sources] };
    if (p === 'colour') {
      const keys = new Map<string, string>();
      const present =
        e.by === 'kind'
          ? KIND_ORDER.filter((k) => real.some((r) => r.kind === k))
          : real.map((r) => r.colour);
      for (const key of present) {
        const label = colourLabel(key);
        if (!keys.has(label)) keys.set(label, key);
      }
      item.keys = [...keys].map(([label, key]) => ({ key, label }));
    }
    if (p === 'outline' && e.by === 'name_kind') {
      const drawn = new Set(real.map((r) => r.outline));
      item.keys = [
        ...(drawn.has('asserted')
          ? [{ key: 'asserted', label: 'declared, stated or sourced' }]
          : []),
        ...(drawn.has('inferred') ? [{ key: 'inferred', label: 'inferred' }] : []),
      ];
    } else if (p === 'outline') {
      const statuses = new Set(real.map((r) => r.identity?.status).filter(Boolean));
      item.keys = [
        ...(statuses.has('self-declared') || statuses.has('verified')
          ? [{ key: 'asserted', label: 'self-declared or verified' }]
          : []),
        ...(statuses.has('inferred') ? [{ key: 'inferred', label: 'inferred' }] : []),
      ];
    }
    if (p === 'segments') {
      const present = new Set(petals.flatMap((r) => r.segments.map((s) => s.key)));
      item.keys = BACKER_ORDER.filter((k) => present.has(k)).map((k) => ({
        key: k,
        label: BACKER_LABELS[k],
      }));
    }
    items.push(item);
  }
  const tail = petals.find((r) => r.tail);
  if (tail)
    items.push({
      primitive: 'tail',
      meaning: `${tail.label}: ${tail.count ?? 0} more participants grouped into one hatched petal, ${pct(tail.share)} of the total; its height is their average`,
      sources: tailSources,
      keys: [{ key: 'tail', label: tail.label }],
    });
  return items;
}

const HEIGHT_EXPLAINS: Record<string, string> = {
  sqrt: 'square root of its share, relative to the largest petal',
  linear: 'its share, relative to the largest petal',
  log: 'its amount on a log scale between the smallest and largest petal',
  equal: 'the same for every petal',
};

const OUTLINE_WORD = { asserted: 'solid', inferred: 'dashed' } as const;

/** With outline on name_kind, nameKind says how each account's name is known (declared, stated, sourced, inferred). */
export function detailsOf(
  spec: Spec,
  petals: ReadingPetal[],
  nameKind: (id: string) => string | undefined = () => undefined,
): PetalDetail[] {
  const narrowest = Math.min(...petals.map((p) => p.width));
  return petals.map((r) => {
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
              : `share ${share}: side ${(r.width / narrowest).toFixed(2)}x the narrowest`,
        });
      else if (p === 'height')
        values.push({
          primitive: p,
          value: round6(r.height),
          explains: `${e.by.startsWith('m:') ? `${e.by.slice(2)}, relative to the largest petal` : (HEIGHT_EXPLAINS[e.scale ?? 'sqrt'] ?? e.meaning)}${r.tail ? ' (average member)' : ''}`,
        });
      else if (p === 'colour')
        values.push(
          r.tail
            ? { primitive: p, value: 'tail', explains: 'hatched: grouped, not one account' }
            : {
                primitive: p,
                value: e.by === 'kind' ? r.kind : colourLabel(r.colour),
                explains: `${e.by === 'kind' ? 'kind' : e.by}: ${colourLabel(r.colour)}`,
              },
        );
      else if (p === 'outline' && e.by === 'name_kind') {
        const known = nameKind(r.id);
        values.push({
          primitive: p,
          value: r.outline ? OUTLINE_WORD[r.outline] : 'none',
          explains: r.tail
            ? 'grouped: no single name'
            : known
              ? `name ${known}`
              : 'no annotation names this account',
        });
      } else if (p === 'outline')
        values.push({
          primitive: p,
          value: r.outline ? OUTLINE_WORD[r.outline] : 'none',
          explains: r.tail
            ? 'grouped: no single identity'
            : r.identity
              ? `identity ${r.identity.status} (${r.identity.source})`
              : 'no source names this account',
        });
      else if (p === 'segments')
        values.push({
          primitive: p,
          value: r.segments.length,
          explains: r.segments.length
            ? r.segments.map((s) => `${s.label} ${pct(s.frac)}`).join(', ')
            : r.tail
              ? 'grouped: not split'
              : 'no backers recorded',
        });
      else if (p === 'order')
        values.push({
          primitive: p,
          value: r.rank,
          explains: r.tail
            ? `after the top ${r.index}: ${e.meaning}`
            : `rank ${r.rank}: ${e.meaning}`,
        });
    }
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
      ...(r.segments.length ? { segments: r.segments.map((s) => ({ ...s })) } : {}),
      ...(r.tail ? { count: r.count ?? 0 } : {}),
    };
  });
}
