// Where the hero's layers stand in each beat (Elco, 11 Nov: the question, the answer, the flower and the
// background "have to be separate so that we can compose the page as needed for mobile or for large screens").
// Each beat is a shot: the flower's place and size, and the corner each bubble is pinned by. On each beat's one the
// camera whips the flower from the last shot to this one, lands elastic and keeps drifting (Elco, 12 Nov: cut to
// the beat, with ins and outs, never dead still), and the
// question and answer swap sides from beat to beat, shot and reverse shot, so the conversation crosses the flower
// instead of sitting in two fixed corners.
// A wide stage and a narrow one have their own tables. Numbers only, a pure function of the beat and its time.
import { beatMs, driftAt, spring, whipAt } from './hero-story.ts';

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
}

const topLeft = (x: number, y: number): Pin => ({ x, y, ax: 0, ay: 0 });
const topRight = (x: number, y: number): Pin => ({ x, y, ax: 1, ay: 0 });
const bottomRight = (x: number, y: number): Pin => ({ x, y, ax: 1, ay: 1 });

/**
 * A wide stage, sixteen by nine and the whole width of the window (Elco, 12 Nov: "most of the action is on the
 * right side, biased towards the top"): the words sit over the left third, so the flower keeps to the right, the
 * question high beside it, Petals' answer low on the right (answerPin), the Tools box back in the middle ground
 * high on the right (toolsPin).
 */
const WIDE: readonly Shot[] = [
  // a community: where the far map the story opens on is framed
  { flower: { x: 66, y: 44, scale: 0.62 }, question: topLeft(39, 6) },
  // influence: in closer, low, so the tallest petals have the sky
  { flower: { x: 62, y: 50, scale: 0.66 }, question: topLeft(39, 6) },
  // blocs: across to the right
  { flower: { x: 68, y: 45, scale: 0.6 }, question: topLeft(39, 6) },
  // history: back to the left, the line from then to now under it
  { flower: { x: 61, y: 43, scale: 0.58 }, question: topLeft(39, 6) },
  // a vote: further back for the proposal's arc
  { flower: { x: 66, y: 46, scale: 0.54 }, question: topLeft(39, 6) },
  // connections: the widest shot, its neighbours reaching left, towards the words
  { flower: { x: 66, y: 44, scale: 0.62 }, question: topLeft(39, 6) },
];

/** A narrow stage, two by three: the question above, the answer below, the flower between them moving less. */
const NARROW: readonly Shot[] = [
  { flower: { x: 50, y: 45, scale: 0.9 }, question: topLeft(2, 2) },
  { flower: { x: 47, y: 47, scale: 0.86 }, question: topRight(98, 2) },
  { flower: { x: 53, y: 45, scale: 0.88 }, question: topLeft(2, 2) },
  { flower: { x: 52, y: 43, scale: 0.84 }, question: topRight(98, 2) },
  { flower: { x: 50, y: 46, scale: 0.78 }, question: topLeft(2, 2) },
  { flower: { x: 50, y: 44, scale: 0.92 }, question: topRight(98, 2) },
];

/**
 * Where Petals' answer box sits, the same in every shot: it stays on and only its words change (Elco, 12 Nov). The
 * shots keep the flower clear of it.
 */
export const answerPin = (wide: boolean): Pin => (wide ? bottomRight(96, 92) : bottomRight(98, 98));
/** Where the Tools box sits on a wide stage, the same in every shot: back, high on the right. */
export const toolsPin: Pin = topRight(97, 5);

/** How long the camera's whip from the last shot to this one takes, from the one, landing with a little give. */
const WHIP_MS = 560;
/** How far the camera keeps travelling the way it whipped, across the beat, in % of the stage. */
const DRIFT = 1.6;
/** How much it pushes in across a beat. */
const PUSH = 0.025;

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

/** Where a beat leaves the flower: past its shot by the drift, pushed in. */
function endOf(beat: number, wide: boolean) {
  const shot = shotOf(beat, wide).flower;
  const into = way(beat, wide);
  return { x: shot.x + into.x * DRIFT, y: shot.y + into.y * DRIFT, scale: shot.scale * (1 + PUSH) };
}

/**
 * Where the flower is at a moment (Elco, 12 Nov: cut to the beat, with ins and outs, never dead still, never
 * jerking): on the one the camera whips it from where the last beat left it to this beat's shot, from still, fast,
 * easing onto it; then it keeps drifting the way it came and pushing in, steadily. On the community beat it holds
 * still until the question has landed, and whips with the dive (whipAt, driftAt). It leans into the whip and is
 * smeared by it, `blur` px.
 */
export function flowerAt(beat: number, t: number, wide: boolean, fresh = false) {
  const to = shotOf(beat, wide).flower;
  const from = fresh && beat === 0 ? { ...to, scale: to.scale * 0.94 } : endOf(beat - 1, wide);
  const p = Math.min(1, Math.max(0, (t - whipAt(beat)) / WHIP_MS));
  const k = spring(p, 0.85);
  // how fast it is going, per whole whip
  const speed = p > 0 && p < 1 ? (spring(Math.min(1, p + 0.01), 0.85) - k) / 0.01 : 0;
  const drift = driftAt(beat);
  const long = Math.min(1, Math.max(0, (t - drift) / (beatMs(beat) - drift)));
  // steady, so it is still moving as the next whip takes over
  const flow = long;
  const push = long;
  const into = way(beat, wide);
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    x: from.x + (to.x - from.x) * k + into.x * DRIFT * flow,
    y: from.y + (to.y - from.y) * k + into.y * DRIFT * flow,
    scale: (from.scale + (to.scale - from.scale) * k) * (1 + PUSH * push),
    lean: (to.x - from.x) * Math.max(0, speed) * 0.1,
    blur: far * Math.max(0, speed) * 0.035,
  };
}
