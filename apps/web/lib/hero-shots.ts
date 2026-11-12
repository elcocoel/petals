// Where the hero's layers stand in each beat (Elco, 11 Nov: the question, the answer, the flower and the
// background "have to be separate so that we can compose the page as needed for mobile or for large screens").
// Each beat is a shot: the flower's place and size, and the corner each bubble is pinned by. On each beat's one the
// camera whips the flower from the last shot to this one, lands elastic and keeps drifting (Elco, 12 Nov: cut to
// the beat, with ins and outs, never dead still), and the
// question and answer swap sides from beat to beat, shot and reverse shot, so the conversation crosses the flower
// instead of sitting in two fixed corners.
// A wide stage and a narrow one have their own tables. Numbers only, a pure function of the beat and its time.
import { beatMs, COUNT_MS, ease, spring } from './hero-story.ts';

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

/** How long the camera's whip from the last shot to this one takes, from the one, landing elastic. */
const WHIP_MS = 560;
/** How far the camera keeps travelling the way it whipped, across the beat, in % of the stage. */
const DRIFT = 1.6;
/** How much it pushes in across a beat. */
const PUSH = 0.025;
/** How far it draws back against the next whip, over the beat's last sixteenth, in % of the stage. */
const WIND = 1.2;
const WIND_MS = COUNT_MS / 4;

/** The shot a beat holds. */
export const shotOf = (beat: number, wide: boolean): Shot =>
  ((wide ? WIDE : NARROW)[(beat + 6) % 6] ?? (wide ? WIDE : NARROW)[0]) as Shot;

/** Which way the camera whips into a beat's shot, as a unit step. */
function way(beat: number, wide: boolean) {
  const a = shotOf(beat - 1, wide).flower;
  const b = shotOf(beat, wide).flower;
  const far = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / far, y: (b.y - a.y) / far };
}

/** Where a beat leaves the flower: past its shot by the drift, pushed in, drawn back against the next whip. */
function endOf(beat: number, wide: boolean) {
  const shot = shotOf(beat, wide).flower;
  const into = way(beat, wide);
  const next = way(beat + 1, wide);
  return {
    x: shot.x + into.x * DRIFT - next.x * WIND,
    y: shot.y + into.y * DRIFT - next.y * WIND,
    scale: shot.scale * (1 + PUSH),
  };
}

/**
 * Where the flower is at a moment (Elco, 12 Nov: cut to the beat, with ins and outs, never dead still): on the one
 * the camera whips it from where the last beat left it to this beat's shot, from still, fast, a little past and
 * back onto it; then it keeps drifting the way it came and pushing in, slowing; on the last sixteenth it draws
 * back against the next whip. It leans into the whip and is smeared by it, `blur` px.
 */
export function flowerAt(beat: number, t: number, wide: boolean, fresh = false) {
  const to = shotOf(beat, wide).flower;
  const from = fresh && beat === 0 ? { ...to, scale: to.scale * 0.94 } : endOf(beat - 1, wide);
  const p = Math.min(1, Math.max(0, t / WHIP_MS));
  const k = spring(p, 0.7);
  // how fast it is going, per whole whip
  const speed = p < 1 ? (spring(Math.min(1, p + 0.01), 0.7) - k) / 0.01 : 0;
  const long = Math.min(1, Math.max(0, t / beatMs(beat)));
  const flow = ease.outSine(long);
  const push = ease.inOutSine(long);
  const wind = ease.inOutSine(Math.min(1, Math.max(0, (t - beatMs(beat) + WIND_MS) / WIND_MS)));
  const into = way(beat, wide);
  const next = way(beat + 1, wide);
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    x: from.x + (to.x - from.x) * k + into.x * DRIFT * flow - next.x * WIND * wind,
    y: from.y + (to.y - from.y) * k + into.y * DRIFT * flow - next.y * WIND * wind,
    scale: (from.scale + (to.scale - from.scale) * k) * (1 + PUSH * push),
    lean: (to.x - from.x) * Math.max(0, speed) * 0.1,
    blur: far * Math.max(0, speed) * 0.035,
  };
}
