// render/v2, the one look (specs/006-the-map, milestone 3; Elco: "one first look that we improve on"): the
// wedge flower the live canvas draws, as a still picture. It fits the flower to the picture as the canvas
// fits it to a window, asks the same table what shows at that size (wedge/marks.ts), and writes what it
// answers as SVG text, with no DOM. Each petal is painted by its colour from the reading, "everyone else"
// in the tail's tone, with render/v1's palette and its embedded style, so a picture reads the same alone or
// in a page; a petal with bands (a pool's backers) is cut into them, as render/v1 cut its bars. A look draws
// only what it says it draws: outlines, lines and marks at the tips aren't drawn yet, so the legend leaves
// them out. Pure.

import type { BackerClass } from '../segments/backers.ts';
import type { LegendItem } from '../types/index.ts';
import { legendItem } from './legend.ts';
import { colourStyle, SEGMENT_STYLE, STYLE } from './style.ts';
import { esc } from './svg.ts';
import type { Skin } from './types.ts';
import { marks } from './wedge/marks.ts';
import { modelOf } from './wedge/model.ts';
import { bandPath, FIT, n3, polygonPath, SHAPE, silhouettePath } from './wedge/ring.ts';
import type { View } from './wedge/view.ts';

/** The dimensions this look draws; the legend says nothing about the others. */
const DRAWN = new Set<LegendItem['primitive']>([
  'width',
  'height',
  'colour',
  'segments',
  'order',
  'tail',
]);

/** Round to what the picture can show, so the same reading always gives the same bytes. */
const o2 = (x: number) => Math.round(x * 100) / 100;

export const skinV2: Skin = (reading, { size, thumb }) => {
  const m = modelOf({ title: reading.title, petals: reading.petals });
  const k = (size * FIT) / SHAPE.R;
  const view: View = {
    k,
    x: size / 2 - SHAPE.cx * k,
    y: size / 2 - SHAPE.cy * k,
    width: size,
    height: size,
  };
  const mk = marks(m, view, null, m.ring, new Float64Array(m.n), false, -1);
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(reading.title)}" data-petal="render/v2" data-spec="${reading.spec_sha256}">`,
    `<style>${STYLE}</style>`,
    `<g transform="translate(${n3(view.x)} ${n3(view.y)}) scale(${n3(k)})">`,
  ];

  // Far enough away the flower is one shape; nearer, each petal is its own wedge, in its colour.
  if (mk.silhouette > 0.01 && mk.petals <= 0.01) {
    out.push(`<path style="fill:var(--unknown)" d="${silhouettePath(m.ring)}"/>`);
  } else {
    out.push('<g class="petal-bars">');
    m.petals.forEach((p, i) => {
      const h = m.ring.h[i] as number;
      if (!p.tail && p.segments.length > 0) {
        // Its bands, bottom to top, each in its own colour.
        let acc = 0;
        p.segments.forEach((x, j) => {
          const h0 = h * acc;
          acc += x.frac;
          const h1 = j === p.segments.length - 1 ? h : h * acc;
          const cls = SEGMENT_STYLE[x.key as BackerClass]?.cls ?? 'c-unknown';
          out.push(
            `<path class="${cls}" data-p="${esc(p.id)}" data-i="${p.index}" data-seg="${esc(x.key)}" d="${bandPath(m.ring, i, h0, h1)}"/>`,
          );
        });
        return;
      }
      const paint = p.tail ? ' style="fill:var(--tail)"' : '';
      const cls = p.tail ? '' : ` class="${colourStyle(p.colour).cls}"`;
      out.push(
        `<path${cls}${paint} data-p="${esc(p.id)}" data-i="${p.index}" d="${bandPath(m.ring, i, 0, h)}"/>`,
      );
    });
    out.push('</g>');
  }
  if (mk.polygon > 0.01) {
    out.push(
      `<path class="petal-poly" stroke-opacity="${o2(mk.polygon)}" vector-effect="non-scaling-stroke" d="${polygonPath(m.ring)}"/>`,
    );
  }
  out.push('</g>');

  if (!thumb) {
    // The names it has room for, by the same rules as the live flower's at rest.
    for (const note of mk.notes) {
      if (note.opacity <= 0.01) continue;
      out.push(
        `<g opacity="${o2(note.opacity)}"><path fill="none" style="stroke:var(--hair)" d="M${n3(note.dotX)} ${n3(note.dotY)}L${n3(note.elbowX)} ${n3(note.elbowY)}L${n3(note.ruleX)} ${n3(note.elbowY)}"/><circle r="2.5" style="fill:var(--hair);stroke:var(--ink-2)" cx="${n3(note.dotX)}" cy="${n3(note.dotY)}"/><text x="${n3(note.x)}" y="${n3(note.y)}">${esc(note.text)}</text></g>`,
      );
    }
    const t = mk.titleInside.opacity >= mk.titleOutside.opacity ? mk.titleInside : mk.titleOutside;
    if (t.opacity > 0.01) {
      out.push(
        `<text class="petal-centre" opacity="${o2(t.opacity)}" x="${n3(t.x)}" y="${n3(t.y)}" text-anchor="middle">${esc(reading.title)}</text>`,
      );
    }
  }
  out.push('</svg>');

  return {
    // One element a line, the root first, as renderer.md has it.
    svg: `${out.join('\n')}\n`,
    // The reading's words were written for render/v1's hatched tail; this look paints it in a tone.
    legend: reading.legend
      .filter((item) => DRAWN.has(item.primitive))
      .map((item) => ({ ...item, meaning: item.meaning.replace('one hatched petal', 'one petal') }))
      .map(legendItem),
    petals: reading.details.map((d) => ({
      ...d,
      values: d.values.map((v) => ({ ...v, explains: v.explains.replace(/^hatched: /, '') })),
    })),
  };
};
