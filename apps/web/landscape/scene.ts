// The map's drawing (specs/006-the-map): one SVG, built once, then attributes written on it. Far away each
// flower is its own silhouette at rest, the shape flower/scene.ts draws for it at that size, with its
// polygon line and its name under it by the same rows of detail.ts; roads run underneath. A flower that's
// live is drawn by its own scene (flower/drive.ts) on top, and its silhouette here hides. Colours are
// token roles, as on the flower.
import { DETAIL, fade } from '../flower/detail.ts';
import type { Model } from '../flower/model.ts';
import { n3, polygonPath, SHAPE, silhouettePath } from '../flower/ring.ts';
import { LINE, MONO, textWidth } from '../flower/words.ts';
import type { Continent, Place } from './places.ts';
import { crowdFade, type Road, roadWidth } from './roads.ts';
import { onScreen, screenCentre, screenRadius } from './space.ts';

const NS = 'http://www.w3.org/2000/svg';
const INK = 'var(--text-primary)';
const MUTED = 'var(--text-muted)';
const PETAL = 'var(--figure-petal)';

/** A road at full strength is this see-through, so it never reads heavier than a flower. */
const ROAD_TONE = 0.45;
/** A name gives way to a bigger flower's name it would overlap. */
const NAME_GAP = 6;

export interface LandFlower {
  title: string;
  place: Place;
  model: Model;
}

