// SVG writing with the determinism rules of renderer.md: coordinates with toFixed(2), a fixed
// element order (<style>, <defs>, polygon, lines, bars, outlines, markings, labels), ids derived
// from the spec, colours as CSS custom properties, no text measurement, no script.
import { along, anchorOf, type Layout, type PetalGeo, type Pt, sideLength } from './geometry.ts';
import { STYLE } from './style.ts';

/** toFixed(2), never "-0.00". */
export function f2(x: number): string {
  const s = x.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

const pts = (arr: Pt[]): string => arr.map((p) => `${f2(p[0])} ${f2(p[1])}`).join('L');

/** The outline of a bar between heights hA and hB above a petal's sides: a parallelogram per
 * sub-side, joined into one closed path. */
export function band(g: PetalGeo, hA: number, hB: number): string {
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (const s of g.sides) {
    outer.push(along(s.p0, s.n, hB), along(s.p1, s.n, hB));
    inner.push(along(s.p0, s.n, hA), along(s.p1, s.n, hA));
  }
  return `M${pts(outer)}L${pts(inner.reverse())}Z`;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

export interface BarSegment {
  /** data-seg: a backer class, "bar" for a whole bar, "tail" for the tail */
  key: string;
  h0: number;
  h1: number;
  /** fill class (c-*), or a url() fill for the tail */
  cls?: string;
  fill?: string;
}

export interface DrawnPetal {
  geo: PetalGeo;
  segments: BarSegment[];
  outline: 'solid' | 'dashed' | null;
  /** the label text, e.g. "astrostakers.com 5.61%" */
  label: string;
}

export interface SvgModel {
  layout: Layout;
  thumb: boolean;
  title: string;
  specSha256: string;
  hatchId: string;
  petals: DrawnPetal[];
}

/** Fixed character width for 11px labels: no text measurement (renderer.md). */
const CHAR_W = 6.1;
const MAX_LABELS = 9;

interface Label {
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
  text: string;
}

type Box = [number, number, number, number];

/** Does the segment a-b cross the box? (Liang-Barsky clipping.) */
function segmentHitsBox(a: Pt, b: Pt, box: Box): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - box[0], box[2] - a[0], a[1] - box[1], box[3] - a[1]];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    const pi = p[i] as number;
    const qi = q[i] as number;
    if (pi === 0) {
      if (qi < 0) return false;
      continue;
    }
    const r = qi / pi;
    if (pi < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

/** The edges of every bar: both radial edges and the top of each sub-side. */
function barEdges(petals: DrawnPetal[]): [Pt, Pt][] {
  return petals.flatMap((p) =>
    p.geo.sides.flatMap((s): [Pt, Pt][] => {
      const t0 = along(s.p0, s.n, p.geo.H);
      const t1 = along(s.p1, s.n, p.geo.H);
      return [
        [s.p0, t0],
        [s.p1, t1],
        [t0, t1],
      ];
    }),
  );
}

/** Selective direct labels at the top of the biggest bars, the tail first. No label leaves the
 * canvas, overlaps another or crosses a bar: a label that would moves outward (and, near the top
 * or bottom, to one side) until it is clear, or is left out. */
function placeLabels(m: SvgModel): Label[] {
  const { size, R, r0 } = m.layout;
  const candidates = m.petals
    .filter((p) => p.geo.row.tail || sideLength(p.geo) >= 5)
    .sort(
      (a, b) =>
        Number(Boolean(b.geo.row.tail)) - Number(Boolean(a.geo.row.tail)) ||
        b.geo.row.share - a.geo.row.share ||
        a.geo.row.index - b.geo.row.index,
    );
  const edges = barEdges(m.petals);
  const boxes: Box[] = [];
  const out: Label[] = [];
  const maxLift = R - r0 + 16;
  for (const p of candidates) {
    if (out.length >= MAX_LABELS) break;
    const { x, y, n } = anchorOf(p.geo);
    const preferred = n[0] > 0.15 ? 'start' : n[0] < -0.15 ? 'end' : 'middle';
    const anchors: Label['anchor'][] =
      preferred === 'middle' ? ['middle', n[0] < 0 ? 'end' : 'start'] : [preferred];
    const w = p.label.length * CHAR_W;
    let placed: { label: Label; box: Box } | null = null;
    for (let lift = p.geo.H + 8; lift <= maxLift && !placed; lift += 4) {
      const tx = x + n[0] * lift;
      const ty = y + n[1] * lift + 4;
      for (const anchor of anchors) {
        const bx = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2;
        const box: Box = [bx - 2, ty - 11, bx + w + 2, ty + 2];
        if (box[0] < 2 || box[2] > size - 2 || box[1] < 2 || box[3] > size - 2) continue;
        if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]))
          continue;
        if (edges.some(([a, b]) => segmentHitsBox(a, b, box))) continue;
        placed = { label: { x: tx, y: ty, anchor, text: p.label }, box };
        break;
      }
    }
    if (!placed) continue;
    boxes.push(placed.box);
    out.push(placed.label);
  }
  return out;
}

