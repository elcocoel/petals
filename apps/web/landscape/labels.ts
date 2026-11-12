// The map's names and marks (OVERLAYS; LOOK places them, in scene.ts's draw()). Each name is the organisation's
// badge (design/org-badge.md; Elco, 11 Nov, on the far map: "text and badges are still fugly"; #86): a solid
// fill of the ground with a hairline edge and square corners, so the lines behind never cross its words; the
// name in the app's UI type; with no logo, the token symbol before it in mono, muted, or alone in the words'
// colour when it's the name; then what kind of thing it is, quiet in mono (#97), cut before the name is. With
// the far wave the mark stands in the flower's middle (LOOK sizes it), round whether it's a logo or not: with
// no logo, the symbol's first letter on the ground in a hairline ring. Without it (the arrows' names), the
// logo is inside the badge, before the name.
import { textWidth } from '../flower/words.ts';
import { el, type Slot, slot } from './svg.ts';

const INK = 'var(--text-primary)';
const MUTED = 'var(--text-muted)';
const HAIR = 'var(--hairline)';
const GROUND = 'var(--surface)';

/** A mark is this many px across on screen, at any zoom. */
export const MARK = 16;
const GAP = 6;
/** Names keep this far apart. */
export const NAME_GAP = 8;

/** The badge: a row this high, its words this far in from its edge, a logo inside it this big. */
const BADGE = { height: 20, pad: 6, mark: 14 };
/** How tall a name's badge is on screen, for placing it. */
export const LABEL_HEIGHT = BADGE.height;
/** The app's type classes (packages/tokens): UI 13/18 for names, Mono 11/16 for symbols and types. */
const UI = 'type-ui';
const MONO = 'type-mono';

export interface LabelFlower {
  name: string;
  /** `chain`: the logo of the chain it's on, for the centre where it has none of its own */
  mark: { logo: string | null; symbol: string; types?: readonly string[]; chain?: string | null };
  /** its map's treasury and token price, in words, for the line under its badge (LOOK, Elco's walk 3) */
  worth?: readonly string[] | undefined;
}

/** The treasury and price line under a badge: this tall on screen. */
export const WORTH_HEIGHT = 16;

export interface Label {
  group: Slot<SVGGElement>;
  /** With the far wave, the mark alone, drawn at the flower's centre. */
  centre: Slot<SVGGElement> | null;
  /** How wide it is with its types, and with its name alone (its types cut first, org-badge.md line 9). */
  width: number;
  short: number;
  /** Shows its types or cuts them, the ground following. */
  typed(on: boolean): void;
  /** Its treasury and token price, laid out from (0, 0) at its left edge, its middle on the line; null with none. */
  worth: Slot<SVGGElement> | null;
  worthWidth: number;
}

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

/** A round logo, its middle at (0, 0), this big. */
function drawLogo(logo: string, parent: Element, clip: string, size: number): void {
  el(
    'image',
    {
      href: logo,
      x: -size / 2,
      y: -size / 2,
      width: size,
      height: size,
      'clip-path': `url(#${clip})`,
      preserveAspectRatio: 'xMidYMid slice',
    },
    parent,
  );
}

/**
 * The far wave's centre mark, its middle at (0, 0): a round logo; with none of its own, the logo of the chain it's on
 * (Elco, 12 Nov walk 3: "We should find a better visual representation for daos that don't have a logo ... maybe
 * there's something that we can display there for example which chain they're on"); else the symbol's first letter
 * in a ring.
 */
function drawCentreMark(m: LabelFlower['mark'], parent: Element, clip: string): void {
  const logo = m.logo ?? m.chain;
  if (logo) {
    drawLogo(logo, parent, clip, MARK);
    return;
  }
  el(
    'circle',
    { r: MARK / 2, fill: GROUND, stroke: HAIR, 'vector-effect': 'non-scaling-stroke' },
    parent,
  );
  const letter = el('text', { class: MONO, fill: INK, 'text-anchor': 'middle', y: 4 }, parent);
  letter.textContent = Array.from(m.symbol.trim())[0]?.toUpperCase() ?? '';
}

/**
 * A flower's badge, laid out once from (0, 0) at its left edge, its middle on the line: the logo inside it
 * unless the mark is the far wave's centre, the symbol where there's no logo, the name, its types. Its parent
 * must be on screen, so the words are measured as the browser sets them; then it's hidden.
 */
export function drawLabel(f: LabelFlower, parent: Element, clip: string, centred = false): Label {
  const group = slot(el('g', {}, parent));
  const centre = centred ? slot(el('g', {}, parent)) : null;
  if (centre) drawCentreMark(f.mark, centre.node, clip);
  const h = BADGE.height;
  const ground = slot(
    el(
      'rect',
      { y: -h / 2, height: h, fill: GROUND, stroke: HAIR, 'vector-effect': 'non-scaling-stroke' },
      group.node,
    ),
  );
  const symbol = f.mark.symbol.trim();
  // a name that's only its symbol is said once, by the symbol, in the words' colour (org-badge.md, line 2)
  const said = !f.mark.logo && symbol.toLowerCase() === f.name.trim().toLowerCase();
  let x = BADGE.pad;
  if (!centre && f.mark.logo) {
    const m = el('g', { transform: `translate(${x + BADGE.mark / 2} 0)` }, group.node);
    drawLogo(f.mark.logo, m, clip, BADGE.mark);
    x += BADGE.mark + GAP;
  }
  if (!f.mark.logo && symbol && !said) {
    const t = el('text', { class: MONO, fill: MUTED, x, y: 4 }, group.node);
    t.textContent = symbol;
    x += widthOf(t) + GAP;
  }
  const name = el('text', { class: said ? MONO : UI, fill: INK, x, y: said ? 4 : 4.5 }, group.node);
  name.textContent = said ? symbol : f.name;
  x += widthOf(name);
  const short = Math.round(x + BADGE.pad);
  const words = (f.mark.types ?? []).join(' · ');
  let types: Slot<SVGTextElement> | null = null;
  if (words) {
    types = slot(el('text', { class: MONO, fill: MUTED, x: x + GAP, y: 4 }, group.node));
    types.node.textContent = words;
    x += GAP + widthOf(types.node);
  }
  const width = Math.round(x + BADGE.pad);
  const typed = (on: boolean) => {
    types?.show(on);
    ground.set('width', on ? width : short);
  };
  typed(true);
  group.show(false);
  centre?.show(false);
  // its treasury and token price, quiet in mono on the ground, so the lines behind never cross them
  let worth: Slot<SVGGElement> | null = null;
  let worthWidth = 0;
  if (f.worth && f.worth.length > 0) {
    worth = slot(el('g', {}, parent));
    const wh = WORTH_HEIGHT;
    const back = el(
      'rect',
      { y: -wh / 2, height: wh, fill: GROUND, stroke: HAIR, 'vector-effect': 'non-scaling-stroke' },
      worth.node,
    );
    const t = el('text', { class: MONO, fill: MUTED, x: BADGE.pad, y: 4 }, worth.node);
    t.textContent = f.worth.join(' · ');
    worthWidth = Math.round(widthOf(t) + 2 * BADGE.pad);
    back.setAttribute('width', String(worthWidth));
    worth.show(false);
  }
  return { group, centre, width, short, typed, worth, worthWidth };
}
