// The skin render/v1 (renderer.md): a reading becomes the polygon-and-bars SVG, with its legend
// swatches. Everything about the look lives under render/; nothing here reads a spec or a snapshot.

import { pct } from '../reading/words.ts';
import type { BackerClass } from '../segments/backers.ts';
import type { LegendItem, Reading, ReadingPetal } from '../types/index.ts';
import { layout, type PetalGeo } from './geometry.ts';
import { IDENTITY_STYLE, KIND_STYLE, SEGMENT_STYLE, SINGLE_STYLE, TAIL_SWATCH } from './style.ts';
import { type BarSegment, type DrawnPetal, writeSvg } from './svg.ts';
import type { Skin } from './types.ts';

function colourStyle(key: string): { cls: string; swatch: string } {
  if (key === 'single') return SINGLE_STYLE;
  if (key === 'named') return IDENTITY_STYLE.named;
  if (key === 'anonymous') return IDENTITY_STYLE.anonymous;
  return KIND_STYLE[key as keyof typeof KIND_STYLE] ?? KIND_STYLE.unknown;
}

const OUTLINE = { asserted: 'solid', inferred: 'dashed' } as const;

const MAX_NAME = 22;
function labelText(r: ReadingPetal): string {
  if (r.tail) return `${r.label} (${r.count ?? 0}) ${pct(r.share)}`;
  const name = r.name.length > MAX_NAME ? `${r.name.slice(0, MAX_NAME - 2)}…` : r.name;
  return `${name} ${pct(r.share)}`;
}

function barsOf(g: PetalGeo, r: ReadingPetal, hatchId: string): BarSegment[] {
  if (r.tail) return [{ key: 'tail', h0: 0, h1: g.H, fill: `url(#${hatchId})` }];
  if (!r.segments.length) return [{ key: 'bar', h0: 0, h1: g.H, cls: colourStyle(r.colour).cls }];
  let acc = 0;
  return r.segments.map((x, j) => {
    const h0 = g.H * acc;
    acc += x.frac;
    return {
      key: x.key,
      h0,
      h1: j === r.segments.length - 1 ? g.H : g.H * acc,
      cls: SEGMENT_STYLE[x.key as BackerClass]?.cls ?? 'c-unknown',
    };
  });
}

/** The swatch for a legend key, and the words this look adds to it. */
function dress(item: Reading['legend'][number]): LegendItem {
  const { keys, ...rest } = item;
  if (!keys) return rest;
  const dressed = keys.map(({ key, label }) => {
    if (item.primitive === 'outline')
      return {
        swatch: 'var(--ink-2)',
        label: `${OUTLINE[key as keyof typeof OUTLINE]}: ${label}`,
      };
    if (item.primitive === 'segments')
      return { swatch: SEGMENT_STYLE[key as BackerClass].swatch, label };
    if (item.primitive === 'tail') return { swatch: TAIL_SWATCH, label };
    return { swatch: colourStyle(key).swatch, label };
  });
  return { ...rest, keys: dressed };
}

export const skinV1: Skin = (reading, { size, thumb }) => {
  const lay = layout(
    reading.petals,
    reading.petals.map((p) => p.width),
    reading.petals.map((p) => p.height),
    { size, thumb },
  );
  const hatchId = `petal-hatch-${reading.spec_sha256.slice(0, 8)}`;
  const petals = reading.petals;
  const drawn: DrawnPetal[] = lay.petals.map((geo, i) => {
    const r = petals[i] as ReadingPetal;
    return {
      geo,
      segments: barsOf(geo, r, hatchId),
      outline: r.outline ? OUTLINE[r.outline] : null,
      label: labelText(r),
    };
  });
  return {
    svg: writeSvg({
      layout: lay,
      thumb,
      title: reading.title,
      specSha256: reading.spec_sha256,
      hatchId,
      petals: drawn,
    }),
    legend: reading.legend.map(dress),
    petals: reading.details,
  };
};
