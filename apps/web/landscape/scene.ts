// The map's drawing (specs/006-the-map, bench v2): one SVG, built once, then attributes written on it.
// What's on top of what, bottom to top: connections, flowers, the live flowers (flower/drive.ts, put in
// place by the hook), names and marks, and the arrows out of an organisation you've entered; the flower
// you're pointing at, or have entered, goes above all of it so its notes are never under anything. Far
// away each flower is its own silhouette at rest; its name sits under its petals, one size on screen.
// Colours are token roles, as on the flower. With the lab's far wave (#84), a far flower is one soft ring in
// its main colour instead, its mark in the ring's hole and its name just under it.
import { FAR_WAVE, farRuns, waveReach } from '@petal/core/wedge/far';
import { HIGHLIGHT } from '@petal/core/wedge/highlight';
import { GREY, keyFor, keysOf } from '@petal/core/wedge/keys';
import { DETAIL, fade } from '../flower/detail.ts';
import type { Model } from '../flower/model.ts';
import { n3, polygonPath, SHAPE, silhouettePath } from '../flower/ring.ts';
import { LINE, MONO, textWidth } from '../flower/words.ts';
import type { Place } from './places.ts';
import { crowdFade, type Road, roadWidth } from './roads.ts';
import { edgePoint, onScreen, reachToward, screenCentre, screenRadius } from './space.ts';

const NS = 'http://www.w3.org/2000/svg';
const INK = 'var(--text-primary)';
const MUTED = 'var(--text-muted)';
const HAIR = 'var(--hairline)';
const GROUND = 'var(--surface)';
const PETAL = 'var(--figure-petal)';

/** A connection at full strength is this see-through, so it never reads heavier than a flower. */
const ROAD_TONE = 0.4;
/** The lab's focused lines (#87): one flower's at a time, so a little firmer, still quiet. */
const LINE_TONE = 0.55;
/** A mark is this many px across on screen, at any zoom. */
export const MARK = 16;
const GAP = 6;
/** Names keep this far apart. */
const NAME_GAP = 8;
/** The arrows' names keep this far from the window's edge. */
const EDGE = 28;

export interface LandFlower {
  name: string;
  mark: { logo: string | null; symbol: string };
  place: Place;
  model: Model;
  /** How far its petals reach, as a share of its room (space.ts reachOf). */
  reach: number;
}

export interface LandView {
  k: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where an arrow out of the entered organisation was drawn, so a click can follow it. */
export interface ArrowHit {
  to: number;
  box: Box | null;
  line: [number, number, number, number];
}

export interface LandFrame {
  view: LandView;
  live: ReadonlySet<number>;
  /** The organisation you're in, or -1; and how far in, 0 to 1. */
  entered: number;
  enter: number;
  /** The connection a click marked, or -1. */
  marked: number;
  /** The flower under the pointer, or -1 (the lab's lines lean, #87). */
  pointed?: number;
  /** Where the window's free space starts on the left, past what sits down its side. */
  left: number;
}

export interface LandScene {
  /** Live flowers go just under this, so names stay above them. */
  top: SVGGElement;
  draw(f: LandFrame): ArrowHit[];
  dispose(): void;
}

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  parent?.appendChild(node);
  return node;
}

/** Writes an attribute only when it changed. */
class Slot<E extends SVGElement> {
  node: E;
  private last = new Map<string, string>();
  constructor(node: E) {
    this.node = node;
  }
  set(name: string, value: string | number): void {
    const s = String(value);
    if (this.last.get(name) === s) return;
    this.last.set(name, s);
    this.node.setAttribute(name, s);
  }
  show(on: boolean): void {
    this.set('display', on ? 'inline' : 'none');
  }
}

const slot = <E extends SVGElement>(node: E) => new Slot(node);
const o2 = (x: number) => Math.round(x * 100) / 100;
const count = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const overlaps = (a: Box, b: Box, gap = NAME_GAP) =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + 2 && b.y0 < a.y1 + 2;

/** A connection's two ends in the world: from the edge of one flower's petals to the other's. */
export function roadEnds(a: LandFlower, b: LandFlower): [number, number, number, number] {
  const pa = a.place;
  const pb = b.place;
  const d = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
  const ux = (pb.x - pa.x) / d;
  const uy = (pb.y - pa.y) / d;
  const ra = SHAPE.R * pa.s * a.reach;
  const rb = SHAPE.R * pb.s * b.reach;
  return [pa.x + ux * ra, pa.y + uy * ra, pb.x - ux * rb, pb.y - uy * rb];
}

