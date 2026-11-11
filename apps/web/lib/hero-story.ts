// The hero's story, as numbers (HERO ART's V2, approved by Elco 11 Nov: "BRO, 10 OUT OF 10 - LFG!!!! ... get
// this in the hero please"; design/hero-illustration/foreground-script-v2.md), choreographed as motion (HERO
// MOTION, 11 Nov: "this shit will be cinematic"). Six beats, each its own length (BEATS_MS): the question arrives, the
// flower anticipates and answers, the words answer, a quiet hold while the camera breathes, the words leave.
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
/** A moment inside a beat where everything has settled and both lines are in view. */
export const SETTLED_MS = 3600;
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
/** How long the history beat's heights take to move from then to now. */
const HISTORY = { from: 700, ms: 3300 };

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

/** A damped spring that settles at 1 by p = 1, passing it once by about 4%: a petal arriving, not snapping. */
export function spring(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const z = 0.7;
  const w = 10;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * p) * (Math.cos(wd * p) + ((z * w) / wd) * Math.sin(wd * p));
}

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
const STAGGER = 26;

/**
 * Each petal's length. `fresh` is the very first beat on arrival, which grows from the bare centre; round the
 * loop, the first beat closes the last flower first, back round the clock, and opens it again.
 */
export function petalLengths(beat: number, t: number, fresh = false): number[] {
  const before = fresh && beat === 0 ? Array(PETALS).fill(INNER) : settled(prior(beat));
  return Array.from({ length: PETALS }, (_, i) => {
    const from = before[i] as number;
    switch (beat) {
      case 0: {
        const shut = ease.inOutCubic(at(t, (PETALS - 1 - i) * 8, 380));
        const open = spring(at(t, RESPOND_MS + i * STAGGER, 950));
        return lerp(lerp(from, INNER, shut), EVEN, open);
      }
      case 1: {
        // anticipation: the even flower draws in a breath before the heights part
        const breath = 1 - 0.07 * Math.sin(Math.PI * at(t, 200, 480));
        const grown = lerp(from, base[i] as number, spring(at(t, RESPOND_MS + i * STAGGER, 1050)));
        return INNER + (grown - INNER) * breath;
      }
      case 3:
        return lerp(base[i] as number, later[i] as number, historyAt(t));
      case 4:
        return lerp(from, base[i] as number, spring(at(t, 150 + i * 16, 800)));
      default:
        return base[i] as number;
    }
  });
}

/** How far the history beat has gone from then to now, 0 to 1: the marker and the heights move as one. */
export const historyAt = (t: number) => ease.inOutSine(at(t, HISTORY.from, HISTORY.ms));

export interface Camera {
  scale: number;
  /** degrees, about the centre */
  rotate: number;
  /** px down, in the drawing's units */
  y: number;
}

/** A slow push in and back out across a beat, still at both ends so the beats join without a seam. */
const breath = (beat: number, t: number, depth: number) =>
  1 + depth * Math.sin((Math.PI * Math.min(t, beatMs(beat))) / beatMs(beat));

/** The pull back to make room for the communities the last beat leads to, and the push back in after it. */
function pullOf(beat: number, t: number, fresh: boolean): number {
  if (beat === 5) return lerp(1, 0.65, ease.inOutCubic(at(t, RESPOND_MS, 1200)));
  if (beat === 0 && !fresh) return lerp(0.65, 1, ease.inOutCubic(at(t, 0, 1000)));
  return 1;
}

/**
 * The camera on the main flower: it breathes in across every beat, turns a little as the community unfurls, and
 * pulls back at the end.
 */
export function camera(beat: number, t: number, fresh = false): Camera {
  const pull = pullOf(beat, t, fresh);
  // the petals are all at the centre's edge when the turn begins, so it starts from nothing seen
  const rotate =
    beat === 0 && t >= RESPOND_MS ? -16 * (1 - ease.outCubic(at(t, RESPOND_MS, 1900))) : 0;
  return { scale: pull * breath(beat, t, 0.016), rotate, y: (1 - (pull - 0.65) / 0.35) * 8 };
}

