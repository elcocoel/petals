// The hero's story, as numbers (HERO ART's V2, approved by Elco 11 Nov: "BRO, 10 OUT OF 10 - LFG!!!! ... get
// this in the hero please"; design/hero-illustration/foreground-script-v2.md), cut to a beat (Elco, 12 Nov: "boom,
// action, reaction, beat, counterbeats, call, response, fast, something slow, fast, fast, fast, boom, boom, boom
// ... we need pulse ... think musically, almost like to the beat of rap"). One tempo drives everything: each story
// beat is a phrase of bars and every move lands on a count. On the one, the cut and the call: the camera whips to
// its shot and the question slams in. A rest to read it. On the three, the reaction: the flower hits, and fast
// accents follow it. On the next bar's one, the response: the answer, a word on every thirty-second. A hold where
// only the pulse moves, and the words cut out on the next one. The history beat is the slow one: its heights travel
// a whole bar and land on a boom. Under it all the light thumps on every count, harder on one and three.
// And it is organic, never dead still (Elco, 12 Nov: "ins and outs and elastic or sine wave ... not just bursts";
// "completely stopped needs to be an exception"): each hit winds up before it and lands elastic, wobbling onto its
// mark; exits dip before they go; and between the hits the petals ripple in a slow wave round the clock, the
// flower thumps with the pulse, the words float and the camera keeps drifting.
// Everything a frame draws is a pure function of the beat and the time into it, so choosing a beat settles it at
// once, a test can read any moment, and a video can be rendered frame by frame from the same numbers. The flower
// is a symbol, not a reading: no network, no counts. Heights stay linear and widths equal (the art direction's
// brief); the motion only decides how each state is reached.

/** The tempo, a rap beat's: every time below is counted in it. */
export const BPM = 112;
/** One count (a quarter note), in ms. */
export const COUNT_MS = 60000 / BPM;
/** Where a count falls in its story beat: 1 is the downbeat, 3.5 the and of three, 5 the second bar's one. */
const count = (c: number) => (c - 1) * COUNT_MS;
const EIGHTH = COUNT_MS / 2;
const SIXTEENTH = COUNT_MS / 4;
const THIRTYSECOND = COUNT_MS / 8;
/** How long an elastic landing takes, from the hit to still on its mark. */
const SPRING_MS = 3 * EIGHTH;
/** How long a wind-up before a hit takes. */
const WIND_MS = SIXTEENTH;
/** How far the petals ripple either way, in the drawing's units, as a wave goes round the clock once a bar. */
const RIPPLE = 1.4;
/** Per petal, how much later than its neighbour before it (clockwise from twelve) it lands: a roll round the clock. */
const ROLL = 12;

/** How many bars each story beat lasts: the history beat is the slow one. */
const BARS: readonly number[] = [2, 2, 2, 3, 2, 2];
export const BEATS_MS: readonly number[] = BARS.map((bars) => bars * 4 * COUNT_MS);
/** The longest beat, for whatever needs one number. */
export const BEAT_MS = Math.max(...BEATS_MS);
export const beatMs = (beat: number) => BEATS_MS[beat] ?? BEAT_MS;
/** When each beat starts on one clock round the whole story, for what keeps going across the beats. */
export const startOf = (beat: number) => BEATS_MS.slice(0, beat).reduce((sum, ms) => sum + ms, 0);
/** The last count of a beat, before the words cut out: both lines in view, the flower at rest. A chosen beat stops here. */
export const settledMs = (beat: number) => beatMs(beat) - COUNT_MS;

/** The call lands on the one; on arrival on the two, after the centre's boom. */
const CALL = count(1);
const CALL_FRESH = count(2);
/** The reaction: the flower hits on the three. */
const REACT = count(3);
/** The response: the answer lands on the second bar's one. */
const RESPOND = count(5);
/** How far into the next beat the answer is still cutting out, as the next question slams in. */
export const OVERLAP_MS = SIXTEENTH;

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
  inSine: (p: number) => 1 - Math.cos((Math.PI * p) / 2),
  outSine: (p: number) => Math.sin((Math.PI * p) / 2),
  inOutSine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  /** an exit: it dips back a little first, then goes */
  backIn: (p: number) => p * p * (2.2 * p - 1.2),
};

