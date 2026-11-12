// The hero's story, as numbers (HERO ART's V2, approved by Elco 11 Nov: "BRO, 10 OUT OF 10 - LFG!!!! ... get
// this in the hero please"; design/hero-illustration/foreground-script-v2.md), choreographed as motion (HERO
// MOTION, 11 Nov: "this shit will be cinematic"), shot as one take (Elco, 12 Nov: no seams, the camera never stops,
// the next question arrives while the flower is still settling). Six beats, each its own length (BEATS_MS): the
// question arrives, the flower answers and takes the rest of its beat to come to rest, the words answer and leave;
// the flower is still settling under the next question (CARRY_MS), and nothing bounces.
// Everything a frame draws is a pure function of the beat and the time into it, so choosing a beat settles it at
// once, a test can read any moment, and a video can be rendered frame by frame from the same numbers. The flower
// is a symbol, not a reading: no network, no counts. Heights stay linear and widths equal (the art direction's
// brief); the motion only decides how each state is reached.

/**
 * How long each beat lasts, from its question arriving to its answer leaving (Elco, 11 Nov: "focus on the timing
 * of each section"). The opening and the close hold longest; the middle beats keep the pace up; the history beat
 * has time to travel.
 */
export const BEATS_MS: readonly number[] = [6600, 5600, 5800, 6800, 6000, 7200];
/** The longest beat, for whatever needs one number. */
export const BEAT_MS = Math.max(...BEATS_MS);
export const beatMs = (beat: number) => BEATS_MS[beat] ?? BEAT_MS;
/**
 * How far past its beat's end the flower is still coming to rest, under the next question: each beat starts from
 * the last one as it is at that moment, so nothing is reset.
 */
export const CARRY_MS = 600;
/** A moment late in a beat where both lines are in view and the flower is all but at rest: a chosen beat stops here. */
export const settledMs = (beat: number) => beatMs(beat) - 1200;
/** When the flower starts its answer: while the question is still landing, so the shape answers first. */
const RESPOND_MS = 600;
/** The question on arrival waits for the centre to land; after that each question comes in at once. */
const QUESTION_FRESH_MS = 300;
const ANSWER_MS = 1500;
/** How long before its beat ends a question leaves, and its answer after it; the answer's exit runs into the next beat. */
const QUESTION_LEAVES_MS = 700;
const ANSWER_LEAVES_MS = 450;
/** How far into the next beat an answer is still leaving, while the next question comes in. */
export const OVERLAP_MS = 300;
/** When the history beat's heights start moving from then to now; they travel the rest of the beat. */
const HISTORY_FROM = 700;

export const PETALS = 24;
/** Where the petals start: the centre's edge. */
export const INNER = 36;
/** Every petal's length when the community first opens, all equal. */
const EVEN = 106;
/** Half the line between two petals: the same width from foot to tip (Elco, 5 Nov: "a relatively stable line"). */
export const GUTTER = 1.5;

/** Tallest at twelve o'clock, then shorter around the clock: the same symbolic sequence the earlier hero drew. */
const shares = Array.from({ length: PETALS }, (_, i) => 0.3 + 0.7 * (1 - i / (PETALS - 1)) ** 1.8);
/** Each petal's length once influence shows. */
const base = shares.map((s) => 43 + s * 128);
/** The same petals at the history beat's "now": another balance, the positions kept. */
const later = shares.map((_, i) => 49 + (shares[(i + 7) % PETALS] as number) * 119);
export const ghostLengths: readonly number[] = base;

// ----- time -----

