// Where the hero's layers stand in each beat (Elco, 11 Nov: the question, the answer, the flower and the
// background "have to be separate so that we can compose the page as needed for mobile or for large screens").
// Each beat is a shot: the flower's place and size. On each beat's one the camera whips the flower from the last
// shot to this one, lands with a little give and keeps drifting (Elco, 12 Nov: cut to the beat, with ins and outs,
// never dead still); the flower stays flat to the screen (Elco, 12 Nov: "this 3Dness is 100% not working for the
// petal"). The question and Petals' answer stay together in one place, near the words, so the eye has little way
// to travel, and never further up or down than a reader's glance (conversationAt). A wide stage and a narrow one
// have their own tables. Numbers only, a pure function of the beat and its time.
import { beatMs, driftAt, spring, whipAt } from './hero-story.ts';

/** A point of the stage, in % of its width and height. */
export interface Pin {
  x: number;
  y: number;
  /** Which point of the box sits on it: 0 its left or top edge, 1 its right or bottom. */
  ax: number;
  ay: number;
}

export interface Shot {
  /** The flower's centre, in % of the stage, and its size against the stage. */
  flower: { x: number; y: number; scale: number };
}

const topRight = (x: number, y: number): Pin => ({ x, y, ax: 1, ay: 0 });

/**
 * A wide stage, sixteen by nine and the whole width of the window (Elco, 12 Nov: "most of the action is on the
 * right side, biased towards the top"): the words over the left third, the conversation just right of them, the
 * flower right of that, the Tools box high on the right.
 */
const WIDE: readonly Shot[] = [
  // a community: where the far map the story opens on is framed
  { flower: { x: 71, y: 46, scale: 0.6 } },
  // influence: in a little closer and lower, so the tallest petals have the sky
  { flower: { x: 70, y: 50, scale: 0.63 } },
  // blocs
  { flower: { x: 72, y: 46, scale: 0.6 } },
  // history: back, for the petals' travel round the circle
  { flower: { x: 71, y: 47, scale: 0.57 } },
  // a vote: further back for the proposals stacked over the petals
  { flower: { x: 71, y: 49, scale: 0.55 } },
  // connections: its neighbours reaching left, towards the conversation
  { flower: { x: 71, y: 46, scale: 0.6 } },
];

/** A narrow stage, two by three: the flower high, the conversation under it. */
const NARROW: readonly Shot[] = [
  { flower: { x: 50, y: 34, scale: 0.86 } },
  { flower: { x: 49, y: 36, scale: 0.84 } },
  { flower: { x: 51, y: 34, scale: 0.84 } },
  { flower: { x: 50, y: 34, scale: 0.8 } },
  { flower: { x: 50, y: 35, scale: 0.76 } },
  { flower: { x: 50, y: 34, scale: 0.86 } },
];

/** Where the Tools box sits on a wide stage, the same in every shot: high on the right, over the flower. */
export const toolsPin: Pin = topRight(97, 4);

/**
 * Where the conversation's top left corner is, as CSS: on a wide stage just right of the words, a little above
 * the middle but never more than a glance above it, however tall the stage grows (Elco, 12 Nov: "there should be
 * a limit to how up or down the text boxes are going to go"); on a narrow one under the flower.
 */
export const conversationAt = (wide: boolean) =>
  wide
    ? { left: '37cqw', top: 'calc(50cqh - min(17cqh, 150px))' }
    : { left: '4cqw', top: 'calc(60cqh - min(4cqh, 40px))' };

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
 * still until the question has landed, and whips with the dive (whipAt, driftAt).
 */
export function flowerAt(beat: number, t: number, wide: boolean, fresh = false) {
  const to = shotOf(beat, wide).flower;
  const from = fresh && beat === 0 ? { ...to, scale: to.scale * 0.94 } : endOf(beat - 1, wide);
  const p = Math.min(1, Math.max(0, (t - whipAt(beat)) / WHIP_MS));
  const k = spring(p, 0.85);
  const drift = driftAt(beat);
  const long = Math.min(1, Math.max(0, (t - drift) / (beatMs(beat) - drift)));
  // steady, so it is still moving as the next whip takes over
  const flow = long;
  const push = long;
  const into = way(beat, wide);
  return {
    x: from.x + (to.x - from.x) * k + into.x * DRIFT * flow,
    y: from.y + (to.y - from.y) * k + into.y * DRIFT * flow,
    scale: (from.scale + (to.scale - from.scale) * k) * (1 + PUSH * push),
  };
}