/**
 * An elastic landing: from still, fast to its mark, past it, back, and onto it by p = 1. `damping` says how much it
 * wobbles: 0.5 passes by about a sixth and swings back once; 0.7 only nudges past.
 */
export function spring(p: number, damping = 0.5): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const w = 5.5 / damping;
  const wd = w * Math.sqrt(1 - damping * damping);
  const decay = Math.exp(-damping * w * p);
  return 1 - decay * (Math.cos(wd * p) + ((damping * w) / wd) * Math.sin(wd * p));
}

/** A petal, a bloom, a word: an elastic pop. */
const pop = (t: number, start: number, ms = SPRING_MS) => spring(at(t, start, ms));

/** The wind-up before a hit at `start`, 0 to 1: drawn in over a sixteenth, let go as the hit comes. */
const windUp = (t: number, start: number) =>
  ease.inSine(at(t, start - WIND_MS, WIND_MS)) * (1 - ease.outCubic(at(t, start, WIND_MS)));

/** The beat before this one, round the loop. */
const prior = (beat: number) => (beat + 5) % 6;

/**
 * The hits that punch the camera in, per beat, as [count, how hard]: the reaction on the three, its accents, the
 * response on the five.
 */
const KICKS: readonly (readonly (readonly [number, number])[])[] = [
  // a community: the last one implodes on the one, the new one bursts on the three
  [
    [1, 0.03],
    [3, 0.05],
    [5, 0.015],
  ],
  // influence: the heights part on the three, then the strongest three light, boom, boom, boom
  [
    [3, 0.04],
    [3.5, 0.02],
    [4, 0.02],
    [4.5, 0.025],
    [5, 0.015],
  ],
  // blocs: one group on the three, the other answers on the four
  [
    [3, 0.035],
    [4, 0.035],
    [5, 0.015],
  ],
  // history: the slow travel lands on the third bar's one
  [
    [3, 0.015],
    [5, 0.015],
    [9, 0.055],
  ],
  // a vote: the ring on the three, its point on the four
  [
    [3, 0.03],
    [4, 0.03],
    [5, 0.015],
  ],
  // connections: pulled back on the one, then each community blooms
  [
    [1, 0.03],
    [3.5, 0.04],
    [4.5, 0.04],
    [5, 0.015],
  ],
];
/** On arrival: the centre lands on the one, the flower bursts on the three. */
const FRESH_KICKS: readonly (readonly [number, number])[] = [
  [1, 0.02],
  [3, 0.05],
  [5, 0.015],
];

/**
 * How much the camera is punched in at a moment, from 0: before each hit it eases back a little (the wind-up), on
 * the hit it punches in, and the punch dies away in a wobble. A hit on the one has no wind-up: that is the cut.
 */
export function kick(beat: number, t: number, fresh = false): number {
  const hits = fresh && beat === 0 ? FRESH_KICKS : (KICKS[beat] ?? []);
  let k = 0;
  for (const [c, amp] of hits) {
    const d = t - count(c);
    const back = c > 1 ? 0.35 : 0;
    if (d < 0) {
      k -= back * amp * ease.inSine(Math.max(0, (d + WIND_MS) / WIND_MS));
      continue;
    }
    const punch = (1 - Math.exp(-d / 25)) * Math.exp(-d / 170) * Math.cos(d / 95);
    k += amp * (punch - back * Math.exp(-d / 25));
  }
  return k;
}

/** The pulse under it all, 0 to 1: a thump on every count, the one and the three harder than the two and the four. */
export function pulse(t: number): number {
  const n = Math.floor(t / COUNT_MS);
  const d = t - n * COUNT_MS;
  return (n % 2 === 0 ? 1 : 0.5) * Math.min(1, d / 25) * Math.exp(-d / (0.3 * COUNT_MS));
}

// ----- the flower -----

/** Each petal's length once a beat has settled, which is where the next beat starts from. */
function settled(beat: number): readonly number[] {
  if (beat === 0) return Array(PETALS).fill(EVEN);
  if (beat === 3) return later;
  return base;
}