export interface LandView {
  k: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Fan {
  /** Screen points: one line from each shared petal to the same account in the other flower. */
  lines: [number, number, number, number][];
  /** The rest of what they share, between their "everyone else" petals, and how many accounts. */
  rest: { line: [number, number, number, number]; shared: number } | null;
  opacity: number;
}

/** The most fans at once: one for each pair of live flowers. */
const FANS_MOST = 15;

export interface LandScene {
  draw(view: LandView, live: ReadonlySet<number>, fans: readonly Fan[]): void;
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
}

const slot = <E extends SVGElement>(node: E) => new Slot(node);
const o2 = (x: number) => Math.round(x * 100) / 100;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 + NAME_GAP && b.x0 < a.x1 + NAME_GAP && a.y0 < b.y1 && b.y0 < a.y1;

export function createLandScene(
  svg: SVGSVGElement,
  flowers: readonly LandFlower[],
  roads: readonly Road[],
  continents: readonly Continent[],
  continentNames: readonly string[],
): LandScene {
  const root = el('g', { class: MONO, 'pointer-events': 'none' }, svg);
  const world = slot(el('g', {}, root));
  const roadLayer = el('g', { stroke: INK, fill: 'none' }, world.node);
  const flowerLayer = el('g', {}, world.node);
  const screen = el('g', {}, root);

  // figure.map-road
  // A road runs from one flower's edge to the other's, so the middles stay clear.
  const roadSlots = roads.map((r) => {
    const a = flowers[r.a]?.place as Place;
    const b = flowers[r.b]?.place as Place;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / d;
    const uy = (b.y - a.y) / d;
    const ra = SHAPE.R * a.s;
    const rb = SHAPE.R * b.s;
    return slot(
      el(
        'line',
        {
          x1: n3(a.x + ux * ra),
          y1: n3(a.y + uy * ra),
          x2: n3(b.x - ux * rb),
          y2: n3(b.y - uy * rb),
          'stroke-width': o2(roadWidth(r.shared)),
          'vector-effect': 'non-scaling-stroke',
          opacity: 0,
        },
        roadLayer,
      ),
    );
  });

  // figure.map-flower: each flower's silhouette and polygon line, set once at its place and size.
  const flowerSlots = flowers.map((f) => {
    const { x, y, s } = f.place;
    const g = slot(
      el(
        'g',
        { transform: `translate(${n3(x - s * SHAPE.cx)} ${n3(y - s * SHAPE.cy)}) scale(${n3(s)})` },
        flowerLayer,
      ),
    );
    el('path', { fill: PETAL, d: silhouettePath(f.model.ring) }, g.node);
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
    const name = slot(el('text', { fill: INK, 'text-anchor': 'middle', opacity: 0 }, screen));
    name.node.textContent = f.title;
    return { g, polygon, name, shown: true, named: false };
  });

  // head.map-continent
  const continentSlots = continents.map((_, i) => {
    const t = slot(el('text', { fill: MUTED, 'text-anchor': 'middle', opacity: 0 }, screen));
    t.node.textContent = continentNames[i] ?? '';
    return t;
  });

  // figure.map-fan
  const fanPath = slot(
    el(
      'path',
      {
        fill: 'none',
        stroke: INK,
        'stroke-width': 1,
        'vector-effect': 'non-scaling-stroke',
        opacity: 0,
      },
      screen,
    ),
  );

  // figure.map-fan-rest
  const restSlots = Array.from({ length: FANS_MOST }, () =>
    slot(
      el(
        'line',
        { stroke: INK, 'vector-effect': 'non-scaling-stroke', opacity: 0, display: 'none' },
        screen,
      ),
    ),
  );

  const order = flowers
    .map((_, i) => i)
    .sort((a, b) => {
      const d = (flowers[b]?.place.s ?? 0) - (flowers[a]?.place.s ?? 0);
      return d || a - b;
    });

  return {
    draw(view, live, fans) {
      world.set('transform', `translate(${n3(view.x)} ${n3(view.y)}) scale(${view.k})`);
      const land = SHAPE.R * view.k;

      // Continents: their names, while the flowers are too small to name themselves.
      const named = fade(DETAIL.continentName, land);
      continents.forEach((c, i) => {
        const t = continentSlots[i] as Slot<SVGTextElement>;
        const at = screenCentre(view, c);
        const show = named > 0.01;
        t.set('display', show ? 'inline' : 'none');
        if (!show) return;
        t.set('opacity', o2(named));
        t.set('transform', `translate(${n3(at.x)} ${n3(at.y - c.r * view.k - LINE)})`);
      });

      // Flowers: a silhouette unless it's live, its polygon line and its name by its own size.
      const placed: Box[] = [];
      for (const i of order) {
        const f = flowers[i] as LandFlower;
        const s = flowerSlots[i] as (typeof flowerSlots)[number];
        const visible = !live.has(i) && onScreen(view, f.place);
        if (visible !== s.shown) {
          s.g.set('display', visible ? 'inline' : 'none');
          s.shown = visible;
        }
        let nameOpacity = 0;
        if (visible) {
          const r = screenRadius(view, f.place);
          s.polygon.set('opacity', o2(fade(DETAIL.polygonLine, r)));
          const shown = fade(DETAIL.titleOutside, r);
          if (shown > 0.01) {
            const c = screenCentre(view, f.place);
            const w = textWidth(f.title);
            const y = c.y + r + 18;
            const box = { x0: c.x - w / 2, y0: y - LINE + 4, x1: c.x + w / 2, y1: y + 4 };
            if (!placed.some((b) => overlaps(b, box))) {
              placed.push(box);
              nameOpacity = shown;
              s.name.set('transform', `translate(${n3(c.x)} ${n3(y)})`);
            }
          }
        }
        if (nameOpacity > 0.01) {
          s.name.set('opacity', o2(nameOpacity));
          if (!s.named) s.name.set('display', 'inline');
          s.named = true;
        } else if (s.named) {
          s.name.set('display', 'none');
          s.named = false;
        }
      }

      // Roads: fainter the more there are, and gone once they've fanned out.
      // A flower's strongest roads show from the farthest; the rest come in as it grows.
      const showing: { i: number; o: number }[] = [];
      roads.forEach((r, i) => {
        const a = flowers[r.a]?.place as Place;
        const b = flowers[r.b]?.place as Place;
        let o = 0;
        if (onScreen(view, a) || onScreen(view, b)) {
          const pair = Math.min(screenRadius(view, a), screenRadius(view, b));
          o = fade(DETAIL.road, pair) * (r.strong ? 1 : fade(DETAIL.roadMore, pair));
        }
        if (o > 0.01) showing.push({ i, o });
        else (roadSlots[i] as Slot<SVGLineElement>).set('display', 'none');
      });
      const crowd = crowdFade(showing.length);
      for (const { i, o } of showing) {
        const line = roadSlots[i] as Slot<SVGLineElement>;
        line.set('display', 'inline');
        line.set('opacity', o2(o * crowd * ROAD_TONE));
      }

      // Fans: one path for every shared petal's line, between live flowers only.
      let d = '';
      let fanOpacity = 0;
      for (const fan of fans) {
        if (fan.opacity <= 0.01) continue;
        fanOpacity = Math.max(fanOpacity, fan.opacity);
        for (const [x1, y1, x2, y2] of fan.lines) d += `M${n3(x1)} ${n3(y1)}L${n3(x2)} ${n3(y2)}`;
      }
      fanPath.set('display', d ? 'inline' : 'none');
      if (d) {
        fanPath.node.setAttribute('d', d);
        fanPath.set('opacity', o2(fanOpacity * ROAD_TONE));
      }
      let used = 0;
      for (const fan of fans) {
        if (!fan.rest || fan.opacity <= 0.01 || used >= FANS_MOST) continue;
        const line = restSlots[used++] as Slot<SVGLineElement>;
        const [x1, y1, x2, y2] = fan.rest.line;
        line.set('display', 'inline');
        line.set('x1', n3(x1));
        line.set('y1', n3(y1));
        line.set('x2', n3(x2));
        line.set('y2', n3(y2));
        line.set('stroke-width', o2(roadWidth(fan.rest.shared)));
        line.set('opacity', o2(fan.opacity * ROAD_TONE));
      }
      for (let i = used; i < FANS_MOST; i++) {
        (restSlots[i] as Slot<SVGLineElement>).set('display', 'none');
      }
    },
    dispose() {
      root.remove();
    },
  };
}