/** How wide a mark is: a logo is round, a symbol is a pill around its letters. */
/** A text's width as the browser draws it, or the flower's estimate where it can't say. */
function widthOf(t: SVGTextElement): number {
  try {
    const w = t.getComputedTextLength();
    if (w > 0) return w;
  } catch {
    // Not drawn (no layout): the estimate below.
  }
  return textWidth(t.textContent ?? '');
}

/**
 * A mark, drawn once, its middle at (0, 0): a round logo, or a pill around the token symbol. Returns its
 * width. Its parent must be on screen, so the symbol can be measured as drawn.
 */
function drawMark(m: LandFlower['mark'], parent: Element, clip: string): number {
  if (m.logo) {
    el(
      'image',
      {
        href: m.logo,
        x: -MARK / 2,
        y: -MARK / 2,
        width: MARK,
        height: MARK,
        'clip-path': `url(#${clip})`,
        preserveAspectRatio: 'xMidYMid slice',
      },
      parent,
    );
    return MARK;
  }
  const t = el('text', { fill: INK, 'text-anchor': 'middle', y: 4 }, parent);
  t.textContent = m.symbol;
  const w = Math.max(MARK, widthOf(t) + 10);
  const pill = el('rect', {
    x: -w / 2,
    y: -MARK / 2,
    width: w,
    height: MARK,
    rx: MARK / 2,
    fill: GROUND,
    stroke: HAIR,
    'vector-effect': 'non-scaling-stroke',
  });
  parent.insertBefore(pill, t);
  return w;
}

interface Label {
  group: Slot<SVGGElement>;
  /** With the far wave, the mark alone, drawn at the flower's centre. */
  centre: Slot<SVGGElement> | null;
  name: Slot<SVGTextElement>;
  width: number;
  markW: number;
  /** Its name is its symbol, so the mark says it. */
  said: boolean;
}

/** A name with its mark before it, laid out once from (0, 0), the mark's middle on the line. */
function drawLabel(
  f: Pick<LandFlower, 'name' | 'mark'>,
  parent: Element,
  clip: string,
  centred = false,
): Label {
  // Drawn on screen first, so the mark and the name are measured as the browser sets them, then hidden.
  const group = slot(el('g', {}, parent));
  const centre = centred ? slot(el('g', {}, parent)) : null;
  const mark = el('g', {}, centre ? centre.node : group.node);
  const drawnW = drawMark(f.mark, mark, clip);
  // centred, the mark sits on the flower's middle and the name stands alone
  const markW = centre ? 0 : drawnW;
  if (!centre) mark.setAttribute('transform', `translate(${n3(markW / 2)} 0)`);
  const name = slot(el('text', { fill: INK, x: centre ? 0 : markW + GAP, y: 4 }, group.node));
  name.node.textContent = f.name;
  // A name that's only its symbol is already said by its mark.
  const said = !f.mark.logo && f.name.toLowerCase() === f.mark.symbol.toLowerCase();
  const width = said ? markW : markW + (centre ? 0 : GAP) + widthOf(name.node);
  if (said) name.show(false);
  group.show(false);
  centre?.show(false);
  return { group, centre, name, width: said ? markW : width, markW, said };
}

/** The ray from (x, y) along (ux, uy): how far along it first enters a box, or null if it doesn't. */
function entersBox(x: number, y: number, ux: number, uy: number, b: Box): number | null {
  let lo = 0;
  let hi = Number.POSITIVE_INFINITY;
  for (const [o, u, a, c] of [
    [x, ux, b.x0, b.x1],
    [y, uy, b.y0, b.y1],
  ] as const) {
    if (Math.abs(u) < 1e-9) {
      if (o < a || o > c) return null;
      continue;
    }
    const t1 = (a - o) / u;
    const t2 = (c - o) / u;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  }
  return lo <= hi ? lo : null;
}

let clips = 0;

/** How a far flower is drawn: its silhouette, or (the lab's, #84) the far wave. */
export type FarStyle = 'wave' | null;

/**
 * When connections show (#87): as they always have, or the lab's lean, 'focus': none far away, and at the map's
 * zoom only the pointed flower's and a marked one, each a quiet ink line as wide as the accounts shared.
 */
export type LineStyle = 'focus' | null;

