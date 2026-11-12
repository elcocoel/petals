// Where the hero's layers stand in each beat (Elco, 11 Nov: the question, the answer, the flower and the
// background "have to be separate so that we can compose the page as needed for mobile or for large screens").
// Each beat is a shot: the flower's place and size. On each beat's one the camera whips the flower from the last
// shot to this one, lands with a little give and keeps drifting (Elco, 12 Nov: cut to the beat, with ins and outs,
// never dead still); the flower stays flat to the screen (Elco, 12 Nov: "this 3Dness is 100% not working for the
// petal"). Everything is placed in the page's column, so it stays composed with the words however wide the window;
// the question and Petals' answer sit on either side of the flower, call and response, never further up or down
// than a glance. A wide stage and a narrow one have their own tables. Numbers only, a pure function of the beat and
// its time.
import { beatMs, driftAt, spring, whipAt } from './hero-story.ts';

/**
 * A point of the page's column, the words' column the stage's story is composed in (Elco, 12 Nov, on a wide window:
 * the messages over the headline), in % of its width and height; with `cap`, never more than that many px above or
 * below its middle, however tall the stage (Elco, 12 Nov: "there should be a limit to how up or down the text boxes
 * are going to go").
 */
export interface Pin {
  x: number;
  y: number;
  /** Which point of the box sits on it: 0 its left or top edge, 1 its right or bottom. */
  ax: number;
  ay: number;
  cap?: number;
  /** In place of `y`: that many px below the column's top, where a measure of the page puts it. */
  py?: number;
  /**
   * In place of `x`: that many px in from where the Tools box reaches on the frame's side, as seen on screen
   * (TOOLS_REACH); the view works the reach out from the window.
   */
  inFromReach?: number;
}

export interface Shot {
  /** The flower's centre, in % of the column's width and the stage's height, and its size against the stage. */
  flower: { x: number; y: number; scale: number };
}

const pin = (x: number, y: number, ax: number, ay: number, cap?: number): Pin =>
  cap === undefined ? { x, y, ax, ay } : { x, y, ax, ay, cap };

/**
 * A wide stage, sixteen by nine and the whole width of the window (Elco, 12 Nov: "most of the action is on the
 * right side, biased towards the top"): the words over the left third of the column, the flower in the right two
 * thirds, the Tools box high on the column's right.
 */
const WIDE: readonly Shot[] = [
  // a community: where the far map the story opens on is framed
  { flower: { x: 66, y: 46, scale: 0.6 } },
  // influence: in a little closer and lower, so the tallest petals have the sky
  { flower: { x: 64, y: 50, scale: 0.63 } },
  // blocs
  { flower: { x: 67, y: 46, scale: 0.6 } },
  // history: back, for the petals' travel round the circle
  { flower: { x: 66, y: 47, scale: 0.58 } },
  // a vote: the camera goes right into a petal and back out
  { flower: { x: 66, y: 48, scale: 0.56 } },
  // connections: its neighbours reaching left, towards the words
  { flower: { x: 66, y: 46, scale: 0.6 } },
];

/** A narrow stage, two by three: the question above the flower, the answer under it. */
const NARROW: readonly Shot[] = [
  { flower: { x: 50, y: 45, scale: 0.86 } },
  { flower: { x: 49, y: 47, scale: 0.84 } },
  { flower: { x: 51, y: 45, scale: 0.84 } },
  { flower: { x: 50, y: 45, scale: 0.8 } },
  { flower: { x: 50, y: 46, scale: 0.76 } },
  { flower: { x: 50, y: 45, scale: 0.86 } },
];

/**
 * The call and the response, on either side of the flower (Elco, 12 Nov: "I want a call and response dynamic so
 * they would be on different sides"): on a wide stage the question just right of the words, above the flower's
 * left, and Petals' answer below its right, each held within a glance of the middle; on a narrow one the question
 * above the flower and the answer under it.
 */
export const questionPin = (wide: boolean): Pin =>
  wide ? pin(34, 26, 0, 0, 200) : pin(0, 2, 0, 0);
export const answerPin = (wide: boolean): Pin =>
  wide ? { ...pin(100, 64, 1, 0, 130), inFromReach: TOOLS_PAST } : pin(100, 98, 1, 1);

/**
 * How far past the column's right edge the Tools box reaches on a wide stage, at most, in px: towards the frame's
 * edge, a gutter short of it, and no further than this on a very wide window, so it stays with the story (Elco, 12
 * Nov: "the tool need to move to the edge of the frame").
 */
export const TOOLS_REACH = 144;
/**
 * How much of the Tools box always shows past the right edge of Petals' answer, in px, so the answer is clearly in
 * front of it and the two never read as one (Elco, 12 Nov: "some of it should be more to the right then the edge of
 * the message, establishing a clear separation and silhouette").
 */
export const TOOLS_PAST = 80;
/**
 * Where the Tools box sits on a wide stage, the same in every shot: out on the frame's side as far as it reaches,
 * over the flower, its top level with the headline's and never above it (Elco, 12 Nov: "the top of the tools panel
 * should not be taller than the title"); the words are centred, so where that is comes from the page (`py`).
 */
export const toolsPin = (titleTop: number): Pin => ({
  ...pin(100, 0, 1, 0),
  py: titleTop,
  inFromReach: 0,
});

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
