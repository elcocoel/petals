// The far map the hero opens and closes on (Elco, 12 Nov: "start in the beginning from a far away situation ...
// where you can see the simplified version of things and then we zoom in into my community ... following to other
// communities and then it zooms out to the same frame it started"). Made-up communities, unnamed: the hero stays a
// symbol, only closer to the real thing. Each is drawn from far as the real far map draws one
// (@petal/core/wedge/far: a soft wave made from its own petals' heights, a hole for its mark), tallest at twelve
// as the real petals are ordered. Positions are in the drawing's units, my community at 0, 0. Pure; built once.
import { farPath } from '@petal/core/wedge/far';
import { base, INNER, MAP_CENTRE } from './hero-story.ts';

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
}

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

/** The same made-up map every time: a small seeded generator. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A community `size` times mine: some petals, the biggest holders first, as lopsided as `steep` says. */
function community(x: number, y: number, size: number, petals: number, steep: number): Community {
  const inner = INNER * size;
  const heights = Array.from(
    { length: petals },
    (_, i) => 128 * size * (0.12 + 0.88 * (1 - i / petals) ** steep),
  );
  return { x, y, inner, heights, wave: waveOf(inner, heights), seen: seenAt(x, y) };
}

/** My community from far: its wave from its petals' heights as influence shows them. */
export const MINE: Community = (() => {
  const heights = base.map((r) => r - INNER);
  return { x: 0, y: 0, inner: INNER, heights, wave: waveOf(INNER, heights), seen: 1 };
})();

/** The two neighbours the connections beat follows its lines to. */
export const NEIGHBOURS: readonly Community[] = [
  community(-430, 150, 0.56, 16, 1.4),
  community(-400, -120, 0.62, 18, 2.2),
];

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
      const size = 0.32 + 0.45 * next();
      const petals = 8 + Math.floor(next() * 22);
      const steep = 0.8 + 2.4 * next();
      const reach = INNER * size + 140 * size;
      if (taken.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + reach)) continue;
      out.push(community(x, y, size, petals, steep));
    }
  }
  return out;
})();