/**
 * Each petal's colour in the far wave: the art direction's keys, handed out by how many petals carry each kind,
 * as the lab's petal look keys them (core's wedge/keys.ts); everyone else in grey.
 */
function waveFills(m: Model): string[] {
  const real = m.petals.filter((p) => !p.tail);
  const kinds = keysOf(
    real.map((p) => p.colour),
    real.map((p) => p.share),
  );
  return m.petals.map((p) => (p.tail ? GREY.hex : (keyFor(kinds, p.colour)?.hex ?? GREY.hex)));
}

/** The centre mark's size on screen: a share of the flower's hole, never smaller or larger than these. */
const MARK_LEAST = 16;
const MARK_MOST = 44;

export function createLandScene(
  svg: SVGSVGElement,
  flowers: readonly LandFlower[],
  roads: readonly Road[],
  far: FarStyle = null,
  lines: LineStyle = null,
): LandScene {
  const clip = `landscape-mark-${++clips}`;
  const defs = el('defs', {}, svg);
  // The far wave's surface: the highlight's light and shade, in the colour under it, as shares of each flower's
  // own box, so it reads the same at every size.
  const surface = `landscape-surface-${clips}`;
  if (far) {
    const f = el(
      'filter',
      {
        id: surface,
        x: '-5%',
        y: '-5%',
        width: '110%',
        height: '110%',
        primitiveUnits: 'objectBoundingBox',
        'color-interpolation-filters': 'sRGB',
      },
      defs,
    );
    const inner = (name: string, slope: number, dx: number, opacity: number) => {
      el('feOffset', { in: 'SourceAlpha', dx, dy: dx, result: `${name}-o` }, f);
      el('feGaussianBlur', { in: `${name}-o`, stdDeviation: 0.02, result: `${name}-b` }, f);
      el(
        'feComposite',
        {
          in: 'SourceAlpha',
          in2: `${name}-b`,
          operator: 'arithmetic',
          k1: -1,
          k2: 1,
          k3: 0,
          k4: 0,
          result: `${name}-e`,
        },
        f,
      );
      const tone = el('feComponentTransfer', { in: 'SourceGraphic', result: `${name}-c` }, f);
      for (const fn of ['feFuncR', 'feFuncG', 'feFuncB'] as const) {
        el(fn, { type: 'linear', slope }, tone);
      }
      el('feFuncA', { type: 'linear', slope: opacity }, tone);
      el('feComposite', { in: `${name}-c`, in2: `${name}-e`, operator: 'in', result: name }, f);
    };
    inner('light', HIGHLIGHT.light.lift, 0.012, HIGHLIGHT.light.opacity);
    inner('shade', HIGHLIGHT.shade.tone, -0.012, HIGHLIGHT.shade.opacity);
    const merge = el('feMerge', {}, f);
    for (const name of ['SourceGraphic', 'light', 'shade']) el('feMergeNode', { in: name }, merge);
  }
  const clipPath = el('clipPath', { id: clip, clipPathUnits: 'objectBoundingBox' }, defs);
  el('circle', { cx: 0.5, cy: 0.5, r: 0.5 }, clipPath);

  const land = el('g', { class: MONO, 'pointer-events': 'none' }, svg);
  const world = slot(el('g', {}, land));
  const roadLayer = slot(el('g', { stroke: INK, fill: 'none' }, world.node));
  const flowerLayer = slot(el('g', {}, world.node));
  const counts = slot(el('g', {}, land));
  const top = el('g', { class: MONO, 'pointer-events': 'none' }, svg);
  const names = el('g', {}, top);
  const arrows = el('g', {}, top);

  // figure.map-road
  const roadSlots = roads.map((r) => {
    const ends = roadEnds(flowers[r.a] as LandFlower, flowers[r.b] as LandFlower);
    const [x1, y1, x2, y2] = ends;
    const line = slot(
      el(
        'line',
        {
          x1: n3(x1),
          y1: n3(y1),
          x2: n3(x2),
          y2: n3(y2),
          'stroke-width': o2(roadWidth(r.shared)),
          'vector-effect': 'non-scaling-stroke',
          display: 'none',
        },
        roadLayer.node,
      ),
    );
    const number = slot(
      el('text', { fill: MUTED, 'text-anchor': 'middle', display: 'none' }, counts.node),
    );
    number.node.textContent = count(r.shared);
    return { line, number, ends, numberWidth: textWidth(count(r.shared)) };
  });

  // figure.map-flower: each flower's silhouette and polygon line, set once at its place and size.
  const flowerSlots = flowers.map((f) => {
    const { x, y, s } = f.place;
    const g = slot(
      el(
        'g',
        { transform: `translate(${n3(x - s * SHAPE.cx)} ${n3(y - s * SHAPE.cy)}) scale(${n3(s)})` },
        flowerLayer.node,
      ),
    );
    const silhouette = slot(el('path', { fill: PETAL, d: silhouettePath(f.model.ring) }, g.node));
    // figure.map-far-wave: its runs of colour under one soft surface
    let wave: Slot<SVGGElement> | null = null;
    if (far) {
      const w = slot(el('g', { filter: `url(#${surface})` }, g.node));
      for (const run of farRuns(f.model, SHAPE, waveFills(f.model), FAR_WAVE)) {
        el('path', { fill: run.fill, d: run.d }, w.node);
      }
      wave = w;
    }
    const polygon = slot(
      el(
        'path',
        {
          fill: 'none',
          stroke: INK,
          'stroke-width': 1,
          'vector-effect': 'non-scaling-stroke',
          d: polygonPath(f.model.ring),
          opacity: 0,
        },
        g.node,
      ),
    );
    return { g, polygon, silhouette, wave, shown: true };
  });
  /** How far each flower's wave reaches, as reach is for its petals. */
  const waveReaches = flowers.map((f) => (far ? waveReach(f.model, SHAPE, FAR_WAVE) : f.reach));

  // head.map-name: one line under each flower, its mark and its name; with the far wave, the mark at the ring's
  // centre and the name alone under it.
  const labels = flowers.map((f) => drawLabel(f, names, clip, far === 'wave'));

  // figure.map-arrow: the ways out of the organisation you've entered, one per connection.
  const ways = flowers.map((_, i) =>
    roads
      .filter((r) => r.a === i || r.b === i)
      .map((r) => ({ to: r.a === i ? r.b : r.a, shared: r.shared }))
      .sort((p, q) => q.shared - p.shared || p.to - q.to),
  );
  const arrowSlots = Array.from({ length: Math.max(0, ...ways.map((w) => w.length)) }, () => {
    const g = slot(el('g', { display: 'none' }, arrows));
    const line = slot(el('line', { stroke: INK, 'vector-effect': 'non-scaling-stroke' }, g.node));
    const head = slot(el('path', { fill: INK }, g.node));
    const at = slot(el('g', {}, g.node));
    return { g, line, head, at, label: null as Label | null, to: -1 };
  });

  const order = flowers
    .map((_, i) => i)
    .sort((a, b) => (flowers[b]?.place.s ?? 0) - (flowers[a]?.place.s ?? 0) || a - b);

  return {
    top,
    draw({ view, live, entered, enter, marked, left, pointed = -1 }) {
      world.set('transform', `translate(${n3(view.x)} ${n3(view.y)}) scale(${view.k})`);
      const rest = 1 - enter;
      flowerLayer.set('opacity', o2(rest));
      roadLayer.set('opacity', o2(rest));
      counts.set('opacity', o2(rest));

      // Flowers: a silhouette unless it's live; its polygon line by its size.
      flowers.forEach((f, i) => {
        const s = flowerSlots[i] as (typeof flowerSlots)[number];
        const visible = !live.has(i) && onScreen(view, f.place) && rest > 0.01;
        if (visible !== s.shown) {
          s.g.show(visible);
          s.shown = visible;
        }
        if (visible) {
          const r = screenRadius(view, f.place);
          if (s.wave) {
            const w = fade(DETAIL.farWave, r);
            s.wave.set('opacity', o2(w));
            s.silhouette.set('opacity', o2(1 - w));
            s.polygon.set('opacity', o2(fade(DETAIL.polygonLine, r) * (1 - w)));
          } else s.polygon.set('opacity', o2(fade(DETAIL.polygonLine, r)));
        }
      });

      // Names: biggest flowers first; where two collide, the smaller keeps only its mark, or nothing. A
      // name never sits on a flower: every flower on screen, at its petals' reach, is in the way.
      const placed: Box[] = [];
      const discs: { x: number; y: number; r: number; i: number }[] = [];
      flowers.forEach((f, i) => {
        if (!onScreen(view, f.place) || (rest <= 0.01 && i !== entered)) return;
        const c = screenCentre(view, f.place);
        discs.push({ ...c, r: screenRadius(view, f.place) * f.reach, i });
      });
      const onAFlower = (b: Box, own: number) =>
        discs.some((d) => {
          if (d.i === own) return false;
          const nx = Math.max(b.x0, Math.min(d.x, b.x1));
          const ny = Math.max(b.y0, Math.min(d.y, b.y1));
          return Math.hypot(nx - d.x, ny - d.y) < d.r;
        });
      for (const i of order) {
        const f = flowers[i] as LandFlower;
        const l = labels[i] as Label;
        const tone = i === entered ? 1 : rest;
        const r = screenRadius(view, f.place);
        const markShown = fade(DETAIL.mark, r) * tone;
        if (!onScreen(view, f.place) || markShown <= 0.01) {
          l.group.show(false);
          l.centre?.show(false);
          continue;
        }
        const c = screenCentre(view, f.place);
        const waved = l.centre ? fade(DETAIL.farWave, r) : 0;
        if (l.centre) {
          // the mark in the flower's middle at every zoom (Elco, 11 Nov: "I don't see why they have to go away at
          // larger zooms, we just need a minimum and max size"): a share of its hole, between the two
          const size = Math.max(MARK_LEAST, Math.min(MARK_MOST, r * (SHAPE.r0 / SHAPE.R) * 1.1));
          l.centre.show(true);
          l.centre.set('transform', `translate(${n3(c.x)} ${n3(c.y)}) scale(${n3(size / MARK)})`);
          l.centre.set('opacity', o2(markShown));
        }
        const reach = l.centre ? waveReaches[i] * waved + f.reach * (1 - waved) : f.reach;
        const y = c.y + r * reach + (l.centre ? 6 : 10) + MARK / 2;
        const nameShown = fade(DETAIL.titleOutside, r) * tone;
        const full = {
          x0: c.x - l.width / 2,
          y0: y - MARK / 2,
          x1: c.x + l.width / 2,
          y1: y + MARK / 2,
        };
        const bare = { x0: c.x - l.markW / 2, y0: full.y0, x1: c.x + l.markW / 2, y1: full.y1 };
        let box: Box | null = null;
        let withName = false;
        if (
          nameShown > 0.01 &&
          !l.said &&
          !placed.some((b) => overlaps(b, full)) &&
          !onAFlower(full, i)
        ) {
          box = full;
          withName = true;
        } else if (!l.centre && !placed.some((b) => overlaps(b, bare, 2))) box = bare;
        if (!box) {
          l.group.show(false);
          continue;
        }
        placed.push(box);
        l.group.show(true);
        l.group.set('transform', `translate(${n3(box.x0)} ${n3(y)})`);
        l.group.set('opacity', o2(withName ? Math.max(markShown, nameShown) : markShown));
        l.name.show(withName && !l.said);
      }

      // Connections: each flower's strongest few from the farthest, the rest as they grow; fainter the more
      // there are. The number at the middle once there's room, or at any size once a click marks it.
      const showing: { i: number; o: number; pair: number }[] = [];
      roads.forEach((r, i) => {
        const s = roadSlots[i] as (typeof roadSlots)[number];
        const a = flowers[r.a]?.place as Place;
        const b = flowers[r.b]?.place as Place;
        let o = 0;
        let pair = 0;
        if (rest > 0.01 && (onScreen(view, a) || onScreen(view, b))) {
          pair = Math.min(screenRadius(view, a), screenRadius(view, b));
          if (lines === 'focus') {
            // only the pointed flower's, once it's big enough to be told apart, and a marked one
            const own = pointed >= 0 && (r.a === pointed || r.b === pointed);
            const size = pointed >= 0 ? screenRadius(view, flowers[pointed]?.place as Place) : 0;
            o = i === marked ? 1 : own ? fade(DETAIL.lineFocus, size) : 0;
          } else
            o =
              i === marked
                ? 1
                : fade(DETAIL.road, pair) * (r.strong ? 1 : fade(DETAIL.roadMore, pair));
        }
        if (o > 0.01) showing.push({ i, o, pair });
        else {
          s.line.show(false);
          s.number.show(false);
        }
      });
      const crowd = lines === 'focus' ? 1 : crowdFade(showing.length);
      for (const { i, o, pair } of showing) {
        const s = roadSlots[i] as (typeof roadSlots)[number];
        s.line.show(true);
        s.line.set(
          'opacity',
          o2(i === marked ? 0.9 : o * crowd * (lines === 'focus' ? LINE_TONE : ROAD_TONE)),
        );
        const shown = i === marked ? 1 : fade(DETAIL.roadCount, pair) * Math.min(1, o * 2);
        const [x1, y1, x2, y2] = s.ends;
        const mx = view.x + (view.k * (x1 + x2)) / 2;
        const my = view.y + (view.k * (y1 + y2)) / 2;
        const box = {
          x0: mx - s.numberWidth / 2,
          y0: my - LINE / 2 - 4,
          x1: mx + s.numberWidth / 2,
          y1: my + LINE / 2 - 4,
        };
        if (shown > 0.01 && (i === marked || !placed.some((p) => overlaps(p, box, 4)))) {
          placed.push(box);
          s.number.show(true);
          s.number.set('x', n3(mx));
          s.number.set('y', n3(my));
          s.number.set('opacity', o2(shown));
          s.number.set('fill', i === marked ? INK : MUTED);
        } else s.number.show(false);
      }

      // Arrows: out of the organisation you're in, each the real way to its neighbour, named at the edge.
      const hits: ArrowHit[] = [];
      const e = entered >= 0 && enter > 0.01 ? (flowers[entered] as LandFlower) : null;
      const out = e ? (ways[entered] ?? []) : [];
      const taken: Box[] = [];
      arrowSlots.forEach((a, k) => {
        const way = out[k];
        if (!way || !e) {
          a.g.show(false);
          return;
        }
        const n = flowers[way.to] as LandFlower;
        const c = screenCentre(view, e.place);
        const dx = n.place.x - e.place.x;
        const dy = n.place.y - e.place.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const from = reachToward(e.model, ux, uy) * view.k * e.place.s + 10;
        const end = edgePoint(c.x, c.y, ux, uy, view.width, view.height, EDGE, left + EDGE / 2);
        if (a.to !== way.to) {
          // On screen while it's drawn, so its name is measured as set.
          a.g.show(true);
          a.at.show(true);
          a.at.node.replaceChildren();
          a.label = drawLabel(n, a.at.node, clip);
          a.label.group.show(true);
          a.to = way.to;
        }
        const label = a.label as Label;
        // The name sits against the edge the arrow meets, inside the window.
        const w = label.width;
        let x0 = end.x - w / 2;
        let y0 = end.y - MARK / 2;
        if (Math.abs(ux) >= Math.abs(uy)) x0 = ux > 0 ? end.x - w : end.x;
        else y0 = uy > 0 ? end.y - MARK : end.y;
        x0 = Math.max(left + EDGE / 2, Math.min(view.width - EDGE / 2 - w, x0));
        y0 = Math.max(EDGE / 2, Math.min(view.height - EDGE / 2 - MARK, y0));
        const box = { x0, y0, x1: x0 + w, y1: y0 + MARK };
        const named = !taken.some((b) => overlaps(b, box));
        const reachEnd = Math.hypot(end.x - c.x, end.y - c.y);
        const stop = named ? (entersBox(c.x, c.y, ux, uy, box) ?? reachEnd) - 8 : reachEnd;
        if (stop <= from + 12) {
          a.g.show(false);
          return;
        }
        if (named) taken.push(box);
        const x1 = c.x + ux * from;
        const y1 = c.y + uy * from;
        const x2 = c.x + ux * stop;
        const y2 = c.y + uy * stop;
        const width = roadWidth(way.shared);
        const size = 5 + width;
        const hx = -uy * size * 0.6;
        const hy = ux * size * 0.6;
        a.g.show(true);
        a.g.set('opacity', o2(enter));
        a.line.set('x1', n3(x1));
        a.line.set('y1', n3(y1));
        a.line.set('x2', n3(x2 - ux * size));
        a.line.set('y2', n3(y2 - uy * size));
        a.line.set('stroke-width', o2(width));
        a.head.set(
          'd',
          `M${n3(x2)} ${n3(y2)}L${n3(x2 - ux * size + hx)} ${n3(y2 - uy * size + hy)}L${n3(x2 - ux * size - hx)} ${n3(y2 - uy * size - hy)}Z`,
        );
        a.at.show(named);
        if (named) a.at.set('transform', `translate(${n3(x0)} ${n3(y0 + MARK / 2)})`);
        hits.push({ to: way.to, box: named ? box : null, line: [x1, y1, x2, y2] });
      });
      return hits;
    },
    dispose() {
      defs.remove();
      land.remove();
      top.remove();
    },
  };
}