const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** 0 to 1 from `start` over `ms`. */
const at = (t: number, start: number, ms: number) => clamp((t - start) / ms);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** The curves every move is drawn with. */
export const ease = {
  outCubic: (p: number) => 1 - (1 - p) ** 3,
  inCubic: (p: number) => p ** 3,
  inOutCubic: (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  outExpo: (p: number) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  inOutSine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
};

/** How soon a move comes to rest: the higher, the sooner. */
const WEIGHT = 6;
const REST = 1 - (1 + WEIGHT) * Math.exp(-WEIGHT);

/**
 * A weight coming to rest (Elco, 12 Nov: one take, no bounce): it starts gently, covers most of the way early, then
 * settles slowly, and never passes its end.
 */
export function settle(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return (1 - (1 + WEIGHT * p) * Math.exp(-WEIGHT * p)) / REST;
}

/** A move that starts at `start` and comes to rest as the next beat's question lands. */
const grow = (beat: number, t: number, start: number) =>
  settle(at(t, start, beatMs(beat) + CARRY_MS - start));

/** The beat before this one, round the loop. */
const prior = (beat: number) => (beat + 5) % 6;

// ----- the flower -----

/** Each petal's length once a beat has settled, which is where the next beat starts from. */
function settled(beat: number): readonly number[] {
  if (beat === 0) return Array(PETALS).fill(EVEN);
  if (beat === 3) return later;
  return base;
}

/** Per petal, how much later than its neighbour before it (clockwise from twelve) it moves. */
const STAGGER = 40;

/**
 * Each petal's length. `fresh` is the very first beat on arrival, which grows from the bare centre; round the
 * loop, the first beat closes the last flower first, back round the clock, and opens it again. Every other beat
 * starts from the last one as it is, still coming to rest for its first CARRY_MS.
 */
export function petalLengths(beat: number, t: number, fresh = false): number[] {
  const last = prior(beat);
  const before =
    fresh && beat === 0
      ? Array(PETALS).fill(INNER)
      : t < CARRY_MS
        ? petalLengths(last, beatMs(last) + t, fresh)
        : settled(last);
  return Array.from({ length: PETALS }, (_, i) => {
    const from = before[i] as number;
    switch (beat) {
      case 0: {
        const shut = ease.inOutCubic(at(t, (PETALS - 1 - i) * 14, 700));
        const open = grow(0, t, RESPOND_MS + i * STAGGER);
        return lerp(lerp(from, INNER, shut), EVEN, open);
      }
      case 1: {
        // anticipation: the even flower draws in a breath before the heights part
        const breath = 1 - 0.07 * Math.sin(Math.PI * at(t, 200, 480));
        const grown = lerp(from, base[i] as number, grow(1, t, RESPOND_MS + i * STAGGER));
        return INNER + (grown - INNER) * breath;
      }
      case 3:
        return lerp(from, later[i] as number, historyAt(t));
      case 4:
        return lerp(from, base[i] as number, grow(4, t, 150 + i * 24));
      default:
        return from;
    }
  });
}

/**
 * How far the history beat has gone from then to now, 0 to 1: the marker and the heights move as one, across the
 * whole beat, arriving under the next question.
 */
export const historyAt = (t: number) =>
  ease.inOutSine(at(t, HISTORY_FROM, beatMs(3) + CARRY_MS - HISTORY_FROM));

/** Where the history beat's marker is, in any beat: it keeps travelling into the next while it fades. */
export const historyLine = (beat: number, t: number) =>
  beat === 3 ? historyAt(t) : beat === 4 ? historyAt(beatMs(3) + t) : 0;

export interface Camera {
  scale: number;
  /** degrees, about the centre */
  rotate: number;
  /** px down, in the drawing's units */
  y: number;
}

/** The pull back to make room for the communities the last beat leads to, and the push back in after it. */
function pullOf(beat: number, t: number, fresh: boolean): number {
  if (beat === 5) return lerp(1, 0.65, ease.inOutCubic(at(t, RESPOND_MS, 2600)));
  if (beat === 0 && !fresh) return lerp(0.65, 1, ease.inOutCubic(at(t, 0, 2400)));
  return 1;
}

/**
 * The camera on the main flower, inside its drawing: it turns a little as the community unfurls, and pulls back
 * slowly at the end. Its travel across the stage, which never stops, is the shots' (lib/hero-shots.ts).
 */
export function camera(beat: number, t: number, fresh = false): Camera {
  const pull = pullOf(beat, t, fresh);
  // the petals are all at the centre's edge when the turn begins, so it starts from nothing seen
  const rotate =
    beat === 0 && t >= RESPOND_MS ? -16 * (1 - ease.outCubic(at(t, RESPOND_MS, 3000))) : 0;
  return { scale: pull, rotate, y: (1 - (pull - 0.65) / 0.35) * 8 };
}

/** The light behind the flower: it moves a third as much as the flower does, so the two sit at different depths. */
export function glow(beat: number, t: number, fresh = false) {
  const pull = pullOf(beat, t, fresh);
  const born = fresh && beat === 0 ? ease.outCubic(at(t, 300, 1600)) : 1;
  // the blocs' second key tints the light while they show
  const second =
    beat === 2
      ? ease.outCubic(at(t, RESPOND_MS, 1400))
      : beat === 3
        ? 1
        : beat === 4
          ? 1 - ease.outCubic(at(t, 0, 1200))
          : 0;
  return { opacity: born, scale: 1 + (pull - 1) * 0.35, second };
}

/** The centre: its dot lands, then its ring draws round, the first time only; after that it stays. */
export function centre(beat: number, t: number, fresh = false) {
  if (!(fresh && beat === 0)) return { dot: 1, ring: 1 };
  return { dot: settle(at(t, 150, 900)), ring: ease.inOutCubic(at(t, 380, 900)) };
}

/** A layer that belongs to one beat: it comes in with the flower's answer and goes as the next beat starts. */
export function layerOpacity(own: number, beat: number, t: number): number {
  if (beat === own) return ease.outCubic(at(t, RESPOND_MS, 700));
  if (beat === (own + 1) % 6) return 1 - ease.outCubic(at(t, 0, 800));
  return 0;
}

export type Fill = 'petal' | 'accent' | 'second';

const LIT = 3;
const BLOC_A = [0, 1, 8, 9, 16, 17];
const BLOC_B = [4, 5, 12, 13, 20, 21];

/** What each petal is painted with once a beat has settled: the few that carry the most, or two groups. */
export function petalFill(beat: number, i: number): Fill {
  if (beat === 1 || beat === 5) return i < LIT ? 'accent' : 'petal';
  if (beat === 2 || beat === 3)
    return BLOC_A.includes(i) ? 'accent' : BLOC_B.includes(i) ? 'second' : 'petal';
  return 'petal';
}

/** When a petal's colour starts to change in a beat: the strongest one by one, the blocs one group then the other. */
function paintStart(beat: number, i: number): number {
  if (beat === 0) return (PETALS - 1 - i) * 8;
  if (beat === 1 || beat === 5) return 1100 + i * 110;
  if (beat === 2) {
    const a = BLOC_A.indexOf(i);
    const b = BLOC_B.indexOf(i);
    if (a >= 0) return RESPOND_MS + a * 80;
    if (b >= 0) return RESPOND_MS + 420 + b * 80;
    return RESPOND_MS;
  }
  return 200 + i * 12;
}

/** A petal's paint at a moment: from the last beat's colour to this one's, `k` of the way. */
export function petalPaint(beat: number, t: number, i: number, fresh = false) {
  const from: Fill = fresh && beat === 0 ? 'petal' : petalFill(prior(beat), i);
  const to = petalFill(beat, i);
  return { from, to, k: from === to ? 1 : ease.outCubic(at(t, paintStart(beat, i), 900)) };
}

/** How strongly the highlight is on a petal, 0 to 1: on the strongest few, as their colour lands. */
export function petalLit(beat: number, t: number, i: number): number {
  if (i >= LIT) return 0;
  if (beat === 1 || beat === 5) return ease.outCubic(at(t, paintStart(beat, i) + 250, 800));
  if (beat === 2 || beat === 0) return 1 - ease.outCubic(at(t, 0, 800));
  return 0;
}

/** The petals the voting blocs' few inner lines join. */
export const relations: readonly (readonly [number, number])[] = [
  [0, 8],
  [1, 9],
  [8, 16],
  [9, 17],
  [4, 12],
  [5, 13],
];

/** How far each of the blocs' lines has drawn itself, 0 to 1: after the colours, one after another. */
export const relationDrawn = (beat: number, t: number, n: number) =>
  beat === 2 ? ease.inOutCubic(at(t, 1250 + n * 160, 900)) : 1;

/** How far the history beat's earlier outline has drawn round, 0 to 1. */
export const ghostDrawn = (beat: number, t: number, i: number) =>
  beat === 3 ? ease.outCubic(at(t, 450 + i * 24, 900)) : 1;

/** A vote mark inside each petal at the proposal beat: against on every fourth, none on every fifth. */
export const voteOf = (i: number): 'for' | 'against' | null =>
  i % 5 === 0 ? null : i % 4 === 0 ? 'against' : 'for';

/** The proposal's ring, its arc drawn over the top, its point landing, then each vote mark landing round the clock. */
export function proposal(beat: number, t: number) {
  if (beat !== 4) return { ring: 1, arc: 1, point: 1, vote: (_: number) => 1 };
  return {
    ring: ease.outExpo(at(t, RESPOND_MS, 1400)),
    arc: ease.inOutCubic(at(t, 900, 1100)),
    point: settle(at(t, 1300, 1000)),
    vote: (i: number) => settle(at(t, 1500 + i * 40, 1100)),
  };
}

/** The two communities the last beat opens onto: each blooms round the clock, after the line that reaches it. */
export function network(beat: number, t: number) {
  if (beat === 5)
    return {
      link: (n: number) => ease.outCubic(at(t, 1050 + n * 300, 1100)),
      bloom: (n: number, j: number) => settle(at(t, 1400 + n * 300 + j * 36, 1400)),
      // the dashes run outward, towards the communities, a dash's length each second
      flow: -t * 0.009,
      scale: 1,
    };
  if (beat === 0)
    return {
      link: () => 1,
      bloom: () => 1,
      flow: -(beatMs(5) + t) * 0.009,
      scale: 1 - 0.25 * ease.inCubic(at(t, 0, 800)),
    };
  return { link: () => 1, bloom: () => 1, flow: 0, scale: 1 };
}

// ----- the words -----

export interface Motion {
  opacity: number;
  x: number;
  y: number;
  blur: number;
  scale: number;
  /** degrees it is turned to face the flower; it swings in wider and settles */
  turn: number;
  /** px towards the viewer */
  z: number;
  /** how far a glint has crossed its glass, 0 to 1 */
  glint: number;
  /** how bright its rim is, 0 to 1 */
  glow: number;
}

/**
 * The question, `u` into its beat (past its end while it leaves): it comes in from its side and sharpens; once
 * answered it steps back, dimmer and a little soft, as a camera racks focus; it lifts away before its beat ends.
 */
export function question(beat: number, u: number, fresh = false): Motion {
  const start = fresh && beat === 0 ? QUESTION_FRESH_MS : 0;
  const inQ = ease.outExpo(at(u, start, 900));
  const answered = ease.outCubic(at(u, ANSWER_MS - 150, 700));
  const leave = ease.inOutCubic(at(u, beatMs(beat) - QUESTION_LEAVES_MS, 550));
  return {
    opacity: ease.outCubic(at(u, start, 450)) * (1 - 0.45 * answered) * (1 - leave),
    x: -26 * (1 - inQ),
    y: 10 * (1 - inQ) - 16 * leave,
    blur: 8 * (1 - inQ) + 0.6 * answered + 6 * leave,
    scale: 0.94 + 0.06 * inQ - 0.02 * answered,
    // it swings in like a door, rests turned a little to the flower, and is pushed back once answered
    turn: 15 + 26 * (1 - settle(at(u, start, 1300))) + 10 * leave,
    z: 40 - 90 * answered - 60 * leave,
    glint: at(u, start + 300, 1000),
    glow: ease.outCubic(at(u, start, 700)) * (1 - 0.5 * answered),
  };
}

/** The answer, `u` into its beat: it comes in from the other side as the flower finishes, and leaves last. */
export function answer(beat: number, u: number): Motion {
  const inA = ease.outExpo(at(u, ANSWER_MS - 150, 1000));
  const leave = ease.inOutCubic(
    at(u, beatMs(beat) - ANSWER_LEAVES_MS, ANSWER_LEAVES_MS + OVERLAP_MS),
  );
  return {
    opacity: ease.outCubic(at(u, ANSWER_MS - 150, 400)) * (1 - leave),
    x: 26 * (1 - inA),
    y: 10 * (1 - inA) - 16 * leave,
    blur: 6 * leave,
    scale: 0.94 + 0.06 * inA,
    turn: 13 + 30 * (1 - settle(at(u, ANSWER_MS - 150, 1400))) + 12 * leave,
    z: 80 - 50 * leave,
    glint: at(u, ANSWER_MS + 300, 1100),
    glow: ease.outCubic(at(u, ANSWER_MS - 100, 900)),
  };
}

/** One word of the answer, `j` from its start: it rises into place and sharpens, a little after the one before. */
export function answerWord(u: number, j: number) {
  const start = ANSWER_MS + j * 55;
  const p = ease.outExpo(at(u, start, 900));
  return { opacity: ease.outCubic(at(u, start, 450)), y: 14 * (1 - p), blur: 6 * (1 - p) };
}

// ----- the shapes -----

type Point = [number, number];
const point = (r: number, a: number): Point => [Math.cos(a) * r, Math.sin(a) * r];
const n2 = (x: number) => x.toFixed(2);
const p2 = ([x, y]: Point) => `${n2(x)} ${n2(y)}`;

/**
 * A petal from `inner` to `outer`: two straight sides, each `gutter` in from its edge of the angle so the line
 * between neighbours keeps one width, its top and foot on the circle's arcs (Elco, 11 Nov). `round` softens its
 * four corners, for the highlight, never by more than half the petal's height.
 */
export function petalPath(
  i: number,
  outer: number,
  { inner = INNER, count = PETALS, gutter = GUTTER, round = 0 } = {},
): string {
  const step = (2 * Math.PI) / count;
  const a = -Math.PI / 2 + i * step;
  const b = a + step;
  const r = Math.max(inner + 0.05, outer);
  const left = (rho: number) => a + Math.asin(Math.min(1, gutter / rho));
  const right = (rho: number) => b - Math.asin(Math.min(1, gutter / rho));
  const c = Math.max(0, Math.min(round, (r - inner) / 2));
  if (c < 0.05) {
    return `M${p2(point(inner, left(inner)))} L${p2(point(r, left(r)))} A${n2(r)} ${n2(r)} 0 0 1 ${p2(point(r, right(r)))} L${p2(point(inner, right(inner)))} A${inner} ${inner} 0 0 0 ${p2(point(inner, left(inner)))}Z`;
  }
  // each corner cut back by c along both its edges, and turned with a curve through the corner itself
  const footL = point(inner, left(inner));
  const tipL = point(r, left(r));
  const tipR = point(r, right(r));
  const footR = point(inner, right(inner));
  const along = (from: Point, to: Point): Point => {
    const l = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    return [from[0] + ((to[0] - from[0]) * c) / l, from[1] + ((to[1] - from[1]) * c) / l];
  };
  const tipLa = point(r, left(r) + c / r);
  const tipRa = point(r, right(r) - c / r);
  const footRa = point(inner, right(inner) - c / inner);
  const footLa = point(inner, left(inner) + c / inner);
  return [
    `M${p2(along(footL, tipL))}`,
    `L${p2(along(tipL, footL))}`,
    `Q${p2(tipL)} ${p2(tipLa)}`,
    `A${n2(r)} ${n2(r)} 0 0 1 ${p2(tipRa)}`,
    `Q${p2(tipR)} ${p2(along(tipR, footR))}`,
    `L${p2(along(footR, tipR))}`,
    `Q${p2(footR)} ${p2(footRa)}`,
    `A${inner} ${inner} 0 0 0 ${p2(footLa)}`,
    `Q${p2(footL)} ${p2(along(footL, tipL))}Z`,
  ].join(' ');
}

/** A point at a petal's middle angle, `r` from the centre. */
export function atPetal(i: number, r: number): [number, number] {
  const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / PETALS;
  return [Math.cos(a) * r, Math.sin(a) * r];
}
