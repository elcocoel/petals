// The far map the hero opens and closes on (Elco, 12 Nov: "start in the beginning from a far away situation ...
// where you can see the simplified version of things and then we zoom in into my community ... following to other
// communities and then it zooms out to the same frame it started"). Made-up communities, unnamed: the hero stays a
// symbol, only closer to the real thing. Each is drawn from far as the real far map draws one
// (@petal/core/wedge/far: a soft wave made from its own petals' heights, a hole for its mark), tallest at twelve
// as the real petals are ordered. Positions are in the drawing's units, my community at 0, 0. Pure; built once.
import { farPath } from '@petal/core/wedge/far';
import { base, INNER, MAP_CENTRE, seeded } from './hero-story.ts';

export interface Community {
  x: number;
  y: number;
  /** where its petals start: its centre's edge */
  inner: number;
  /** each petal's height beyond `inner`, clockwise from twelve */
  heights: readonly number[];
  /** the soft wave it is from far, round 0, 0 */
  wave: string;
  /** how much of it shows on the far map, 0 to 1: those near the far frame's edges fade, so the map has no hard edge */
  seen: number;
  /** its made-up token's mark, where a logo sits on the real map */
  token: Token;
}

/**
 * A made-up token's mark (Elco, 12 Nov: "we are not going to have black dots in the center ... some kind of cute
 * simulated imaginary token symbols"): a simple glyph in white on a disc in one of the look's keys.
 */
export interface Token {
  glyph: 'ring' | 'tri' | 'diamond' | 'hex' | 'bars' | 'star' | 'half';
  key: 'blue' | 'coral' | 'apricot' | 'pink' | 'mint';
}
const GLYPHS: readonly Token['glyph'][] = ['ring', 'tri', 'diamond', 'hex', 'bars', 'star', 'half'];
const TOKEN_KEYS: readonly Token['key'][] = ['blue', 'coral', 'apricot', 'pink'];
const tokenOf = (next: () => number): Token => ({
  glyph: GLYPHS[Math.floor(next() * GLYPHS.length)] ?? 'ring',
  key: TOKEN_KEYS[Math.floor(next() * TOKEN_KEYS.length)] ?? 'blue',
});

/**
 * The whole far frame, in the drawing's units: the full width of a wide stage, the words' side included, since the
 * story runs under them too (Elco, 12 Nov); my community sits right of its middle, where the story happens.
 */
const FRAME = { x: MAP_CENTRE.x - 1000, y: MAP_CENTRE.y, w: 6600, h: 3600 };
const HALF = { x: FRAME.w / 2, y: FRAME.h / 2 };
/** How much of a community shows at its place on the far frame: all of it, fading over the last part to the edge. */
function seenAt(x: number, y: number): number {
  const out = Math.max(Math.abs(x - FRAME.x) / HALF.x, Math.abs(y - FRAME.y) / HALF.y);
  const p = Math.min(1, Math.max(0, (out - 0.72) / 0.28));
  return 1 - p * p * (3 - 2 * p);
}

const TAU = Math.PI * 2;

/** A community's soft wave from its petals' heights, the real far map's own drawing. */
const waveOf = (inner: number, heights: readonly number[]) =>
  farPath(
    {
      mid: Float64Array.from(heights, (_, i) => ((i + 0.5) / heights.length) * TAU),
      height: Float64Array.from(heights),
    },
    { cx: 0, cy: 0, r0: inner },
  );

/**
 * A community `size` times mine, its holders made up as real ones come (Elco, 12 Nov: "you are using the same shape
 * for things ... it looks completely unrealistic"): one whale and a tail, a few large holders, an even and ragged
 * spread, or a long tail; anywhere from a handful of wallets to dozens; most ordered largest first, as the real
 * default orders them, some by when they last voted. So no two have the same outline.
 */
function community(x: number, y: number, size: number, next: () => number): Community {
  const inner = INNER * size;
  const petals = 5 + Math.floor(next() * 45);
  const kind = next();
  const big = 1 + Math.floor(next() * 4);
  const heights = Array.from({ length: petals }, (_, i) => {
    const r = next();
    const tail = 1 - i / petals;
    if (kind < 0.25) return i === 0 ? 1 : 0.06 + 0.22 * r * tail;
    if (kind < 0.5) return i < big ? 0.65 + 0.35 * r : 0.08 + 0.3 * r * tail;
    if (kind < 0.72) return 0.35 + 0.5 * r;
    return (i + 1) ** -(0.5 + next()) * (0.6 + 0.8 * r);
  }).map((h) => 128 * size * h);
  if (next() < 0.7) heights.sort((a, b) => b - a);
  return {
    x,
    y,
    inner,
    heights,
    wave: waveOf(inner, heights),
    seen: seenAt(x, y),
    token: tokenOf(next),
  };
}

/** My community from far: its wave from its petals' heights as influence shows them. */
export const MINE: Community = (() => {
  const heights = base.map((r) => r - INNER);
  return {
    x: 0,
    y: 0,
    inner: INNER,
    heights,
    wave: waveOf(INNER, heights),
    seen: 1,
    token: { glyph: 'hex', key: 'coral' },
  };
})();

/** The two neighbours the connections beat follows its lines to. */
export const NEIGHBOURS: readonly Community[] = (() => {
  const next = seeded(31);
  return [community(-430, 150, 0.56, next), community(-400, -120, 0.62, next)];
})();

/**
 * Everyone else on the map: one to a cell of a loose grid over the whole far frame, nudged off the grid, kept clear
 * of my community and its neighbours.
 */
export const OTHERS: readonly Community[] = (() => {
  const next = seeded(12);
  const cols = 13;
  const rows = 7;
  const { w, h } = FRAME;
  const out: Community[] = [];
  const taken = [MINE, ...NEIGHBOURS].map((c) => ({ x: c.x, y: c.y, r: c.inner + 200 }));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = FRAME.x - w / 2 + ((col + 0.2 + 0.6 * next()) / cols) * w;
      const y = FRAME.y - h / 2 + ((row + 0.2 + 0.6 * next()) / rows) * h;
      const size = 0.28 + 0.5 * next();
      const reach = INNER * size + 140 * size;
      if (taken.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + reach)) continue;
      out.push(community(x, y, size, next));
    }
  }
  return out;
})();
