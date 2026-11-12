// The map's drawing (specs/006-the-map, bench v2): one SVG, built once, then attributes written on it.
// What's on top of what, bottom to top: connections, flowers, the live flowers (flower/drive.ts, put in
// place by the hook), names and marks, and the arrows out of an organisation you've entered; the flower
// you're pointing at, or have entered, goes above all of it so its notes are never under anything. Far
// away each flower is its own silhouette at rest; its name sits under its petals, one size on screen.
// Colours are token roles, as on the flower. With the lab's far wave (#84), a far flower is one soft ring in
// its main colour instead, its mark in the ring's hole and its name just under it.
import { FAR_WAVE, farRuns } from '@petal/core/wedge/far';
import { HIGHLIGHT } from '@petal/core/wedge/highlight';
import { GREY, keyFor, keysOf, wordsOf } from '@petal/core/wedge/keys';
import { DETAIL, fade, type Row } from '../flower/detail.ts';
import type { Model } from '../flower/model.ts';
import { n3, polygonPath, roundTopPath, SHAPE } from '../flower/ring.ts';
import { LINE, MONO, textWidth } from '../flower/words.ts';
import { drawLabel, LABEL_HEIGHT, type Label, MARK, NAME_GAP, WORTH_HEIGHT } from './labels.ts';
import type { Place } from './places.ts';
import { crowdFade, type Road, roadWidth } from './roads.ts';
import { edgePoint, onScreen, reachToward, screenCentre, screenRadius } from './space.ts';
import { el, type Slot, slot } from './svg.ts';

const INK = 'var(--text-primary)';
const MUTED = 'var(--text-muted)';
const HAIR = 'var(--hairline)';
const GROUND = 'var(--surface)';
const PETAL = 'var(--figure-petal)';

/**
 * A connection at full strength is this see-through, so it never reads heavier than a flower (Elco, 11 Nov walk:
 * the lines were "way too powerful"; quieter).
 */
const ROAD_TONE = 0.15;
/** The focused lines (#87): one flower's at a time, so a little firmer, still quiet. */
const LINE_TONE = 0.18;
/** The arrows out of the organisation you're in: the same lines, as quiet. */
const ARROW_TONE = 0.3;
/** The arrows' names keep this far from the window's edge. */
const EDGE = 28;

export interface LandFlower {
  name: string;
  mark: { logo: string | null; symbol: string; types?: readonly string[]; chain?: string | null };
  place: Place;
  model: Model;
  /** How far its petals reach, as a share of its room (space.ts reachOf). */
  reach: number;
  /** its reading's snapshot, the relations index's name for its group */
  snapshot?: string | undefined;
  /** the map it stands for, and how many proposals that map has (#93) */
  map?: string | null | undefined;
  proposals?: number | undefined;
  /** its map's treasury and token price, in words, shown under its name at some magnification (Elco, 12 Nov walk 3) */
  worth?: readonly string[] | undefined;
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
  /** The wallet level: the flowers that hold the chosen wallet, or null with none chosen. The rest recede. */
  holds?: ReadonlySet<number> | null;
  /**
   * Two DAOs chosen (Elco, 12 Nov walk: "how could I select two dowels and see only those connections"): the one
   * connection between them, shown alone with its number; -2 when they share none, so none shows; -1 for none chosen.
   */
  only?: number;
  /**
   * Inside a DAO, the way out the pointer is on, by the flower it goes to, or -1 (Elco, 12 Nov walk: "we don't need
   * all of them to be showing up all the time. Maybe just having the neighbor Daos on the edges and then if I hover
   * the space in between the Daos I would see the connection and see how many users are in between them"): only its
   * line shows, with how many wallets the two share; the neighbours' names stay on the edges.
   */
  way?: number;
  /**
   * How much of every flower is its far wave, 1 to 0, the same for all at once (Elco, 12 Nov walk: "the transfer
   * from the mini shape to the individual petals shape right now it's too soon ... the transition happens at
   * different times depending on something related to the size of petals"): the map works it out from its zoom.
   * Without it, each flower by its own size, as before.
   */
  waved?: number;
  /** Treasury and token price under the names, at some magnification; the switch in the legend (OVERLAYS) */
  worth?: boolean;
  /**
   * A new map on its way (Elco, 12 Nov on /make: "if it's completely new, than we have a 'place holder'"): where it
   * will stand, in the map's own units, and its name. Drawn as a dashed round place, its name and 'new'.
   */
  pending?: { x: number; y: number; s: number; name: string } | null;
  /**
   * Work running on a map (Elco, 12 Nov on /make: the map stays while it runs): a small strip under that flower, or
   * under the placeholder, with the page's words and how far it is, when it's known.
   */
  progress?: { at: number | 'pending'; words: string; share: number | null } | null;
  /**
   * The boxes over the map (the chain list, the legend, a flower's panel), in its px: names keep clear of them, as
   * of each other (META's QA, 12 Nov: "labels never sit on each other or run off the window").
   */
  over?: readonly Box[];
}

