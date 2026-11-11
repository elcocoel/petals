// The drawing: one SVG, built once, then attributes written on it. React doesn't touch it after it
// mounts, so a frame costs what it costs here and nothing else. Colours are token roles; no other
// colour appears on this flower.

import { type Fold, foldPath } from '@petal/core/wedge/fold';
import {
  bandCorners,
  HIGHLIGHT,
  insetBy,
  REFERENCE,
  roundedPath,
  tonesOf,
} from '@petal/core/wedge/highlight';
import { paintOf } from '@petal/core/wedge/paint';
import type { View } from './camera.ts';
import { GUTTER } from './feel.ts';
import { LABEL_POOL, type Marks, NOTE_POOL } from './marks.ts';
import type { Model } from './model.ts';
import {
  bandPath,
  leftAt,
  n3,
  polygonPath,
  type Ring,
  rightAt,
  SHAPE,
  silhouettePath,
} from './ring.ts';
import type { Channel } from './spring.ts';
import { LINE, MONO } from './words.ts';

/**
 * The art direction's look (#76; design/flower-art-direction/default-system-vnext.md, V1, 11 Nov): each petal's
 * colour and each band's, and the petals the highlight is on (core's wedge/keys.ts and wedge/highlight.ts).
 * Only the lab hands the scene one, until Elco has seen it; without one the flower draws as it always has.
 */
export interface PetalLook {
  /** each petal's fill, by its id; a petal not here draws in the plain petal tone */
  fills: Record<string, string>;
  /** each band's fill, by the band's key; with any, every petal's bands show at rest */
  bands: Record<string, string>;
  /** the petals the highlight is on, by id */
  highlight: readonly string[];
  /**
   * "Everyone else", folded (core's wedge/fold.ts), by its id: its members packed as small cells in a few columns,
   * each as tall as that member's own petal would be.
   */
  folds?: Record<string, Fold>;
}

/** Each scene's filters get their own names, so two flowers on one page never share one. */
let scenes = 0;

/** Lines to judge a feel, with no data behind them. Only the lab's bench hands the scene any. */
export interface FakeRelations {
  /** Pairs of petal indices, the same seed the same pairs. */
  pairs: [number, number][];
  /** The dotted ring's radius, as a share of R. */
  ring: number;
}

/** The most bands a note lists. The reading's kinds of backer are four. */
const NOTE_BANDS = 6;

const NS = 'http://www.w3.org/2000/svg';
const INK = 'var(--text-primary)';
const MUTED = 'var(--text-muted)';
const HAIR = 'var(--hairline)';
const GROUND = 'var(--surface)';
const PETAL = 'var(--figure-petal)';
const LIT = 'var(--figure-accent)';

/** The band under the pointer is at full strength, the others at this, so note and petal agree. */
const BAND_QUIET = 0.55;
/** "Everyone else" isn't a petal like the others: it's many of them, so it's lighter. */
const TAIL_TONE = 0.55;
/** The widest cut between bands, in px on screen. */
const CUT = 1.5;
/** The accent is written in this many steps, so a fade doesn't rewrite a fill it hasn't changed. */
const ACCENT_STEPS = 24;

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

/** Writes an attribute only when it changed. Most of a frame's attributes don't. */
class Slot<E extends SVGElement> {
  node: E;
  private last = new Map<string, string>();
  private words: string | null = null;
  constructor(node: E) {
    this.node = node;
  }
  set(name: string, value: string | number): void {
    const s = String(value);
    if (this.last.get(name) === s) return;
    this.last.set(name, s);
    this.node.setAttribute(name, s);
  }
  text(s: string): void {
    if (this.words === s) return;
    this.words = s;
    this.node.textContent = s;
  }
}

const slot = <E extends SVGElement>(node: E) => new Slot(node);
const o2 = (x: number) => Math.round(x * 100) / 100;

interface NoteSlot {
  group: Slot<SVGGElement>;
  leader: Slot<SVGPathElement>;
  dot: Slot<SVGCircleElement>;
  text: Slot<SVGTextElement>;
  owner: number;
}

