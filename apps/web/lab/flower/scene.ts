// The drawing: one SVG, built once, then attributes written on it. React doesn't touch it after it
// mounts, so a frame costs what it costs here and nothing else. Colours are token roles; no other
// colour appears on this bench.
import type { View } from './camera.ts';
import type { FakeRelations } from './illustrative.ts';
import { LABEL_POOL, type Marks, NOTE_POOL } from './marks.ts';
import type { Model } from './model.ts';
import { bandPath, n3, polygonPath, type Ring, SHAPE, silhouettePath } from './ring.ts';
import type { Channel } from './spring.ts';
import { LINE, MONO } from './words.ts';

const NS = 'http://www.w3.org/2000/svg';
const INK = 'var(--text-primary)';
const MUTED = 'var(--text-muted)';
const HAIR = 'var(--hairline)';
const GROUND = 'var(--surface)';
const PETAL = 'var(--figure-petal)';
const LIT = 'var(--figure-accent)';

/** Bands go lighter upward, so a cut bar reads at a distance without chart colours. */
const BAND_TONES = [1, 0.74, 0.54, 0.38];
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
  }): void;
  /** Is this screen point on the small map? */
  onMap(x: number, y: number, marks: Marks): boolean;
  dispose(): void;
}

export function createScene(svg: SVGSVGElement, m: Model, relations: FakeRelations | null): Scene {
  const root = el('g', { class: MONO }, svg);
  const world = slot(el('g', {}, root));
  const worldNode = world.node;

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

  const silhouette = slot(el('path', { fill: PETAL }, worldNode));
  const petalsGroup = slot(el('g', { fill: PETAL }, worldNode));
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

  const petals: Slot<SVGPathElement>[] = [];
  for (let i = 0; i < m.n; i++) {
    petals.push(slot(el('path', {}, petalsGroup.node)));
  }
  const bands: (Slot<SVGPathElement>[] | undefined)[] = new Array(m.n);
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
    el('rect', { fill: GROUND, stroke: INK, 'stroke-width': 1 }, panelGroup.node),
  );
  const panelLines = Array.from({ length: 4 }, () =>
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

  // The way back: the flower at rest, small, with this account lit.
  const mapGroup = slot(el('g', { opacity: 0, class: 'cursor-pointer' }, screen));
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
  };

  /** Writes what changed. A pan only changes who's on screen; only a change of shape needs paths. */
  const writePetals = (
    ring: Ring,
    v: View,
    segments: Float64Array,
    reshape: boolean,
    rescale: boolean,
    focusIndex: number,
    recede: number,
  ) => {
    const { k } = v;
    // A bar far off screen isn't written or drawn. Only worth asking once it can be off screen at all.
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
        const nx = (ring.nx[i] as number) * h;
        const ny = (ring.ny[i] as number) * h;
        visible =
          Math.max(ax, bx, ax + nx, bx + nx) > xLo &&
          Math.min(ax, bx, ax + nx, bx + nx) < xHi &&
          Math.max(ay, by, ay + ny, by + ny) > yLo &&
          Math.min(ay, by, ay + ny, by + ny) < yHi;
      }
      const path = petals[i] as Slot<SVGPathElement>;
      const banded = visible && (segments[i] as number) > 0;
      if (!visible || banded) {
        if (shown[i]) {
          shown[i] = 0;
          path.set('display', 'none');
        }
      }
      if (!banded) hideBands(i);
      if (!visible) continue;
      if (banded) {
        const fresh = !bandsOn[i];
        if (fresh || reshape || rescale) {
          writeBands(i, ring, k, segments[i] as number, i === focusIndex ? 1 : recede);
        }
        continue;
      }
      const fresh = !shown[i];
      if (fresh) {
        shown[i] = 1;
        path.set('display', 'inline');
      }
      if (fresh || reshape) path.node.setAttribute('d', bandPath(ring, i, 0, h));
      const own = m.petals[i]?.tail ? TAIL_TONE : 1;
      path.set('fill-opacity', o2(own * (i === focusIndex ? 1 : recede)));
    }
  };

  const writeBands = (i: number, ring: Ring, k: number, fade: number, strength: number) => {
    const segs = m.petals[i]?.segments ?? [];
    let list = bands[i];
    if (!list) {
      list = segs.map(() => slot(el('path', {}, petalsGroup.node)));
      bands[i] = list;
      const lit = litSteps[i] as number;
      if (lit) for (const b of list) b.set('fill', accentFill(lit));
    }
    if (!bandsOn[i]) {
      bandsOn[i] = 1;
      for (const b of list) b.set('display', 'inline');
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
      path.node.setAttribute('d', bandPath(ring, i, h0, Math.max(h0, h1)));
      const tone = BAND_TONES[Math.min(j, BAND_TONES.length - 1)] as number;
      path.set('fill-opacity', o2((1 + (tone - 1) * fade) * strength));
    });
  };

  const accentFill = (step: number) =>
    step >= ACCENT_STEPS
      ? LIT
      : `color-mix(in srgb, ${LIT} ${Math.round((100 * step) / ACCENT_STEPS)}%, ${PETAL})`;

  const writeAccent = (accent: Channel) => {
    const { x } = accent;
    for (let i = 0; i < m.n; i++) {
      const step = Math.round((x[i] as number) * ACCENT_STEPS);
      if (step === litSteps[i]) continue;
      litSteps[i] = step;
      const path = petals[i] as Slot<SVGPathElement>;
      path.set('fill', step === 0 ? PETAL : accentFill(step));
      for (const b of bands[i] ?? []) b.set('fill', step === 0 ? PETAL : accentFill(step));
    }
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
    draw({ marks: mk, ring, view, accent, ringMoved, accentMoved, focusIndex }) {
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
        silhouette.node.setAttribute('d', silhouettePath(ring));
      }
      silhouetteOn = showSilhouette;

      const reshape = ringMoved || !petalsOn;
      if (showPetals && (reshape || rescale || panned || lastLit !== focusIndex)) {
        writePetals(ring, view, mk.segments, reshape, rescale, focusIndex, mk.recede);
      }
      petalsOn = showPetals;
      if (ringMoved) polygon.node.setAttribute('d', polygonPath(ring));
      polygon.set('stroke-opacity', o2(mk.polygon));
      if (accentMoved || lastLit !== focusIndex) writeAccent(accent);
      lastLit = focusIndex;
      if (relationsLayer) writeRelations(ring, focusIndex, mk.relations * mk.recede);

      // Notes keep their slot while they're on, so a text is only ever written when one appears.
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
          s.text.text(note.text);
          s.group.set('display', 'inline');
        }
        const s = noteSlots[at] as NoteSlot;
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