/** A petal's shape as the beat has it, before the ripple. */
function shaped(beat: number, t: number, i: number, from: number): number {
  switch (beat) {
    case 0: {
      // the last flower implodes on the one, and the new one bursts out on the three, rolling round the clock
      const shut = ease.inCubic(at(t, CALL, SIXTEENTH * 1.5));
      const open = pop(t, REACT + i * ROLL);
      return lerp(lerp(from, INNER, shut), EVEN, open);
    }
    case 1: {
      // the even flower draws in on the and of two, holds its breath, and the heights burst apart on the three
      const held = ease.inCubic(at(t, count(2.5), EIGHTH)) * (1 - at(t, REACT, SIXTEENTH));
      const grown = lerp(from, base[i] as number, pop(t, REACT + i * (ROLL / 2)));
      return INNER + (grown - INNER) * (1 - 0.1 * held);
    }
    case 3:
      return lerp(from, later[i] as number, historyAt(t));
    case 4: {
      const start = REACT + i * (ROLL / 2);
      const r = lerp(from, base[i] as number, pop(t, start));
      return INNER + (r - INNER) * (1 - 0.06 * windUp(t, start));
    }
    default:
      return base[i] as number;
  }
}

/**
 * Each petal's length. `fresh` is the very first beat on arrival, which bursts from the bare centre; round the
 * loop, the first beat implodes the last flower on the one and bursts it open again on the three. Over it all a
 * slow wave runs round the clock once a bar, the longer the petal the more it ripples, on one clock across the
 * beats so it never jumps.
 */
export function petalLengths(beat: number, t: number, fresh = false): number[] {
  const before = fresh && beat === 0 ? Array(PETALS).fill(INNER) : settled(prior(beat));
  const wave = (2 * Math.PI * (startOf(beat) + t)) / (4 * COUNT_MS);
  return Array.from({ length: PETALS }, (_, i) => {
    const r = shaped(beat, t, i, before[i] as number);
    const reach = Math.min(1, Math.max(0, (r - INNER) / 60));
    return r + RIPPLE * reach * Math.sin(wave - (2 * Math.PI * i) / PETALS);
  });
}

/** When the history beat's heights land: the third bar's one. */
const LAND = count(9);

/**
 * How far the history beat has gone from then to now, 0 to 1: the slow one. It sets off with the answer, gathers
 * speed through the whole second bar, lands hard on the third bar's one and wobbles there a moment.
 */
export function historyAt(t: number): number {
  if (t < LAND) return ease.inSine(at(t, RESPOND, LAND - RESPOND));
  const d = t - LAND;
  return 1 + 0.08 * Math.exp(-d / 160) * Math.sin(d / 70);
}

/** Where the history beat's marker is, in any beat: arrived, while it cuts out on the next one. */
export const historyLine = (beat: number, t: number) =>
  beat === 3 ? historyAt(t) : beat === 4 ? 1 : 0;

export interface Camera {
  scale: number;
  /** degrees, about the centre */
  rotate: number;
  /** px down, in the drawing's units */
  y: number;
}

/** The pull back on the one to make room for the communities the last beat leads to, and the push back in after it. */
function pullOf(beat: number, t: number, fresh: boolean): number {
  if (beat === 5) return lerp(1, 0.65, spring(at(t, CALL, 1.5 * COUNT_MS), 0.75));
  if (beat === 0 && !fresh) return lerp(0.65, 1, spring(at(t, CALL, 1.5 * COUNT_MS), 0.75));
  return 1;
}

/** The camera on the main flower, inside its drawing: a twist as the community bursts open, the pull back at the end. */
export function camera(beat: number, t: number, fresh = false): Camera {
  const pull = pullOf(beat, t, fresh);
  // the petals are all at the centre's edge when the twist begins, so it starts from nothing seen
  const rotate =
    beat === 0 && t >= REACT ? -16 * (1 - spring(at(t, REACT, 1.5 * COUNT_MS), 0.6)) : 0;
  return { scale: pull, rotate, y: (1 - (pull - 0.65) / 0.35) * 8 };
}

