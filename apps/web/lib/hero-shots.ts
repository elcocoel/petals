// Where the hero's layers stand in each beat (Elco, 11 Nov: the question, the answer, the flower and the
// background "have to be separate so that we can compose the page as needed for mobile or for large screens").
// Each beat is a shot: the flower's place and size, and the corner each bubble is pinned by. The camera never stops
// (Elco, 12 Nov: one take): it travels one smooth path through every shot, passing through each once its answer is
// in; and the question and answer swap sides from beat to beat, so the conversation crosses the flower instead of
// sitting in two fixed corners.
// A wide stage and a narrow one have their own tables. Numbers only, a pure function of the beat and its time.
import { BEATS_MS, beatMs } from './hero-story.ts';

/** A point of the stage, in % of its width and height. */
export interface Pin {
  x: number;
  y: number;
  /** Which point of the bubble sits on it: 0 its left or top edge, 1 its right or bottom. */
  ax: number;
  ay: number;
}

export interface Shot {
  /** The flower's centre, in % of the stage, and its size against the stage. */
  flower: { x: number; y: number; scale: number };
  question: Pin;
  answer: Pin;
}

const topLeft = (x: number, y: number): Pin => ({ x, y, ax: 0, ay: 0 });
const topRight = (x: number, y: number): Pin => ({ x, y, ax: 1, ay: 0 });
const middleRight = (x: number, y: number): Pin => ({ x, y, ax: 1, ay: 0.5 });
const bottomLeft = (x: number, y: number): Pin => ({ x, y, ax: 0, ay: 1 });
const bottomRight = (x: number, y: number): Pin => ({ x, y, ax: 1, ay: 1 });

/** A wide stage, eight by five. Each answer sits on the side away from its flower, so neither covers the other. */
const WIDE: readonly Shot[] = [
  // a community: the flower left of middle, the question high on the left, the answer low on the right
  { flower: { x: 37, y: 48, scale: 0.8 }, question: topLeft(3, 4), answer: bottomRight(97, 96) },
  // influence: in closer and further left, low, so the tallest petals have the sky; the question crosses over
  { flower: { x: 31, y: 54, scale: 0.84 }, question: topRight(97, 4), answer: bottomRight(97, 96) },
  // blocs: across to the right, the words both on the left
  { flower: { x: 63, y: 50, scale: 0.8 }, question: topLeft(3, 4), answer: bottomLeft(3, 96) },
  // history: back to the left, the line from then to now under it, the answer level with it on the right
  { flower: { x: 33, y: 48, scale: 0.76 }, question: topLeft(3, 4), answer: middleRight(97, 52) },
  // a vote: high on the right, further back for the proposal's ring
  { flower: { x: 60, y: 46, scale: 0.68 }, question: topLeft(3, 4), answer: bottomLeft(3, 96) },
  // connections: the widest shot, the network across the stage
  { flower: { x: 50, y: 46, scale: 0.9 }, question: topRight(97, 4), answer: bottomLeft(3, 96) },
];

/** A narrow stage, two by three: the words above and below, the flower between them moving less. */
const NARROW: readonly Shot[] = [
  { flower: { x: 50, y: 45, scale: 0.9 }, question: topLeft(2, 2), answer: bottomRight(98, 98) },
  { flower: { x: 47, y: 47, scale: 0.86 }, question: topRight(98, 2), answer: bottomLeft(2, 98) },
  { flower: { x: 53, y: 45, scale: 0.88 }, question: topLeft(2, 2), answer: bottomRight(98, 98) },
  { flower: { x: 52, y: 43, scale: 0.84 }, question: topRight(98, 2), answer: bottomLeft(2, 98) },
  { flower: { x: 50, y: 46, scale: 0.78 }, question: topLeft(2, 2), answer: bottomRight(98, 98) },
  { flower: { x: 50, y: 44, scale: 0.92 }, question: topRight(98, 2), answer: bottomLeft(2, 98) },
];

/** Where in its beat the camera passes through the beat's shot: once its answer is in, as a share of the beat. */
const HIT = 0.45;

