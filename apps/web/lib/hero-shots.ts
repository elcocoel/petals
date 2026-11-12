// Where the hero's layers stand in each beat (Elco, 11 Nov: the question, the answer, the flower and the
// background "have to be separate so that we can compose the page as needed for mobile or for large screens").
// Each beat is a shot: the flower's place and size, and the corner each bubble is pinned by. On each beat's one the
// camera whips the flower from the last shot to this one and holds it (Elco, 12 Nov: cut to the beat), and the
// question and answer swap sides from beat to beat, shot and reverse shot, so the conversation crosses the flower
// instead of sitting in two fixed corners.
// A wide stage and a narrow one have their own tables. Numbers only, a pure function of the beat and its time.

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

/** How long the camera's whip from the last shot to this one takes, from the one. */
const WHIP_MS = 380;

/** The shot a beat holds. */
export const shotOf = (beat: number, wide: boolean): Shot =>
  ((wide ? WIDE : NARROW)[beat] ?? (wide ? WIDE : NARROW)[0]) as Shot;

/**
 * Where the flower is at a moment (Elco, 12 Nov: cut to the beat): on the one the camera whips it from the last
 * shot to this one, all its speed at the start and braking hard into the shot, then holds it there. It leans into
 * the whip and is smeared by it, `blur` px at the start.
 */
export function flowerAt(beat: number, t: number, wide: boolean, fresh = false) {
  const to = shotOf(beat, wide).flower;
  if (fresh && beat === 0) return { ...to, lean: 0, blur: 0 };
  const from = shotOf((beat + 5) % 6, wide).flower;
  const p = Math.min(1, Math.max(0, t / WHIP_MS));
  const k = 1 - (1 - p) ** 4;
  // how fast it is going, 1 on the one, 0 in the shot
  const speed = (1 - p) ** 3;
  const far = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    scale: from.scale + (to.scale - from.scale) * k,
    lean: (to.x - from.x) * speed * 0.35,
    blur: far * speed * 0.12,
  };
}