/** The light behind the flower: it moves a third as much as the flower does, and thumps with the pulse. */
export function glow(beat: number, t: number, fresh = false) {
  const pull = pullOf(beat, t, fresh);
  const born = fresh && beat === 0 ? ease.outCubic(at(t, CALL, 2 * COUNT_MS)) : 1;
  // the blocs' second key tints the light while they show, from the second group's hit
  const second =
    beat === 2
      ? ease.outCubic(at(t, count(4), EIGHTH))
      : beat === 3
        ? 1
        : beat === 4
          ? 1 - ease.outCubic(at(t, CALL, EIGHTH))
          : 0;
  const thump = pulse(t) + 8 * kick(beat, t, fresh);
  return {
    opacity: born * Math.min(1, 0.78 + 0.22 * thump),
    scale: (1 + (pull - 1) * 0.35) * (1 + 0.02 * thump),
    second,
  };
}

/** The centre: its dot lands on the one, its ring snaps round on the and; the first time only, after that it stays. */
export function centre(beat: number, t: number, fresh = false) {
  if (!(fresh && beat === 0)) return { dot: 1, ring: 1 };
  return { dot: pop(t, CALL), ring: ease.inOutCubic(at(t, count(1.5), 1.5 * EIGHTH)) };
}

/** A layer that belongs to one beat: it snaps in with the flower's reaction and cuts out on the next one. */
export function layerOpacity(own: number, beat: number, t: number): number {
  if (beat === own) return ease.outCubic(at(t, REACT, SIXTEENTH));
  if (beat === (own + 1) % 6) return 1 - ease.outCubic(at(t, CALL, EIGHTH));
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

/**
 * When a petal's colour hits in a beat: the strongest three one on each eighth after the heights (boom, boom,
 * boom), quicker on sixteenths when they come back at the end; one bloc on the three, the other on the four; the
 * rest on the cut.
 */
function paintStart(beat: number, i: number): number {
  if (beat === 1) return count(3.5) + i * EIGHTH;
  if (beat === 5) return count(2) + i * SIXTEENTH;
  if (beat === 2) return BLOC_B.includes(i) ? count(4) : REACT;
  return CALL;
}

/** A petal's paint at a moment: from the last beat's colour to this one's, `k` of the way. */
export function petalPaint(beat: number, t: number, i: number, fresh = false) {
  const from: Fill = fresh && beat === 0 ? 'petal' : petalFill(prior(beat), i);
  const to = petalFill(beat, i);
  return { from, to, k: from === to ? 1 : ease.outCubic(at(t, paintStart(beat, i), SIXTEENTH)) };
}

/** How strongly the highlight is on a petal, 0 to 1: on the strongest few, as their colour hits. */
export function petalLit(beat: number, t: number, i: number): number {
  if (i >= LIT) return 0;
  if (beat === 1 || beat === 5) return ease.outCubic(at(t, paintStart(beat, i), SIXTEENTH));
  if (beat === 2 || beat === 0) return 1 - ease.outCubic(at(t, CALL, SIXTEENTH));
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

/** How far each of the blocs' lines has drawn itself, 0 to 1: after the second group, fast, one on each thirty-second. */
export const relationDrawn = (beat: number, t: number, n: number) =>
  beat === 2 ? ease.outExpo(at(t, count(4.5) + n * THIRTYSECOND, EIGHTH)) : 1;

/** How far the history beat's earlier outline has drawn round, 0 to 1: snapped round on the three. */
export const ghostDrawn = (beat: number, t: number, i: number) =>
  beat === 3 ? ease.outExpo(at(t, REACT + i * 10, EIGHTH)) : 1;

/** A vote mark inside each petal at the proposal beat: against on every fourth, none on every fifth. */
export const voteOf = (i: number): 'for' | 'against' | null =>
  i % 5 === 0 ? null : i % 4 === 0 ? 'against' : 'for';

/** The proposal's ring whips round on the three, its arc on the and, its point hits on the four, the votes roll in. */
export function proposal(beat: number, t: number) {
  if (beat !== 4) return { ring: 1, arc: 1, point: 1, vote: (_: number) => 1 };
  return {
    ring: ease.outExpo(at(t, REACT, EIGHTH)),
    arc: ease.outExpo(at(t, count(3.5), EIGHTH)),
    point: pop(t, count(4)),
    // a roll, a vote on every forty-eighth, round the clock
    vote: (i: number) => pop(t, count(4.5) + (i * COUNT_MS) / 12, 2 * EIGHTH),
  };
}

/** The two communities the last beat opens onto: a line shoots out on the three, its community bursts on the and. */
export function network(beat: number, t: number) {
  if (beat === 5)
    return {
      link: (n: number) => ease.outExpo(at(t, REACT + n * COUNT_MS, EIGHTH)),
      bloom: (n: number, j: number) => pop(t, count(3.5) + n * COUNT_MS + j * 10),
      // the dashes run outward, towards the communities, a dash's length each second
      flow: -t * 0.009,
      scale: 1,
    };
  if (beat === 0)
    return {
      link: () => 1,
      bloom: () => 1,
      flow: -(beatMs(5) + t) * 0.009,
      scale: 1 - 0.25 * ease.inCubic(at(t, CALL, EIGHTH)),
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

/** How far a bubble floats up and down while it is on, in px, once every two bars; and how far it sways, in degrees. */
const FLOAT_PX = 3;
const SWAY = 1.5;
const float = (u: number, phase: number) => Math.sin((Math.PI * u) / (4 * COUNT_MS) + phase);

/**
 * The question, `u` into its beat: the call. It springs in on the one from its side; once answered it eases back,
 * dimmer and a little soft, as a camera racks focus; it floats while it is on; it dips and is gone on the last and.
 */
export function question(beat: number, u: number, fresh = false): Motion {
  const start = fresh && beat === 0 ? CALL_FRESH : CALL;
  const inQ = spring(at(u, start, SPRING_MS), 0.6);
  const answered = ease.inOutSine(at(u, RESPOND - SIXTEENTH, EIGHTH));
  const out = at(u, beatMs(beat) - 1.5 * EIGHTH, 1.3 * EIGHTH);
  const leave = ease.inCubic(out);
  return {
    opacity: ease.outCubic(at(u, start, SIXTEENTH)) * (1 - 0.45 * answered) * (1 - leave),
    x: -26 * (1 - inQ),
    y: 10 * (1 - inQ) - 16 * ease.backIn(out) + FLOAT_PX * float(u, 0),
    blur: 6 * (1 - ease.outCubic(at(u, start, EIGHTH))) + 0.6 * answered + 6 * leave,
    scale: 0.9 + 0.1 * inQ - 0.02 * answered,
    turn: 15 + 20 * (1 - inQ) + 10 * leave + SWAY * float(u, 1),
    z: 40 - 90 * answered - 60 * leave,
    glint: at(u, start + SIXTEENTH, COUNT_MS),
    glow: ease.outCubic(at(u, start, EIGHTH)) * (1 - 0.5 * answered),
  };
}

/**
 * The answer, `u` into its beat: the response. It springs in on the second bar's one, floats against the question,
 * and dips and is gone on the next one.
 */
export function answer(beat: number, u: number): Motion {
  const inA = spring(at(u, RESPOND, SPRING_MS), 0.6);
  const out = at(u, beatMs(beat) - THIRTYSECOND, THIRTYSECOND + OVERLAP_MS);
  const leave = ease.inCubic(out);
  return {
    opacity: ease.outCubic(at(u, RESPOND, SIXTEENTH)) * (1 - leave),
    x: 26 * (1 - inA),
    y: 10 * (1 - inA) - 16 * ease.backIn(out) + FLOAT_PX * float(u, Math.PI),
    blur: 6 * leave,
    scale: 0.9 + 0.1 * inA,
    turn: 13 + 20 * (1 - inA) + 12 * leave + SWAY * float(u, Math.PI + 1),
    z: 80 - 50 * leave,
    glint: at(u, RESPOND + SIXTEENTH, COUNT_MS),
    glow: ease.outCubic(at(u, RESPOND, EIGHTH)),
  };
}

/** One word of the answer, `j` from its start: each lands on its own thirty-second, bouncing onto the line. */
export function answerWord(u: number, j: number) {
  const start = RESPOND + SIXTEENTH + j * THIRTYSECOND;
  const p = spring(at(u, start, SPRING_MS), 0.5);
  return {
    opacity: ease.outCubic(at(u, start, THIRTYSECOND * 1.5)),
    y: 14 * (1 - p),
    blur: 6 * (1 - ease.outCubic(at(u, start, EIGHTH))),
  };
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