/** When each beat starts, on one clock round the whole story. */
const STARTS = BEATS_MS.map((_, k) => BEATS_MS.slice(0, k).reduce((sum, ms) => sum + ms, 0));
const LOOP = BEATS_MS.reduce((sum, ms) => sum + ms, 0);
/** When the camera passes through beat `k`'s shot. */
const hitAt = (k: number) => (STARTS[k] ?? 0) + beatMs(k) * HIT;

/** The shot a beat holds. */
export const shotOf = (beat: number, wide: boolean): Shot =>
  ((wide ? WIDE : NARROW)[beat] ?? (wide ? WIDE : NARROW)[0]) as Shot;

type Place = { x: number; y: number; scale: number };
const AXES = ['x', 'y', 'scale'] as const;
const place = (k: number, wide: boolean): Place => shotOf((k + 6) % 6, wide).flower;

/**
 * How fast the camera passes through shot `k`, per ms: the way from the shot before to the shot after, so it goes
 * through each shot without stopping.
 */
function pace(k: number, wide: boolean): Place {
  const before = place(k - 1, wide);
  const after = place(k + 1, wide);
  const ms = hitAt((k + 1) % 6) - hitAt((k + 5) % 6) + (k === 0 || k === 5 ? LOOP : 0);
  return {
    x: (after.x - before.x) / ms,
    y: (after.y - before.y) / ms,
    scale: (after.scale - before.scale) / ms,
  };
}

/** One leg of the path, `s` of the way from `a` to `b` over `ms`, leaving and arriving at their paces; and its speed. */
function leg(a: Place, va: Place, b: Place, vb: Place, ms: number, s: number) {
  const s2 = s * s;
  const s3 = s2 * s;
  const at = {} as Place;
  const speed = {} as Place;
  for (const key of AXES) {
    at[key] =
      (2 * s3 - 3 * s2 + 1) * a[key] +
      (s3 - 2 * s2 + s) * ms * va[key] +
      (-2 * s3 + 3 * s2) * b[key] +
      (s3 - s2) * ms * vb[key];
    speed[key] =
      ((6 * s2 - 6 * s) * a[key] +
        (3 * s2 - 4 * s + 1) * ms * va[key] +
        (-6 * s2 + 6 * s) * b[key] +
        (3 * s2 - 2 * s) * ms * vb[key]) /
      ms;
  }
  return { at, speed };
}

const STILL: Place = { x: 0, y: 0, scale: 0 };

/**
 * Where the flower is at a moment (Elco, 12 Nov: one take, the camera never stops): on one smooth path through every
 * beat's shot, round the whole story, so it is always on its way from one shot to the next. On arrival it starts
 * still, a little further back, and pushes in. It leans into its travel.
 */
export function flowerAt(beat: number, t: number, wide: boolean, fresh = false) {
  const now = (STARTS[beat] ?? 0) + t;
  let path: ReturnType<typeof leg>;
  if (fresh && now < hitAt(0)) {
    const to = place(0, wide);
    const v = pace(0, wide);
    const ms = hitAt(0);
    const from = { x: to.x - (v.x * ms) / 2, y: to.y - (v.y * ms) / 2, scale: to.scale * 0.92 };
    path = leg(from, STILL, to, v, ms, now / ms);
  } else {
    // the last shot passed, and the next, round the loop
    let k = 5;
    for (let j = 0; j < 6; j++) if (hitAt(j) <= now) k = j;
    const from = now < hitAt(0) ? hitAt(5) - LOOP : hitAt(k);
    const to = k === 5 ? hitAt(0) + (now < hitAt(0) ? 0 : LOOP) : hitAt(k + 1);
    path = leg(
      place(k, wide),
      pace(k, wide),
      place(k + 1, wide),
      pace(k + 1, wide),
      to - from,
      (now - from) / (to - from),
    );
  }
  // and a slow float round a small circle, once round the whole story, so even passing a shot it is moving
  const turn = (2 * Math.PI * now) / LOOP;
  return {
    x: path.at.x + FLOAT * Math.cos(turn),
    y: path.at.y + FLOAT * Math.sin(turn),
    scale: path.at.scale,
    lean: path.speed.x * LEAN,
  };
}

/** How far the flower leans into its travel: degrees per % of the stage a ms. */
const LEAN = 700;
/** The camera's float, in % of the stage. */
const FLOAT = 1.2;