/** The treasury and price under a name come in as a flower grows to this radius on screen, in px. */
export const WORTH_AT: Row = { driver: 'flowerRadius', fadeIn: [56, 72] };

/** A flower that doesn't hold the chosen wallet keeps this much of itself (the wallet level). */
export const WALLET_AWAY = 0.25;

export interface LandScene {
  /** Live flowers go just under this, so names stay above them. */
  top: SVGGElement;
  draw(f: LandFrame): ArrowHit[];
  /** Everything the last draw put on the screen (names, the neighbours' names, the boxes over it), for the notes. */
  taken(): readonly Box[];
  /** The flowers' places changed (a new arrangement gliding in): set their positions and the lines between them. */
  move(): void;
  dispose(): void;
}

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
export function waveFills(m: Model): string[] {
  const real = m.petals.filter((p) => !p.tail);
  const kinds = keysOf(
    real.map((p) => wordsOf(p.colour)),
    real.map((p) => p.share),
  );
  return m.petals.map((p) =>
    p.tail ? GREY.hex : (keyFor(kinds, wordsOf(p.colour))?.hex ?? GREY.hex),
  );
}

/** The centre mark's size on screen: a share of the flower's hole, never smaller or larger than these. */
const MARK_LEAST = 16;
const MARK_MOST = 44;
/** The name's badge sits this far under the centre mark. */
const NAME_UNDER_MARK = 4;

