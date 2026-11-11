// The map's names and marks (OVERLAYS; LOOK places them, in scene.ts's draw()). Two looks:
// - line (/map, the landing, /make): the mark, a round logo or a pill around the token symbol, with the name
//   after it, in the map's mono;
// - badge (the lab's far wave, #84, #86; Elco, 11 Nov, on the far map: "text and badges are still fugly"): the
//   organisation's badge (design/org-badge.md) drawn on the map. A solid fill of the ground with a hairline
//   edge and square corners, so the lines behind never cross its words; the name in the app's UI type; with no
//   logo, the token symbol before it in mono, muted, or alone in the words' colour when it's the name. The
//   far wave's centre mark is round whether it's a logo or not: with no logo, the symbol's first letter on the
//   ground, in a hairline ring, so every centre reads as one family.
import { n3 } from '../flower/ring.ts';
import { textWidth } from '../flower/words.ts';
import { el, type Slot, slot } from './svg.ts';

const INK = 'var(--text-primary)';
const MUTED = 'var(--text-muted)';
const HAIR = 'var(--hairline)';
const GROUND = 'var(--surface)';

/** A mark is this many px across on screen, at any zoom. */
export const MARK = 16;
export const GAP = 6;
/** Names keep this far apart. */
export const NAME_GAP = 8;

/** The badge: a row this high, its words this far in from its edge, a mark inside it this big. */
const BADGE = { height: 20, pad: 6, mark: 14 };
/** The app's type classes (packages/tokens): UI 13/18 for names, Mono 11/16 for symbols. */
const UI = 'type-ui';
const SYMBOL = 'type-mono';

export type LabelLook = 'line' | 'badge';

export interface LabelFlower {
  name: string;
  mark: { logo: string | null; symbol: string };
}

export interface Label {
  group: Slot<SVGGElement>;
  /** With the far wave, the mark alone, drawn at the flower's centre. */
  centre: Slot<SVGGElement> | null;
  name: Slot<SVGTextElement>;
  width: number;
  markW: number;
  /** Its name is its symbol, so the mark says it. */
  said: boolean;
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
 * A mark, drawn once, its middle at (0, 0): a round logo, or a pill around the token symbol. Returns its
 * width. Its parent must be on screen, so the symbol can be measured as drawn.
 */
function drawMark(m: LabelFlower['mark'], parent: Element, clip: string): number {
  if (m.logo) {
    drawLogo(m.logo, parent, clip, MARK);
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

/** The far wave's centre mark, its middle at (0, 0): a round logo, or the symbol's first letter in a ring. */
function drawCentreMark(m: LabelFlower['mark'], parent: Element, clip: string): void {
  if (m.logo) {
    drawLogo(m.logo, parent, clip, MARK);
    return;
  }
  el(
    'circle',
    { r: MARK / 2, fill: GROUND, stroke: HAIR, 'vector-effect': 'non-scaling-stroke' },
    parent,
  );
  const letter = el('text', { class: SYMBOL, fill: INK, 'text-anchor': 'middle', y: 4 }, parent);
  letter.textContent = Array.from(m.symbol.trim())[0]?.toUpperCase() ?? '';
}

/** A name with its mark before it, laid out once from (0, 0), the mark's middle on the line. */
function drawLine(f: LabelFlower, parent: Element, clip: string, centred: boolean): Label {
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

/**
 * The organisation's badge, laid out once from (0, 0) at its left edge, its middle on the line: the mark
 * inside it, unless the mark is the far wave's centre; then the name. Measured as drawn, then hidden.
 */
function drawBadge(f: LabelFlower, parent: Element, clip: string, centred: boolean): Label {
  const group = slot(el('g', {}, parent));
  const centre = centred ? slot(el('g', {}, parent)) : null;
  if (centre) drawCentreMark(f.mark, centre.node, clip);
  const h = BADGE.height;
  const ground = el(
    'rect',
    { y: -h / 2, height: h, fill: GROUND, stroke: HAIR, 'vector-effect': 'non-scaling-stroke' },
    group.node,
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
    const t = el('text', { class: SYMBOL, fill: MUTED, x, y: 4 }, group.node);
    t.textContent = symbol;
    x += widthOf(t) + GAP;
  }
  const name = slot(
    el('text', { class: said ? SYMBOL : UI, fill: INK, x, y: said ? 4 : 4.5 }, group.node),
  );
  name.node.textContent = said ? symbol : f.name;
  x += widthOf(name.node);
  const width = Math.round(x + BADGE.pad);
  ground.setAttribute('width', String(width));
  group.show(false);
  centre?.show(false);
  // the badge always has its words, so it's never left to its mark alone
  return { group, centre, name, width, markW: centre ? 0 : width, said: false };
}

/** A flower's name and mark, in the look asked for (the line unless it's the badge). */
export function drawLabel(
  f: LabelFlower,
  parent: Element,
  clip: string,
  centred = false,
  look: LabelLook = 'line',
): Label {
  return look === 'badge'
    ? drawBadge(f, parent, clip, centred)
    : drawLine(f, parent, clip, centred);
}
