// The skin render/v1 (renderer.md): a reading becomes the polygon-and-bars SVG, with its legend
// swatches. Everything about the look lives under render/; nothing here reads a spec or a snapshot.

import { pct } from '../reading/words.ts';
import type { BackerClass } from '../segments/backers.ts';
import type { ReadingPetal } from '../types/index.ts';
import { layout, type PetalGeo } from './geometry.ts';
import { legendItem } from './legend.ts';
import { colourStyle, OUTLINE, SEGMENT_STYLE } from './style.ts';
import { type BarSegment, type DrawnPetal, writeSvg } from './svg.ts';
import type { Skin } from './types.ts';

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
    legend: reading.legend.map(legendItem),
    petals: reading.details,
  };
};