export function writeSvg(m: SvgModel): string {
  const { layout: g, thumb } = m;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.size} ${g.size}" role="img" aria-label="${esc(m.title)}" data-petal="render/v1" data-spec="${m.specSha256}">`,
  );
  out.push(`<style>${STYLE}</style>`);
  out.push(
    `<defs><pattern id="${m.hatchId}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hatch-bg" width="5" height="5"/><line class="hatch-line" x1="0" y1="0" x2="0" y2="5"/></pattern></defs>`,
  );

  // the polygon
  out.push(
    `<path class="petal-poly" d="M${pts(m.petals.flatMap((p) => p.geo.sides.map((s) => s.p0)))}Z"/>`,
  );

  // lines: unavailable in this build (FR-032), nothing drawn

  // bars, cut into stacked segments
  out.push('<g class="petal-bars">');
  for (const p of m.petals) {
    const { row } = p.geo;
    const cut = !thumb && p.segments.length > 1 ? 0.9 : 0;
    const last = p.segments.length - 1;
    p.segments.forEach((s, j) => {
      const h0 = s.h0 + (j > 0 ? cut / 2 : 0);
      const h1 = s.h1 - (j < last ? cut / 2 : 0);
      if (h1 - h0 < 0.2) return;
      const paint = s.fill ? ` fill="${s.fill}"` : '';
      const cls = s.cls ? `petal-seg ${s.cls}` : 'petal-seg';
      out.push(
        `<path id="s-${row.index}-${esc(s.key)}" class="${cls}"${paint} data-p="${esc(row.id)}" data-i="${row.index}" data-seg="${esc(s.key)}" d="${band(p.geo, h0, h1)}"/>`,
      );
    });
  }
  out.push('</g>');

  // outlines: identity status
  const outlined = m.petals.filter((p) => p.outline && !thumb && sideLength(p.geo) > 3);
  if (outlined.length) {
    out.push('<g class="petal-outlines">');
    for (const p of outlined) {
      const top = p.segments.reduce((t, s) => Math.max(t, s.h1), 0);
      out.push(
        `<path class="petal-outline${p.outline === 'dashed' ? ' inferred' : ''}" data-p="${esc(p.geo.row.id)}" data-i="${p.geo.row.index}" d="${band(p.geo, 0, top)}"/>`,
      );
    }
    out.push('</g>');
  }

  // markings: unavailable in this build (FR-032), nothing drawn

  if (!thumb) {
    const labels = placeLabels(m);
    out.push('<g class="petal-labels">');
    for (const l of labels)
      out.push(
        `<text x="${f2(l.x)}" y="${f2(l.y)}" text-anchor="${l.anchor}">${esc(l.text)}</text>`,
      );
    out.push('</g>');
    out.push(
      `<text class="petal-centre" x="${f2(g.cx)}" y="${f2(g.cy + 4)}" text-anchor="middle">${esc(m.title)}</text>`,
    );
  }
  out.push('</svg>');
  return `${out.join('\n')}\n`;
}