export interface Scene {
  draw(input: {
    marks: Marks;
    ring: Ring;
    view: View;
    accent: Channel;
    ringMoved: boolean;
    accentMoved: boolean;
    focusIndex: number;
    /** The petal to draw above the others, so its tip isn't under its neighbours. */
    raised: number;
    bandsMoved: boolean;
    band: number;
  }): void;
  /** Is this screen point on the small map? */
  onMap(x: number, y: number, marks: Marks): boolean;
  /** The drawing's own group in the SVG, so a space of many flowers can set what's on top of what. */
  root: SVGGElement;
  dispose(): void;
}

export function createScene(
  svg: SVGSVGElement,
  m: Model,
  relations: FakeRelations | null,
  look: PetalLook | null = null,
): Scene {
  // Nothing in the drawing hit-tests: the pointer is read geometrically, against the rest flower.
  const root = el('g', { class: MONO, 'pointer-events': 'none' }, svg);
  const world = slot(el('g', {}, root));
  const worldNode = world.node;

  // figure.relations-sketch
  const relationsLayer = relations
    ? {
        all: slot(
          el(
            'path',
            {
              fill: 'none',
              stroke: HAIR,
              'stroke-width': 1,
              'vector-effect': 'non-scaling-stroke',
            },
            worldNode,
          ),
        ),
        lit: slot(
          el(
            'path',
            {
              fill: 'none',
              stroke: INK,
              'stroke-width': 1,
              'vector-effect': 'non-scaling-stroke',
            },
            worldNode,
          ),
        ),
        ring: slot(
          el(
            'circle',
            {
              fill: 'none',
              stroke: INK,
              'stroke-width': 1,
              'stroke-dasharray': '1 5',
              'vector-effect': 'non-scaling-stroke',
              cx: SHAPE.cx,
              cy: SHAPE.cy,
              r: SHAPE.R * relations.ring,
            },
            worldNode,
          ),
        ),
      }
    : null;

  // One path, or with the lab's look one path per colour.
  // figure.flower-silhouette
  const silhouette = slot(el('path', { fill: look ? 'none' : PETAL }, worldNode));
  // figure.petal-wedge
  const petalsGroup = slot(el('g', { fill: PETAL }, worldNode));
  // figure.flower-ring
  const polygon = slot(
    el(
      'path',
      {
        fill: 'none',
        stroke: INK,
        'stroke-width': 1,
        'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
      },
      worldNode,
    ),
  );

  // figure.petal-wedge: each petal in its own colour from the reading, as the still picture paints it; with
  // the lab's look, in its key's colour.
  const paints = m.petals.map((p) => (look ? (look.fills[p.id] ?? PETAL) : paintOf(p)));
  const bandPaint = (key: string): string => look?.bands[key] ?? PETAL;
  /** With the lab's look, a petal with bands shows them at rest. */
  const restBands = Uint8Array.from(m.petals, (p) =>
    look && Object.keys(look.bands).length > 0 && p.segments.length > 0 ? 1 : 0,
  );
  const lit = new Set(look?.highlight ?? []);
  /** Each petal's folded members, or undefined. */
  const folds = m.petals.map((p) => look?.folds?.[p.id]);
  /** A petal's shape at rest: its wedge, or folded, the rest of the curve. */
  const shapeOf = (ring: Ring, i: number, h: number): string => {
    const fold = folds[i];
    return fold && fold.columns.length > 0 ? foldPath(ring, i, fold) : bandPath(ring, i, 0, h);
  };
  /** figure.petal-highlight: on or off, per petal. */
  const high = Uint8Array.from(m.petals, (p) => (lit.has(p.id) ? 1 : 0));
  const defs = el('defs', {}, root);
  const sceneId = ++scenes;
  const filters = new Map<string, string>();
  /** The highlight's surface for a fill: light from the upper left, shade from the lower right, inside. */
  const filterFor = (fill: string): string => {
    const had = filters.get(fill);
    if (had) return had;
    const id = `petal-surface-${sceneId}-${filters.size}`;
    const t = tonesOf(fill);
    const f = el(
      'filter',
      {
        id,
        x: '-10%',
        y: '-10%',
        width: '120%',
        height: '120%',
        'color-interpolation-filters': 'sRGB',
      },
      defs,
    );
    const inner = (
      name: string,
      colour: string,
      e: { dx: number; dy: number; blur: number; opacity: number },
    ) => {
      // an inner shadow: what the shape, moved and blurred, leaves uncovered of itself
      el(
        'feOffset',
        {
          in: 'SourceAlpha',
          dx: n3(e.dx / REFERENCE),
          dy: n3(e.dy / REFERENCE),
          result: `${name}-o`,
        },
        f,
      );
      el(
        'feGaussianBlur',
        { in: `${name}-o`, stdDeviation: n3(e.blur / 2 / REFERENCE), result: `${name}-b` },
        f,
      );
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
      el('feFlood', { 'flood-color': colour, 'flood-opacity': e.opacity, result: `${name}-c` }, f);
      el('feComposite', { in: `${name}-c`, in2: `${name}-e`, operator: 'in', result: name }, f);
    };
    inner('light', t.light, HIGHLIGHT.light);
    inner('shade', t.shade, HIGHLIGHT.shade);
    const merge = el('feMerge', {}, f);
    for (const name of ['SourceGraphic', 'light', 'shade']) el('feMergeNode', { in: name }, merge);
    filters.set(fill, id);
    return id;
  };
  const petals: Slot<SVGPathElement>[] = [];
  const strokes: (Slot<SVGPathElement> | undefined)[] = new Array(m.n);
  const strokeFor = (fill: string, parent: Element) =>
    slot(
      el(
        'path',
        { fill: 'none', stroke: tonesOf(fill).stroke, 'stroke-linejoin': 'round' },
        parent,
      ),
    );
  for (let i = 0; i < m.n; i++) {
    const fill = paints[i] as string;
    const surface: Attrs =
      high[i] && fill.startsWith('#') ? { filter: `url(#${filterFor(fill)})` } : {};
    petals.push(slot(el('path', { fill, ...surface }, petalsGroup.node)));
    if (high[i] && fill.startsWith('#')) strokes[i] = strokeFor(fill, petalsGroup.node);
  }
  // with the look, one path per colour for the silhouette
  const silhouetteRuns = look
    ? [...new Set([...paints, ...Object.values(look.bands)])].map((fill) => ({
        fill,
        path: slot(el('path', { fill }, silhouette.node.parentNode as Element)),
      }))
    : [];
  for (const run of silhouetteRuns) worldNode.insertBefore(run.path.node, petalsGroup.node);
  // Under the raised petal: the ground, a line wider than it, so where its tip lies over a neighbour
  // it's as solid as anywhere and the same line runs round it.
  const backing = slot(
    el(
      'path',
      {
        fill: GROUND,
        stroke: GROUND,
        'stroke-width': GUTTER * 2,
        'stroke-linejoin': 'miter',
        'fill-opacity': 1,
      },
      petalsGroup.node,
    ),
  );
  // figure.petal-bands
  const bands: (Slot<SVGPathElement>[] | undefined)[] = new Array(m.n);
  const bandStrokes: (Slot<SVGPathElement> | undefined)[][] = new Array(m.n);
  /** What a band is painted with at rest: its key's colour with the lab's look, else the petal tone. */
  const bandBase = (i: number, j: number): string =>
    look ? bandPaint(m.petals[i]?.segments[j]?.key ?? '') : PETAL;
  const shown = new Uint8Array(m.n).fill(1);
  const bandsOn = new Uint8Array(m.n);
  const litSteps = new Int16Array(m.n);

  const screen = el('g', {}, root);
  const labelLayer = el('g', { fill: INK, 'text-anchor': 'middle' }, screen);
  const labelSlots = Array.from({ length: LABEL_POOL }, () =>
    slot(el('text', { opacity: 0, y: 3.5, 'text-rendering': 'geometricPrecision' }, labelLayer)),
  );

  const makeNote = (parent: Element): NoteSlot => {
    const group = slot(el('g', { opacity: 0 }, parent));
    const leader = slot(el('path', { fill: 'none', stroke: HAIR, 'stroke-width': 1 }, group.node));
    const dot = slot(
      el('circle', { r: 2.5, fill: GROUND, stroke: INK, 'stroke-width': 1 }, group.node),
    );
    const text = slot(
      el('text', { fill: INK, 'text-rendering': 'geometricPrecision' }, group.node),
    );
    return { group, leader, dot, text, owner: -1 };
  };
  const noteLayer = el('g', {}, screen);
  const noteSlots = Array.from({ length: NOTE_POOL }, () => makeNote(noteLayer));
  const slotOf = new Int16Array(m.n).fill(-1);

  const titleInside = slot(el('text', { fill: INK, 'text-anchor': 'middle', opacity: 0 }, screen));
  titleInside.text(m.title);
  const titleOutside = slot(el('text', { fill: INK, 'text-anchor': 'middle', opacity: 0 }, screen));
  titleOutside.text(m.title);

  // The panel draws over the notes and the bands, under its own note.
  const panelGroup = slot(el('g', { opacity: 0 }, screen));
  const panelBox = slot(
    el('rect', { fill: GROUND, stroke: HAIR, 'stroke-width': 1 }, panelGroup.node),
  );
  const panelLines = Array.from({ length: 8 }, () =>
    slot(el('text', { 'text-rendering': 'geometricPrecision' }, panelGroup.node)),
  );

  // The note that travels, on top of everything.
  const focusGroup = slot(el('g', { opacity: 0 }, screen));
  const focusLeader = slot(
    el('path', { fill: 'none', stroke: INK, 'stroke-width': 1 }, focusGroup.node),
  );
  const focusDot = slot(
    el('circle', { r: 3, fill: GROUND, stroke: INK, 'stroke-width': 1 }, focusGroup.node),
  );
  const focusText = slot(
    el('text', { fill: INK, 'text-rendering': 'geometricPrecision' }, focusGroup.node),
  );
  const focusSub = slot(
    el('text', { fill: MUTED, 'text-rendering': 'geometricPrecision' }, focusGroup.node),
  );

  const focusBands = Array.from({ length: NOTE_BANDS }, () =>
    slot(el('text', { 'text-rendering': 'geometricPrecision' }, focusGroup.node)),
  );

  // The way back: the flower at rest, small, with this account lit.
  const mapGroup = slot(el('g', { opacity: 0 }, screen));
  const mapScale = 1 / (SHAPE.R * 2);
  const mapInner = el('g', {}, mapGroup.node);
  el('path', { fill: PETAL, d: silhouettePath(m.ring) }, mapInner);
  el(
    'path',
    {
      fill: 'none',
      stroke: INK,
      'stroke-width': 1,
      'vector-effect': 'non-scaling-stroke',
      d: polygonPath(m.ring),
    },
    mapInner,
  );
  const mapLit = slot(el('path', { fill: LIT, stroke: LIT }, mapInner));
  const mapBase = {
    tx: (size: number) => size / 2 - SHAPE.cx * size * mapScale,
    ty: (size: number) => size / 2 - SHAPE.cy * size * mapScale,
  };

  const readout = slot(el('text', { fill: MUTED, 'text-anchor': 'end' }, screen));

  let lastLit = -2;
  let lastRaised = -1;
  let lastK = 0;
  let lastX = 0;
  let lastY = 0;
  let lastRecede = 1;
  let petalsOn = false;
  let silhouetteOn = false;

  const hideBands = (i: number) => {
    if (!bandsOn[i]) return;
    bandsOn[i] = 0;
    for (const b of bands[i] ?? []) b.set('display', 'none');
    for (const st of bandStrokes[i] ?? []) st?.set('display', 'none');
  };

  const seenStart = new Float64Array(m.n).fill(Number.NaN);
  const seenEnd = new Float64Array(m.n);
  const seenH = new Float64Array(m.n);
  const seenFlare = new Float64Array(m.n);

  /** Has this wedge changed since it was last looked at? Calm hover only moves a few of them. */
  const changed = (ring: Ring, i: number): boolean => {
    const a0 = (ring.start[i] as number) + ring.rotation;
    const a1 = (ring.start[i + 1] as number) + ring.rotation;
    const h = ring.h[i] as number;
    const f = ring.flare[i] as number;
    if (a0 === seenStart[i] && a1 === seenEnd[i] && h === seenH[i] && f === seenFlare[i]) {
      return false;
    }
    seenStart[i] = a0;
    seenEnd[i] = a1;
    seenH[i] = h;
    seenFlare[i] = f;
    return true;
  };

  /** Writes what changed. A pan only changes who's on screen; only a change of shape needs paths. */
  const writePetals = (
    ring: Ring,
    v: View,
    segments: Float64Array,
    reshape: boolean,
    focusIndex: number,
    recede: number,
    band: number,
    rescaled: boolean,
  ) => {
    const { k } = v;
    // A wedge far off screen isn't written or drawn. Only worth asking once it can be off screen.
    const cull = m.R * k > Math.min(v.width, v.height) * 0.45;
    const lo = -40 / k;
    const xHi = (v.width + 40 - v.x) / k - ring.ox;
    const yHi = (v.height + 40 - v.y) / k - ring.oy;
    const xLo = lo - v.x / k - ring.ox;
    const yLo = lo - v.y / k - ring.oy;
    for (let i = 0; i < m.n; i++) {
      const h = ring.h[i] as number;
      let visible = true;
      if (cull) {
        const ax = ring.ax[i] as number;
        const ay = ring.ay[i] as number;
        const bx = ring.bx[i] as number;
        const by = ring.by[i] as number;
        const [tx0, ty0] = leftAt(ring, i, h);
        const [tx1, ty1] = rightAt(ring, i, h);
        visible =
          Math.max(ax, bx, tx0, tx1) > xLo &&
          Math.min(ax, bx, tx0, tx1) < xHi &&
          Math.max(ay, by, ty0, ty1) > yLo &&
          Math.min(ay, by, ty0, ty1) < yHi;
      }
      const path = petals[i] as Slot<SVGPathElement>;
      const banded = visible && ((segments[i] as number) > 0 || restBands[i] === 1);
      if (!visible || banded) {
        if (shown[i]) {
          shown[i] = 0;
          path.set('display', 'none');
          strokes[i]?.set('display', 'none');
        }
      }
      if (!banded) hideBands(i);
      if (!visible) continue;
      const moved = reshape && changed(ring, i);
      if (banded) {
        writeBands(
          i,
          ring,
          k,
          segments[i] as number,
          i === focusIndex ? 1 : recede,
          i === focusIndex ? band : -1,
          moved || rescaled || !bandsOn[i],
        );
        continue;
      }
      const fresh = !shown[i];
      if (fresh) {
        shown[i] = 1;
        path.set('display', 'inline');
        strokes[i]?.set('display', 'inline');
      }
      // folded, its shape already says it's many; the lighter tone is for the plain tail
      const strength =
        (m.petals[i]?.tail && !folds[i] ? TAIL_TONE : 1) * (i === focusIndex ? 1 : recede);
      if (high[i]) {
        if (fresh || moved || rescaled) {
          drawHigh(path, strokes[i], ring, i, 0, h, k);
        }
      } else if (fresh || moved) path.node.setAttribute('d', shapeOf(ring, i, h));
      path.set('fill-opacity', o2(strength));
      strokes[i]?.set('stroke-opacity', o2(strength));
    }
  };

  /**
   * A highlighted stretch of a wedge: its fill with softened corners, and the fine stroke just inside it. The
   * stroke is the reference's 1 px wherever the flower is drawn at least that big, and never thicker than one
   * px on screen, so a close look doesn't turn it into a contour; too thin a stretch to hold it has none.
   */
  const drawHigh = (
    fill: Slot<SVGPathElement>,
    stroke: Slot<SVGPathElement> | undefined,
    ring: Ring,
    i: number,
    hA: number,
    hB: number,
    k: number,
  ) => {
    const corners = bandCorners(ring, i, hA, hB);
    const r = HIGHLIGHT.radius / REFERENCE;
    fill.node.setAttribute('d', roundedPath(corners, r));
    if (!stroke) return;
    const w = Math.min(HIGHLIGHT.stroke.width / REFERENCE, 1 / k);
    const inner = insetBy(corners, w / 2);
    if (!inner) {
      stroke.set('display', 'none');
      return;
    }
    stroke.set('display', 'inline');
    stroke.set('stroke-width', n3(w));
    stroke.node.setAttribute('d', roundedPath(inner, Math.max(0, r - w / 2)));
  };

  const writeBands = (
    i: number,
    ring: Ring,
    k: number,
    fade: number,
    strength: number,
    band: number,
    reshape: boolean,
  ) => {
    const segs = m.petals[i]?.segments ?? [];
    let list = bands[i];
    if (!list) {
      list = segs.map((seg) => {
        const fill = bandPaint(seg.key);
        const surface: Attrs =
          high[i] && fill.startsWith('#') ? { filter: `url(#${filterFor(fill)})` } : {};
        return slot(el('path', look ? { fill, ...surface } : {}, petalsGroup.node));
      });
      bands[i] = list;
      bandStrokes[i] = high[i]
        ? segs.map((seg) => {
            const fill = bandPaint(seg.key);
            return fill.startsWith('#') ? strokeFor(fill, petalsGroup.node) : undefined;
          })
        : [];
      // each band's stroke over its own fill
      list.forEach((b, j) => {
        const st = bandStrokes[i]?.[j];
        if (st) b.node.after(st.node);
      });
      const lit = litSteps[i] as number;
      if (lit) {
        list.forEach((b, j) => {
          b.set('fill', accentFill(lit, bandBase(i, j)));
        });
      }
    }
    if (!bandsOn[i]) {
      bandsOn[i] = 1;
      for (const b of list) b.set('display', 'inline');
      for (const st of bandStrokes[i] ?? []) st?.set('display', 'inline');
    }
    const h = ring.h[i] as number;
    const cut = (CUT * fade) / k;
    const last = segs.length - 1;
    let done = 0;
    segs.forEach((seg, j) => {
      const h0 = h * done + (j > 0 ? cut / 2 : 0);
      done += seg.frac;
      const h1 = (j === last ? h : h * done) - (j < last ? cut / 2 : 0);
      const path = (list as Slot<SVGPathElement>[])[j] as Slot<SVGPathElement>;
      const stroke = bandStrokes[i]?.[j];
      if (high[i]) {
        if (reshape || fade > 0) drawHigh(path, stroke, ring, i, h0, Math.max(h0, h1), k);
      } else path.set('d', bandPath(ring, i, h0, Math.max(h0, h1)));
      const tone = band < 0 || j === band ? 1 : BAND_QUIET;
      const opacity = o2((1 + (tone - 1) * fade) * strength);
      path.set('fill-opacity', opacity);
      stroke?.set('stroke-opacity', opacity);
    });
  };

  /** The accent, mixed into what the petal is painted with at rest. */
  const accentFill = (step: number, from: string) =>
    step >= ACCENT_STEPS
      ? LIT
      : `color-mix(in srgb, ${LIT} ${Math.round((100 * step) / ACCENT_STEPS)}%, ${from})`;

  const writeAccent = (accent: Channel) => {
    const { x } = accent;
    for (let i = 0; i < m.n; i++) {
      const step = Math.round((x[i] as number) * ACCENT_STEPS);
      if (step === litSteps[i]) continue;
      litSteps[i] = step;
      const path = petals[i] as Slot<SVGPathElement>;
      const own = paints[i] as string;
      path.set('fill', step === 0 ? own : accentFill(step, own));
      (bands[i] ?? []).forEach((b, j) => {
        const base = bandBase(i, j);
        b.set('fill', step === 0 ? base : accentFill(step, base));
      });
    }
  };

  /** The silhouette with the lab's look: each colour's stretches of wedge, one path per colour. */
  const writeRuns = (ring: Ring) => {
    const ds = new Map<string, string>();
    const add = (fill: string, d: string) => ds.set(fill, (ds.get(fill) ?? '') + d);
    for (let i = 0; i < m.n; i++) {
      const h = ring.h[i] as number;
      const segs = m.petals[i]?.segments ?? [];
      if (restBands[i] && segs.length > 0) {
        let done = 0;
        segs.forEach((seg, j) => {
          const h0 = h * done;
          done += seg.frac;
          add(bandPaint(seg.key), bandPath(ring, i, h0, j === segs.length - 1 ? h : h * done));
        });
      } else add(paints[i] as string, shapeOf(ring, i, h));
    }
    for (const run of silhouetteRuns) run.path.node.setAttribute('d', ds.get(run.fill) ?? '');
  };

  const writeRelations = (ring: Ring, focusIndex: number, opacity: number) => {
    if (!relationsLayer || !relations) return;
    const { cx, cy } = SHAPE;
    let all = '';
    let lit = '';
    const footX = (i: number) => ((ring.ax[i] as number) + (ring.bx[i] as number)) / 2;
    const footY = (i: number) => ((ring.ay[i] as number) + (ring.by[i] as number)) / 2;
    for (const [a, b] of relations.pairs) {
      const ax = footX(a);
      const ay = footY(a);
      const bx = footX(b);
      const by = footY(b);
      const mx = cx + ((ax + bx) / 2 - cx) * 0.45;
      const my = cy + ((ay + by) / 2 - cy) * 0.45;
      const d = `M${n3(ax)} ${n3(ay)}Q${n3(mx)} ${n3(my)} ${n3(bx)} ${n3(by)}`;
      if (a === focusIndex || b === focusIndex) lit += d;
      else all += d;
    }
    relationsLayer.all.node.setAttribute('d', all);
    relationsLayer.lit.node.setAttribute('d', lit);
    relationsLayer.all.set('opacity', o2(opacity));
    relationsLayer.lit.set('opacity', o2(opacity));
    relationsLayer.ring.set('opacity', o2(opacity));
  };

  return {
    root,
    draw({
      marks: mk,
      ring,
      view,
      accent,
      ringMoved,
      accentMoved,
      focusIndex,
      raised,
      bandsMoved,
      band,
    }) {
      const { k } = view;
      const rescale = k !== lastK || mk.recede !== lastRecede;
      const panned = view.x !== lastX || view.y !== lastY;
      lastK = k;
      lastX = view.x;
      lastY = view.y;
      lastRecede = mk.recede;
      world.set(
        'transform',
        `translate(${n3(ring.ox * k + view.x)} ${n3(ring.oy * k + view.y)}) scale(${k})`,
      );

      const showPetals = mk.petals > 0;
      petalsGroup.set('display', showPetals ? 'inline' : 'none');
      const showSilhouette = mk.silhouette > 0;
      silhouette.set('display', showSilhouette ? 'inline' : 'none');
      if (showSilhouette && (ringMoved || !silhouetteOn)) {
        if (look) writeRuns(ring);
        else silhouette.node.setAttribute('d', silhouettePath(ring));
      }
      for (const run of silhouetteRuns) run.path.set('display', showSilhouette ? 'inline' : 'none');
      silhouetteOn = showSilhouette;

      const reshape = ringMoved || !petalsOn;
      if (raised !== lastRaised) {
        lastRaised = raised;
        if (raised >= 0) {
          petalsGroup.node.appendChild(backing.node);
          petalsGroup.node.appendChild((petals[raised] as Slot<SVGPathElement>).node);
          const st = strokes[raised];
          if (st) petalsGroup.node.appendChild(st.node);
          (bands[raised] ?? []).forEach((b, j) => {
            petalsGroup.node.appendChild(b.node);
            const bs = bandStrokes[raised]?.[j];
            if (bs) petalsGroup.node.appendChild(bs.node);
          });
        }
      }
      backing.set('display', raised >= 0 && mk.petals > 0 ? 'inline' : 'none');
      if (raised >= 0) backing.set('d', bandPath(ring, raised, 0, ring.h[raised] as number));
      if (showPetals && (reshape || rescale || panned || bandsMoved || lastLit !== focusIndex)) {
        writePetals(ring, view, mk.segments, reshape, focusIndex, mk.recede, band, rescale);
      }
      petalsOn = showPetals;
      if (ringMoved) polygon.node.setAttribute('d', polygonPath(ring));
      polygon.set('stroke-opacity', o2(mk.polygon));
      if (accentMoved || lastLit !== focusIndex) writeAccent(accent);
      lastLit = focusIndex;
      if (relationsLayer) writeRelations(ring, focusIndex, mk.relations * mk.recede);

      // Notes keep their slot while they're on, so a text is only written when it changes.
      const seen = new Set<number>();
      for (const note of mk.notes) seen.add(note.index);
      for (const s of noteSlots) {
        if (s.owner >= 0 && !seen.has(s.owner)) {
          slotOf[s.owner] = -1;
          s.owner = -1;
          s.group.set('opacity', 0);
          s.group.set('display', 'none');
        }
      }
      for (const note of mk.notes) {
        let at = slotOf[note.index] as number;
        if (at < 0) {
          at = noteSlots.findIndex((s) => s.owner < 0);
          if (at < 0) continue;
          slotOf[note.index] = at;
          const s = noteSlots[at] as NoteSlot;
          s.owner = note.index;
          s.group.set('display', 'inline');
        }
        const s = noteSlots[at] as NoteSlot;
        // A petal just chosen keeps its slot and says its name in full. Unchanged text writes nothing.
        s.text.text(note.text);
        s.group.set('opacity', o2(note.opacity));
        s.leader.set(
          'd',
          `M${n3(note.dotX)} ${n3(note.dotY)}L${n3(note.elbowX)} ${n3(note.elbowY)}L${n3(note.ruleX)} ${n3(note.elbowY)}`,
        );
        s.dot.set('cx', n3(note.dotX));
        s.dot.set('cy', n3(note.dotY));
        s.text.set('transform', `translate(${n3(note.x)} ${n3(note.y)})`);
      }

      labelSlots.forEach((s, i) => {
        const label = mk.labels[i];
        if (!label) {
          s.set('display', 'none');
          return;
        }
        s.set('display', 'inline');
        s.text(label.text);
        s.set('opacity', o2(label.opacity));
        s.set('transform', `translate(${n3(label.x)} ${n3(label.y)}) rotate(${o2(label.rotate)})`);
      });

      titleInside.set('opacity', o2(mk.titleInside.opacity));
      titleInside.set('transform', `translate(${n3(mk.titleInside.x)} ${n3(mk.titleInside.y)})`);
      titleOutside.set('opacity', o2(mk.titleOutside.opacity));
      titleOutside.set('transform', `translate(${n3(mk.titleOutside.x)} ${n3(mk.titleOutside.y)})`);

      if (mk.panel) {
        const p = mk.panel;
        panelGroup.set('display', 'inline');
        panelGroup.set('opacity', o2(p.opacity));
        panelBox.set('x', n3(p.x));
        panelBox.set('y', n3(p.y));
        panelBox.set('width', n3(p.width));
        panelBox.set('height', n3(p.height));
        panelLines.forEach((s, i) => {
          const line = p.lines[i];
          if (!line) {
            s.set('display', 'none');
            return;
          }
          s.set('display', 'inline');
          s.text(line.text);
          s.set('fill', line.muted ? MUTED : INK);
          s.set('opacity', o2(line.opacity));
          s.set('transform', `translate(${n3(line.x)} ${n3(line.y)})`);
        });
      } else panelGroup.set('display', 'none');

      const f = mk.focus;
      if (f) {
        focusGroup.set('display', 'inline');
        focusGroup.set('opacity', o2(f.opacity));
        focusText.text(f.text);
        focusText.set('transform', `translate(${n3(f.x)} ${n3(f.y)}) scale(${o2(f.scale)})`);
        focusSub.text(f.sub);
        focusSub.set('opacity', o2(f.subOpacity));
        focusSub.set('transform', `translate(${n3(f.x)} ${n3(f.y + 4 + LINE)})`);
        focusBands.forEach((s, i) => {
          const line = f.bands[i];
          if (!line || line.opacity <= 0.005) {
            s.set('display', 'none');
            return;
          }
          s.set('display', 'inline');
          s.text(line.text);
          s.set('opacity', o2(line.opacity));
          s.set('fill', line.strong ? INK : MUTED);
          s.set('transform', `translate(${n3(f.x)} ${n3(f.y + 4 + LINE * (i + 2))})`);
        });
        const rule = f.elbowX + (f.ruleX - f.elbowX) * f.rule;
        focusLeader.set(
          'd',
          `M${n3(f.dotX)} ${n3(f.dotY)}L${n3(f.elbowX)} ${n3(f.elbowY)}L${n3(rule)} ${n3(f.elbowY)}`,
        );
        focusDot.set('cx', n3(f.dotX));
        focusDot.set('cy', n3(f.dotY));
      } else focusGroup.set('display', 'none');

      const map = mk.map;
      if (map.opacity > 0) {
        mapGroup.set('display', 'inline');
        mapGroup.set('opacity', o2(map.opacity));
        const scale = map.size * mapScale;
        mapGroup.set(
          'transform',
          `translate(${n3(map.x + mapBase.tx(map.size))} ${n3(map.y + mapBase.ty(map.size))}) scale(${n3(scale)})`,
        );
        mapLit.set('display', map.litIndex >= 0 ? 'inline' : 'none');
        if (map.litIndex >= 0) {
          mapLit.set('d', bandPath(m.ring, map.litIndex, 0, m.height[map.litIndex] as number));
          mapLit.set('stroke-width', n3(1 / scale));
        }
      } else mapGroup.set('display', 'none');

      if (mk.readout) {
        readout.text(mk.readout.text);
        readout.set('transform', `translate(${n3(mk.readout.x)} ${n3(mk.readout.y)})`);
      }
    },
    onMap(x, y, mk) {
      const map = mk.map;
      return (
        map.opacity > 0.2 &&
        x >= map.x &&
        x <= map.x + map.size &&
        y >= map.y &&
        y <= map.y + map.size
      );
    },
    dispose() {
      root.remove();
    },
  };
}