/** The light behind the flower: it moves a third as much as the flower does, so the two sit at different depths. */
export function glow(beat: number, t: number, fresh = false) {
  const pull = pullOf(beat, t, fresh);
  const born = fresh && beat === 0 ? ease.outCubic(at(t, 300, 1600)) : 1;
  // the blocs' second key tints the light while they show
  const second =
    beat === 2
      ? ease.outCubic(at(t, RESPOND_MS, 900))
      : beat === 3
        ? 1
        : beat === 4
          ? 1 - ease.outCubic(at(t, 0, 700))
          : 0;
  return { opacity: born, scale: (1 + (pull - 1) * 0.35) * breath(beat, t, 0.006), second };
}

/** The centre: its dot lands, then its ring draws round, the first time only; after that it stays. */
export function centre(beat: number, t: number, fresh = false) {
  if (!(fresh && beat === 0)) return { dot: 1, ring: 1 };
  return { dot: spring(at(t, 150, 700)), ring: ease.inOutCubic(at(t, 380, 700)) };
}

/** A layer that belongs to one beat: it comes in with the flower's answer and goes as the next beat starts. */
export function layerOpacity(own: number, beat: number, t: number): number {
  if (beat === own) return ease.outCubic(at(t, RESPOND_MS, 400));
  if (beat === (own + 1) % 6) return 1 - ease.outCubic(at(t, 0, 450));
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
  return { from, to, k: from === to ? 1 : ease.outCubic(at(t, paintStart(beat, i), 650)) };
}

/** How strongly the highlight is on a petal, 0 to 1: on the strongest few, as their colour lands. */
export function petalLit(beat: number, t: number, i: number): number {
  if (i >= LIT) return 0;
  if (beat === 1 || beat === 5) return ease.outCubic(at(t, paintStart(beat, i) + 250, 600));
  if (beat === 2 || beat === 0) return 1 - ease.outCubic(at(t, 0, 450));
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
  beat === 2 ? ease.inOutCubic(at(t, 1250 + n * 130, 650)) : 1;

/** How far the history beat's earlier outline has drawn round, 0 to 1. */
export const ghostDrawn = (beat: number, t: number, i: number) =>
  beat === 3 ? ease.outCubic(at(t, 450 + i * 20, 700)) : 1;

/** A vote mark inside each petal at the proposal beat: against on every fourth, none on every fifth. */
export const voteOf = (i: number): 'for' | 'against' | null =>
  i % 5 === 0 ? null : i % 4 === 0 ? 'against' : 'for';

/** The proposal's ring, its arc drawn over the top, its point landing, then each vote mark landing round the clock. */
export function proposal(beat: number, t: number) {
  if (beat !== 4) return { ring: 1, arc: 1, point: 1, vote: (_: number) => 1 };
  return {
    ring: ease.outExpo(at(t, RESPOND_MS, 1100)),
    arc: ease.inOutCubic(at(t, 900, 900)),
    point: spring(at(t, 1300, 700)),
    vote: (i: number) => spring(at(t, 1500 + i * 34, 650)),
  };
}

/** The two communities the last beat opens onto: each blooms round the clock, after the line that reaches it. */
export function network(beat: number, t: number) {
  if (beat === 5)
    return {
      link: (n: number) => ease.outCubic(at(t, 1050 + n * 260, 750)),
      bloom: (n: number, j: number) => spring(at(t, 1400 + n * 260 + j * 32, 800)),
      // the dashes run outward, towards the communities, a dash's length each second
      flow: -t * 0.009,
      scale: 1,
    };
  if (beat === 0)
    return {
      link: () => 1,
      bloom: () => 1,
      flow: -(beatMs(5) + t) * 0.009,
      scale: 1 - 0.25 * ease.inCubic(at(t, 0, 450)),
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
    opacity: ease.outCubic(at(u, start, 450)) * (1 - 0.5 * answered) * (1 - leave),
    x: -26 * (1 - inQ),
    y: 10 * (1 - inQ) - 16 * leave,
    blur: 8 * (1 - inQ) + 0.6 * answered + 6 * leave,
    scale: 0.94 + 0.06 * inQ - 0.02 * answered,
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