export function createLandScene(
  svg: SVGSVGElement,
  flowers: readonly LandFlower[],
  roads: readonly Road[],
  far: FarStyle = null,
  lines: LineStyle = null,
  /** the DAO in the middle, by its index here, or -1: a dashed ring round it, and its lines when none is pointed */
  centre = -1,
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
  // the arrows' names above every arrow's line, so one arrow never runs over another's name (OVERLAYS, 11 Nov)
  const arrowNames = el('g', {}, top);
  // the placeholder for a new map, and the strip of work running (Elco, 12 Nov on /make)
  const pendingRing = slot(
    el(
      'circle',
      {
        fill: 'none',
        stroke: INK,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
        'vector-effect': 'non-scaling-stroke',
        opacity: 0.6,
        display: 'none',
      },
      world.node,
    ),
  );
  let pendingLabel: { name: string; label: Label } | null = null;
  const strip = slot(el('g', { display: 'none' }, top));
  const stripGround = el(
    'rect',
    { fill: GROUND, stroke: HAIR, 'vector-effect': 'non-scaling-stroke' },
    strip.node,
  );
  const stripWords = el('text', { class: MONO, fill: MUTED, y: 4 }, strip.node);
  const stripTrack = el('rect', { height: 2, fill: HAIR }, strip.node);
  const stripDone = el('rect', { height: 2, fill: INK }, strip.node);
  // with no share known, a short piece runs along the track (SMIL: no frames of the map's own)
  const stripRun = el(
    'animate',
    { attributeName: 'x', dur: '1.6s', repeatCount: 'indefinite' },
    stripDone,
  );

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
    return { r, line, number, ends, numberWidth: textWidth(count(r.shared)) };
  });

  // figure.map-centre: the dashed ring round the DAO a click put in the middle, what the rest is compared to
  const middle = flowers[centre];
  let middleRing: SVGElement | null = null;
  if (middle) {
    const { x, y, s: size } = middle.place;
    middleRing = el(
      'circle',
      {
        cx: n3(x),
        cy: n3(y),
        r: n3(SHAPE.R * size * (middle.reach + 0.15)),
        fill: 'none',
        stroke: INK,
        'stroke-width': 1,
        'stroke-dasharray': '6 6',
        'vector-effect': 'non-scaling-stroke',
        opacity: 0.5,
      },
      flowerLayer.node,
    );
  }

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
    // its petals in its own colours, one path per colour, as the far wave before it and the live flower after it
    // have them, so a flower keeps its colours as it comes closer (Elco, 11 Nov walk: the transition from the small
    // petal to the one showing its wallets; it went grey in between)
    const fills = waveFills(f.model);
    const silhouette = slot(el('g', {}, g.node));
    const byFill = new Map<string, string>();
    const { ring } = f.model;
    for (let i = 0; i < ring.n; i++) {
      const fill = fills[i] ?? PETAL;
      // round tops, as the live flower's (one look)
      byFill.set(fill, (byFill.get(fill) ?? '') + roundTopPath(ring, i, ring.h[i] as number));
    }
    for (const [fill, d] of byFill) el('path', { fill, d }, silhouette.node);
    // figure.map-far-wave: its runs of colour under one soft surface
    let wave: Slot<SVGGElement> | null = null;
    if (far) {
      const w = slot(el('g', { filter: `url(#${surface})` }, g.node));
      for (const run of farRuns(f.model, SHAPE, fills, FAR_WAVE)) {
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

  // head.map-name: each flower's badge under it (labels.ts); with the far wave, its mark at the ring's centre and
  // the badge holding its name.
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
    const at = slot(el('g', { display: 'none' }, arrowNames));
    // how many wallets the two share, at the line's middle, while the pointer is on it
    const num = slot(
      el('text', { fill: MUTED, 'text-anchor': 'middle', display: 'none' }, arrowNames),
    );
    return { g, line, head, at, num, label: null as Label | null, to: -1 };
  });

  const order = flowers
    .map((_, i) => i)
    .sort((a, b) => (flowers[b]?.place.s ?? 0) - (flowers[a]?.place.s ?? 0) || a - b);

  let lastTaken: Box[] = [];
  return {
    top,
    draw({
      view,
      live,
      entered,
      enter,
      marked,
      left,
      pointed = -1,
      holds = null,
      only = -1,
      way: wayPointed = -1,
      waved: allWaved,
      worth: worthOn = true,
      pending = null,
      progress = null,
      over = [],
    }) {
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
          s.g.set('opacity', holds && !holds.has(i) ? WALLET_AWAY : 1);
          if (s.wave) {
            const w = allWaved ?? fade(DETAIL.farWave, r);
            s.wave.set('opacity', o2(w));
            s.silhouette.set('opacity', o2(1 - w));
            s.polygon.set('opacity', o2(fade(DETAIL.polygonLine, r) * (1 - w)));
          } else s.polygon.set('opacity', o2(fade(DETAIL.polygonLine, r)));
        }
      });

      // Names: biggest flowers first; where two collide, the smaller keeps only its mark, or nothing. A
      // name never sits on a flower: every flower on screen, at its petals' reach, is in the way.
      const placed: Box[] = [...over];
      /** where each flower's words end (its name, its treasury line), for the strip of work under them */
      const wordsEnd = new Map<number, Box>();
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
        // with a wallet chosen, the flowers that don't hold it recede, their marks and names too
        const tone = (i === entered ? 1 : rest) * (holds && !holds.has(i) ? WALLET_AWAY : 1);
        const r = screenRadius(view, f.place);
        const markShown = fade(DETAIL.mark, r) * tone;
        if (!onScreen(view, f.place) || markShown <= 0.01) {
          l.group.show(false);
          l.centre?.show(false);
          l.worth?.show(false);
          continue;
        }
        const c = screenCentre(view, f.place);
        let size = 0;
        if (l.centre) {
          // the mark in the flower's middle at every zoom (Elco, 11 Nov: "I don't see why they have to go away at
          // larger zooms, we just need a minimum and max size"). From far away it fills the flower's centre
          // (Elco, 11 Nov, on live /map: "The logo should take the full fucking space available in the center from
          // any far away vision and only when I get to the Dao itself it will become less important in the
          // center"): the far wave's round hole, or the polygon's inscribed circle, a hair inside its line; in
          // the organisation you've entered it steps back to a share of its hole, between the two
          const waved = l.centre && allWaved !== undefined ? allWaved : fade(DETAIL.farWave, r);
          const hole =
            r *
            (SHAPE.r0 / SHAPE.R) *
            (waved + (1 - waved) * Math.cos(Math.PI / Math.max(3, f.model.n)));
          const full = Math.max(MARK_LEAST, 2 * hole - 3);
          const back = Math.max(MARK_LEAST, Math.min(MARK_MOST, r * (SHAPE.r0 / SHAPE.R) * 1.1));
          size = full + (back - full) * (i === entered ? enter : 0);
          l.centre.show(true);
          l.centre.set('transform', `translate(${n3(c.x)} ${n3(c.y)}) scale(${n3(size / MARK)})`);
          l.centre.set('opacity', o2(markShown));
        }
        // with the far wave the name sits just under the centre mark (Elco, 11 Nov: "the logo in the center plus
        // the name ... it's floating super far away"); without it, under the petals
        const y = l.centre
          ? c.y + size / 2 + NAME_UNDER_MARK + LABEL_HEIGHT / 2
          : c.y + r * f.reach + 10 + MARK / 2;
        const nameShown = fade(DETAIL.titleOutside, r) * tone;
        // the badge with its types, else with its name alone (its types are cut first), else none
        let box: Box | null = null;
        let typed = true;
        if (nameShown > 0.01) {
          for (const [w, on] of [
            [l.width, true],
            [l.short, false],
          ] as const) {
            // inside the window: slid along its side, never cut at its top or foot (META's QA, 12 Nov)
            const x0 = Math.max(EDGE / 2, Math.min(view.width - EDGE / 2 - w, c.x - w / 2));
            const b = { x0, y0: y - MARK / 2, x1: x0 + w, y1: y + MARK / 2 };
            const inside = x0 >= EDGE / 2 && b.y0 >= 0 && b.y1 <= view.height;
            if (inside && !placed.some((p) => overlaps(p, b)) && !onAFlower(b, i)) {
              box = b;
              typed = on;
              break;
            }
          }
        }
        if (!box) {
          l.group.show(false);
          l.worth?.show(false);
          continue;
        }
        placed.push(box);
        wordsEnd.set(i, box);
        l.typed(typed);
        l.group.show(true);
        l.group.set('transform', `translate(${n3(box.x0)} ${n3(y)})`);
        l.group.set('opacity', o2(Math.max(markShown, nameShown)));
        // its treasury and token price just under its name, once it's big enough (Elco, 12 Nov walk 3 on Ref
        // Finance: "at some magnification show treasury and token price"), where nothing else stands
        if (l.worth) {
          const shown = worthOn ? fade(WORTH_AT, r) * tone : 0;
          const wy = y + LABEL_HEIGHT / 2 + 2 + WORTH_HEIGHT / 2;
          const x0 = Math.max(
            EDGE / 2,
            Math.min(view.width - EDGE / 2 - l.worthWidth, c.x - l.worthWidth / 2),
          );
          const b = {
            x0,
            y0: wy - WORTH_HEIGHT / 2,
            x1: x0 + l.worthWidth,
            y1: wy + WORTH_HEIGHT / 2,
          };
          const inside = x0 >= EDGE / 2 && b.y1 <= view.height;
          if (inside && shown > 0.01 && !placed.some((p) => overlaps(p, b)) && !onAFlower(b, i)) {
            placed.push(b);
            wordsEnd.set(i, b);
            l.worth.show(true);
            l.worth.set('transform', `translate(${n3(b.x0)} ${n3(wy)})`);
            l.worth.set('opacity', o2(shown));
          } else l.worth.show(false);
        }
      }

      // The placeholder: a dashed round place where the new map will stand, its name and 'new' under it
      if (pending) {
        pendingRing.show(true);
        pendingRing.set('cx', n3(pending.x));
        pendingRing.set('cy', n3(pending.y));
        pendingRing.set('r', n3(SHAPE.R * pending.s * 0.8));
        if (pendingLabel?.name !== pending.name) {
          pendingLabel?.label.group.node.remove();
          pendingLabel = {
            name: pending.name,
            label: drawLabel(
              { name: pending.name, mark: { logo: null, symbol: '', types: ['new'] } },
              names,
              clip,
            ),
          };
        }
        const l = pendingLabel.label;
        const c = screenCentre(view, pending);
        const y = c.y + screenRadius(view, pending) * 0.8 + 10 + MARK / 2;
        const x0 = Math.max(EDGE / 2, Math.min(view.width - EDGE / 2 - l.width, c.x - l.width / 2));
        const b = { x0, y0: y - MARK / 2, x1: x0 + l.width, y1: y + MARK / 2 };
        const free = b.y0 >= 0 && b.y1 <= view.height && !placed.some((p) => overlaps(p, b));
        l.group.show(free);
        if (free) {
          placed.push(b);
          l.group.set('transform', `translate(${n3(x0)} ${n3(y)})`);
        }
      } else {
        pendingRing.show(false);
        pendingLabel?.label.group.show(false);
      }
      // The strip of work running: under its flower's name (or the placeholder's), inside the window
      const named = typeof progress?.at === 'number' ? wordsEnd.get(progress.at) : undefined;
      const at =
        progress?.at === 'pending'
          ? pending
            ? { c: screenCentre(view, pending), r: screenRadius(view, pending) * 0.8 }
            : null
          : progress && flowers[progress.at]
            ? {
                c: screenCentre(view, (flowers[progress.at] as LandFlower).place),
                r:
                  screenRadius(view, (flowers[progress.at] as LandFlower).place) *
                  (flowers[progress.at] as LandFlower).reach,
              }
            : null;
      let stripBox: Box | null = null;
      if (progress && at) {
        if (stripWords.textContent !== progress.words) stripWords.textContent = progress.words;
        const pad = 8;
        const w = Math.max(120, textWidth(progress.words) + 2 * pad);
        const h = 30;
        const x0 = Math.max(EDGE / 2, Math.min(view.width - EDGE / 2 - w, at.c.x - w / 2));
        // just under its name (and its treasury line) where they show; else under the flower
        const y0 = Math.max(
          EDGE / 2,
          Math.min(
            view.height - EDGE / 2 - h,
            named ? named.y1 + 8 : at.c.y + at.r + 10 + LABEL_HEIGHT + 6,
          ),
        );
        stripGround.setAttribute('width', String(w));
        stripGround.setAttribute('height', String(h));
        stripWords.setAttribute('x', String(pad));
        stripWords.setAttribute('y', '14');
        stripTrack.setAttribute('x', String(pad));
        stripTrack.setAttribute('y', '21');
        stripTrack.setAttribute('width', String(w - 2 * pad));
        const track = w - 2 * pad;
        stripDone.setAttribute('y', '21');
        if (progress.share === null) {
          stripDone.setAttribute('width', String(track * 0.3));
          stripRun.setAttribute('values', `${pad};${pad + track * 0.7};${pad}`);
        } else {
          stripRun.removeAttribute('values');
          stripDone.setAttribute('x', String(pad));
          stripDone.setAttribute('width', String(track * Math.max(0, Math.min(1, progress.share))));
        }
        strip.show(true);
        strip.set('transform', `translate(${n3(x0)} ${n3(y0)})`);
        stripBox = { x0, y0, x1: x0 + w, y1: y0 + h };
        placed.push(stripBox);
      } else strip.show(false);

      // Connections: each flower's strongest few from the farthest, the rest as they grow; fainter the more
      // there are. The number at the middle once there's room, or at any size once a click marks it.
      const showing: { i: number; o: number }[] = [];
      roads.forEach((r, i) => {
        const s = roadSlots[i] as (typeof roadSlots)[number];
        const a = flowers[r.a]?.place as Place;
        const b = flowers[r.b]?.place as Place;
        let o = 0;
        let pair = 0;
        if (rest > 0.01 && (onScreen(view, a) || onScreen(view, b))) {
          pair = Math.min(screenRadius(view, a), screenRadius(view, b));
          if (only !== -1) o = i === only ? 1 : 0;
          else if (lines === 'focus') {
            // only the pointed flower's (else the one in the middle's), once it's big enough to be told apart, and a
            // marked one
            const by = pointed >= 0 ? pointed : centre;
            const own = by >= 0 && (r.a === by || r.b === by);
            const size = by >= 0 ? screenRadius(view, flowers[by]?.place as Place) : 0;
            o = i === marked ? 1 : own ? fade(DETAIL.lineFocus, size) : 0;
          } else
            o =
              i === marked
                ? 1
                : fade(DETAIL.road, pair) * (r.strong ? 1 : fade(DETAIL.roadMore, pair));
        }
        if (o > 0.01) showing.push({ i, o });
        else {
          s.line.show(false);
          s.number.show(false);
        }
      });
      const crowd = lines === 'focus' ? 1 : crowdFade(showing.length);
      for (const { i, o } of showing) {
        const s = roadSlots[i] as (typeof roadSlots)[number];
        s.line.show(true);
        s.line.set(
          'opacity',
          o2(i === marked ? 0.9 : o * crowd * (lines === 'focus' ? LINE_TONE : ROAD_TONE)),
        );
        // a connection's number only where it's asked for, on the one a click marks (Elco, 12 Nov walk: the numbers
        // were "a little bit mysterious"; "only put them in certain situations")
        const shown = i === marked ? 1 : 0;
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
      // the neighbours' names keep clear of the boxes over the map and of the strip of work
      const taken: Box[] = [...over, ...(stripBox ? [stripBox] : [])];
      arrowSlots.forEach((a, k) => {
        const way = out[k];
        if (!way || !e) {
          a.g.show(false);
          a.at.show(false);
          a.num.show(false);
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
        // The name sits against the edge the arrow meets, inside the window: with its types, else its name alone,
        // else none, never off the window or on another name or box (META's QA, 12 Nov)
        let box = { x0: 0, y0: 0, x1: 0, y1: 0 };
        let named = false;
        for (const [w, on] of [
          [label.width, true],
          [label.short, false],
        ] as const) {
          let x0 = end.x - w / 2;
          let y0 = end.y - MARK / 2;
          if (Math.abs(ux) >= Math.abs(uy)) x0 = ux > 0 ? end.x - w : end.x;
          else y0 = uy > 0 ? end.y - MARK : end.y;
          // clear of the chain list where there's room; the window's edge first
          x0 = Math.min(view.width - EDGE / 2 - w, Math.max(left + EDGE / 2, x0));
          y0 = Math.max(EDGE / 2, Math.min(view.height - EDGE / 2 - MARK, y0));
          box = { x0, y0, x1: x0 + w, y1: y0 + MARK };
          if (x0 >= EDGE / 2 && !taken.some((b) => overlaps(b, box))) {
            named = true;
            label.typed(on);
            break;
          }
        }
        const { x0, y0 } = box;
        const reachEnd = Math.hypot(end.x - c.x, end.y - c.y);
        const stop = named ? (entersBox(c.x, c.y, ux, uy, box) ?? reachEnd) - 8 : reachEnd;
        if (stop <= from + 12) {
          a.g.show(false);
          a.at.show(false);
          a.num.show(false);
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
        const lit = way.to === wayPointed;
        a.g.set('opacity', o2(lit ? enter * ARROW_TONE : 0));
        a.at.set('opacity', o2(enter));
        a.num.show(lit);
        if (lit) {
          a.num.node.textContent = count(way.shared);
          const nx = (x1 + x2) / 2 - uy * 10;
          const ny = (y1 + y2) / 2 + ux * 10 + 4;
          a.num.set('x', n3(nx));
          a.num.set('y', n3(ny));
          a.num.set('opacity', o2(enter));
          // the notes give way to it too
          const half = (a.num.node.textContent.length * 7) / 2 + 2;
          taken.push({ x0: nx - half, y0: ny - 12, x1: nx + half, y1: ny + 3 });
        }
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
      lastTaken = [...placed, ...taken.slice(over.length + (stripBox ? 1 : 0))];
      return hits;
    },
    taken: () => lastTaken,
    move() {
      flowers.forEach((f, i) => {
        const { x, y, s } = f.place;
        flowerSlots[i]?.g.set(
          'transform',
          `translate(${n3(x - s * SHAPE.cx)} ${n3(y - s * SHAPE.cy)}) scale(${n3(s)})`,
        );
      });
      for (const s of roadSlots) {
        s.ends = roadEnds(flowers[s.r.a] as LandFlower, flowers[s.r.b] as LandFlower);
        const [x1, y1, x2, y2] = s.ends;
        s.line.set('x1', n3(x1));
        s.line.set('y1', n3(y1));
        s.line.set('x2', n3(x2));
        s.line.set('y2', n3(y2));
      }
      if (middle && middleRing) {
        middleRing.setAttribute('cx', n3(middle.place.x));
        middleRing.setAttribute('cy', n3(middle.place.y));
      }
    },
    dispose() {
      defs.remove();
      land.remove();
      top.remove();
    },
  };
}
