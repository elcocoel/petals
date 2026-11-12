// The hero's story, as numbers (HERO ART's V2, approved by Elco 11 Nov: "BRO, 10 OUT OF 10 - LFG!!!! ... get
// this in the hero please"; design/hero-illustration/foreground-script-v2.md), cut to a beat (Elco, 12 Nov: "boom,
// action, reaction, beat, counterbeats, call, response, fast, something slow, fast, fast, fast, boom, boom, boom
// ... we need pulse ... think musically, almost like to the beat of rap"). One tempo drives everything: each story
// beat is a phrase of bars and every move lands on a count. On the one, the cut and the call: the camera whips to
// its shot and the question slams in. A rest to read it. On the three, the reaction: the flower hits, and fast
// accents follow it. On the next bar's one, the response: Petals' answer, in a box that came with the first one and
// stays, the last answer giving way to this one word by word (Elco, 12 Nov: "no reason for them to go away before
// the next question comes in"). The question leaves on the last and. The history beat is the slow one: its heights travel
// a whole bar and land on a boom. Under it all the light thumps on every count, harder on one and three.
// And it is organic, never dead still (Elco, 12 Nov: "ins and outs and elastic or sine wave ... not just bursts";
// "completely stopped needs to be an exception"), and smooth (Elco, 12 Nov: no bumpiness, no jerking): each hit
// eases in and lands with a little give, never a bounce; exits dip before they go; and between the hits the petals
// ripple in a slow wave round the clock, the words float and the camera keeps drifting.
// It is one loop (Elco, 12 Nov: "start in the beginning from a far away situation ... then we zoom in into my
// community ... following to other communities and then it zooms out to the same frame it started"): it opens on
// the far map, dives into my community as it bursts open, and the connections beat pulls back to its two
// neighbours and then all the way out, to the very frame it opened on (world()).
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

/**
 * How many bars each story beat lasts: the history beat is the slow one, and the community beat opens with a bar
 * on the far map before the camera dives (Elco, 12 Nov: the far scene "goes by waaay too fast and starts moving
 * before the questions").
 */
const BARS: readonly number[] = [3, 2, 2, 3, 2, 2];
export const BEATS_MS: readonly number[] = BARS.map((bars) => bars * 4 * COUNT_MS);
/** The longest beat, for whatever needs one number. */
export const BEAT_MS = Math.max(...BEATS_MS);
export const beatMs = (beat: number) => BEATS_MS[beat] ?? BEAT_MS;
/** When each beat starts on one clock round the whole story, for what keeps going across the beats. */
export const startOf = (beat: number) => BEATS_MS.slice(0, beat).reduce((sum, ms) => sum + ms, 0);
/**
 * The last count of a beat, before the words cut out: both lines in view, the flower at rest; for the connections
 * beat, before the camera goes back out to the far map. A chosen beat stops here.
 */
export const settledMs = (beat: number) => (beat === 5 ? count(6) : beatMs(beat) - COUNT_MS);

/** The call lands on the one; on arrival half a count later, so the far map is seen first. */
const CALL = count(1);
const CALL_FRESH = count(1.5);
/** The reaction: the flower hits on the three. */
const REACT = count(3);
/** The response: the answer lands on the second bar's one. */
const RESPOND = count(5);
/** The community beat's phrase starts a bar late, after its bar on the far map. */
const LEAD = 4 * COUNT_MS;
const reactAt = (beat: number) => REACT + (beat === 0 ? LEAD : 0);
const respondAt = (beat: number) => RESPOND + (beat === 0 ? LEAD : 0);
/**
 * When the camera starts its whip to a beat's shot, and when its drift starts: on the one; on the community beat
 * the whip goes with the dive, and the drift only once the question has landed, so nothing moves before it.
 */
export const whipAt = (beat: number) => (beat === 0 ? count(6) : 0);
export const driftAt = (beat: number) => (beat === 0 ? count(2) : 0);

export const PETALS = 24;
/** Where the petals start: the centre's edge; a wide centre, as the real flower has (Elco, 12 Nov: closer to the real thing). */
export const INNER = 56;
/** Every petal's length when the community first opens, all equal. */
const EVEN = 118;
/** Half the line between two petals: the same width from foot to tip (Elco, 5 Nov: "a relatively stable line"). */
export const GUTTER = 1.5;

/** Tallest at twelve o'clock, then shorter around the clock: the same symbolic sequence the earlier hero drew. */
const shares = Array.from({ length: PETALS }, (_, i) => 0.3 + 0.7 * (1 - i / (PETALS - 1)) ** 1.8);
/** Each petal's length once influence shows; from far, my community's wave is drawn from these. */
export const base = shares.map((s) => 43 + s * 128);
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

/** How much a petal, a bloom or a vote gives as it lands: a few % past its mark, no swing back to speak of. */
const GIVE = 0.72;
/** A petal, a bloom, a vote: an elastic pop, with a little give. */
const pop = (t: number, start: number, ms = SPRING_MS) => spring(at(t, start, ms), GIVE);

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
  // a community: the focus ring picks it out on the second bar's one, the camera dives in, it bursts open
  [
    [5, 0.015],
    [7, 0.05],
    [9, 0.015],
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

/**
 * How much the camera is punched in at a moment, from 0: before each hit it eases back a little (the wind-up), on
 * the hit it eases in, and lets go slowly. A hit on the one has no wind-up: that is the cut.
 */
export function kick(beat: number, t: number): number {
  const hits = KICKS[beat] ?? [];
  let k = 0;
  for (const [c, amp] of hits) {
    const d = t - count(c);
    const back = c > 1 ? 0.2 : 0;
    if (d < 0) {
      k -= back * amp * ease.inOutSine(Math.max(0, (d + WIND_MS) / WIND_MS));
      continue;
    }
    // eased in from the wind-up, then let go slowly
    const rise = ease.inOutSine(Math.min(1, d / 90));
    k += amp * (lerp(-back, 1, rise) * Math.exp(-Math.max(0, d - 90) / 220));
  }
  return k;
}

/** The pulse under it all, 0 to 1: a thump on every count, the one and the three harder than the two and the four. */
export function pulse(t: number): number {
  const n = Math.floor(t / COUNT_MS);
  const d = t - n * COUNT_MS;
  return (
    (n % 2 === 0 ? 1 : 0.5) * ease.inOutSine(Math.min(1, d / 60)) * Math.exp(-d / (0.3 * COUNT_MS))
  );
}

// ----- the flower -----

/** Each petal's length once a beat has settled, which is where the next beat starts from. */
function settled(beat: number): readonly number[] {
  if (beat === 0) return Array(PETALS).fill(EVEN);
  if (beat === 3) return later;
  if (beat === 5) return Array(PETALS).fill(INNER);
  return base;
}

/** A petal's shape as the beat has it, before the ripple. */
function shaped(beat: number, t: number, i: number, from: number): number {
  switch (beat) {
    case 0:
      // as the camera arrives, it bursts out of its wave on the three, rolling round the clock
      return lerp(INNER, EVEN, pop(t, reactAt(0) + i * ROLL));
    case 1: {
      // the even flower draws in on the and of two, holds its breath, and the heights burst apart on the three
      const held =
        ease.inOutSine(at(t, count(2.5), EIGHTH)) * (1 - ease.inOutSine(at(t, REACT, EIGHTH)));
      const grown = lerp(from, base[i] as number, pop(t, REACT + i * (ROLL / 2)));
      return INNER + (grown - INNER) * (1 - 0.06 * held);
    }
    case 3:
      return lerp(from, later[i] as number, historyAt(t));
    case 4: {
      const start = REACT + i * (ROLL / 2);
      const r = lerp(from, base[i] as number, pop(t, start));
      return INNER + (r - INNER) * (1 - 0.06 * windUp(t, start));
    }
    case 5:
      // once its wave has covered it on the way out, the petals fold away, ready to burst again
      return lerp(base[i] as number, INNER, ease.inOutSine(at(t, count(8.25), EIGHTH)));
    default:
      return base[i] as number;
  }
}

/**
 * Each petal's length. The first beat bursts out of the centre on the three, as the camera arrives; the last
 * folds the petals away under the wave once the camera has pulled back. Over it all a
 * slow wave runs round the clock once a bar, the longer the petal the more it ripples, on one clock across the
 * beats so it never jumps.
 */
export function petalLengths(beat: number, t: number): number[] {
  const before = settled(prior(beat));
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
 * speed through the whole second bar, lands hard on the third bar's one and gives a little there.
 */
export function historyAt(t: number): number {
  if (t < LAND) return ease.inSine(at(t, RESPOND, LAND - RESPOND));
  const d = t - LAND;
  return 1 + 0.03 * Math.exp(-d / 200) * Math.sin(d / 110);
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

/** My community's twist as it bursts open: the petals are all at the centre's edge when it begins. */
export function camera(beat: number, t: number): Camera {
  const rotate =
    beat === 0 && t >= reactAt(0) ? -16 * (1 - spring(at(t, reactAt(0), 1.5 * COUNT_MS), 0.8)) : 0;
  return { scale: 1, rotate, y: 0 };
}

// ----- the world: the far map, the dive and the way back out -----

/** How close the camera is at the far frame: the whole map in view. */
export const FAR = 0.2;
/** Where the far frame looks, in the drawing's units from my community's centre: the middle of the map. */
export const MAP_CENTRE = { x: 380, y: -110 };
/** The connections beat's first pull back: my community with its two neighbours. */
const NEAR_NEIGHBOURS = 0.55;
/** The camera's closeness from a 0 (far) to 1 (my community) that moves evenly through the zoom. */
const zoomOf = (k: number) => FAR * (1 / FAR) ** k;
const kOf = (zoom: number) => Math.log(zoom / FAR) / Math.log(1 / FAR);

export interface World {
  /** how close the camera is: 1 at my community, FAR for the whole map */
  zoom: number;
  /** the point it looks at, in the drawing's units from my community's centre */
  x: number;
  y: number;
  /** the dashed focus ring round my community, 0 to 1 */
  ring: number;
  /** my community's soft wave, as seen from far, 0 to 1; its petals show the rest of the way */
  wave: number;
  /** the rest of the map, 0 to 1: there from far, gone by the time the camera is close */
  map: number;
}

/** The zooms between which the rest of the map fades as the camera comes in. */
const MAP_FADES = { from: 0.28, to: 0.48 };

/**
 * The world camera. On the community beat it holds on the far map while the question lands and is read; my
 * community takes a dashed focus ring on the second bar's one, and on its two the camera dives into it, my community
 * gliding to the middle as it grows, and it bursts out of its wave on the three. On the connections beat the camera pulls back on the one to show its two
 * neighbours, and once the answer is in it goes all the way out to the far map, my community folding back into
 * its wave, ending on the very frame the community beat starts from.
 */
export function world(beat: number, t: number): World {
  let k = 1;
  let slide = 1;
  let wave = 0;
  let ring = 0;
  if (beat === 0) {
    const dive = ease.inOutCubic(at(t, count(6), 1.5 * COUNT_MS));
    k = dive;
    slide = dive;
    wave = 1 - ease.inOutSine(at(t, reactAt(0), 3 * EIGHTH));
    ring =
      ease.outCubic(at(t, count(5), EIGHTH)) * (1 - ease.inOutSine(at(t, count(6.5), COUNT_MS)));
  }
  if (beat === 5) {
    const out = ease.inOutCubic(at(t, count(6), 2.5 * COUNT_MS));
    const back = spring(at(t, CALL, 1.5 * COUNT_MS), 0.85);
    k = lerp(lerp(1, kOf(NEAR_NEIGHBOURS), back), 0, out);
    slide = 1 - out;
    wave = ease.inOutSine(at(t, count(7), 1.25 * COUNT_MS));
  }
  const zoom = zoomOf(k);
  // my community moves evenly across the screen while the zoom grows, so the dive reads as one glide
  const away = (FAR * (1 - slide)) / zoom;
  const map = 1 - ease.inOutSine(at(zoom, MAP_FADES.from, MAP_FADES.to - MAP_FADES.from));
  return { zoom, x: MAP_CENTRE.x * away, y: MAP_CENTRE.y * away, ring, wave, map };
}

/** The light behind the flower: it moves a third as much as the flower does, and thumps with the pulse. */
export function glow(beat: number, t: number, fresh = false) {
  const pull = world(beat, t).zoom;
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
  const thump = pulse(t) + 8 * kick(beat, t);
  return {
    opacity: born * Math.min(1, 0.78 + 0.22 * thump),
    scale: (1 + (pull - 1) * 0.35) * (1 + 0.02 * thump),
    second,
  };
}

/** A layer that belongs to one beat: it snaps in with the flower's reaction and cuts out on the next one. */
export function layerOpacity(own: number, beat: number, t: number): number {
  if (beat === own) return ease.outCubic(at(t, REACT, SIXTEENTH));
  if (beat === (own + 1) % 6) return 1 - ease.outCubic(at(t, CALL, EIGHTH));
  return 0;
}

/**
 * A petal's paint: one of the real flower's five keys, most common first, or grey for context
 * (@petal/core/wedge/keys; Elco, 12 Nov: "closer to the real thing ... colors change").
 */
export type Fill = 'mint' | 'blue' | 'coral' | 'apricot' | 'pink' | 'grey';

const LIT = 3;
const BLOC_A = [0, 1, 8, 9, 16, 17];
const BLOC_B = [4, 5, 12, 13, 20, 21];

/**
 * What kind of account each petal is, as the real flower colours it by default: the commonest kind in mint, then
 * blue, coral, apricot and pink, each key going to the kind more petals carry. Made up, and scattered round.
 */
const KIND: readonly Fill[] = [
  'mint',
  'blue',
  'mint',
  'mint',
  'apricot',
  'mint',
  'coral',
  'mint',
  'blue',
  'mint',
  'mint',
  'pink',
  'mint',
  'blue',
  'mint',
  'coral',
  'mint',
  'mint',
  'blue',
  'apricot',
  'mint',
  'coral',
  'mint',
  'blue',
];

/**
 * What each petal is painted with once a beat has settled, as the real tools would set it: by kind of account on
 * the community, history and connections beats; the strongest three highlighted and everyone else receding to grey
 * for influence; two voting blocs, one mint and one blue, the rest grey; on the vote, for in mint, against in coral,
 * and grey for those who never voted.
 */
export function petalFill(beat: number, i: number): Fill {
  const kind = KIND[i] ?? 'mint';
  if (beat === 1) return i < LIT ? kind : 'grey';
  if (beat === 2) return BLOC_A.includes(i) ? 'mint' : BLOC_B.includes(i) ? 'blue' : 'grey';
  if (beat === 4) {
    const v = voteOf(i);
    return v === 'for' ? 'mint' : v === 'against' ? 'coral' : 'grey';
  }
  return kind;
}

/**
 * When a petal's colour hits in a beat: everyone else recedes on the three; one bloc on the three, the other on
 * the four; on the vote, those who never voted go grey on the three and the voters take their side as the votes
 * roll in; the whole picture comes back on the one.
 */
function paintStart(beat: number, i: number): number {
  if (beat === 1) return reactAt(1);
  if (beat === 2) return BLOC_B.includes(i) ? count(4) : REACT;
  if (beat === 4) return voteOf(i) ? count(4.5) + (i * COUNT_MS) / 12 : REACT;
  return CALL;
}

/** When the highlight lands on one of the strongest three: one on each eighth (boom, boom, boom), quicker at the end. */
function litStart(beat: number, i: number): number {
  return beat === 5 ? count(2) + i * SIXTEENTH : count(3.5) + i * EIGHTH;
}

/** A petal's paint at a moment: from the last beat's colour to this one's, `k` of the way. */
export function petalPaint(beat: number, t: number, i: number) {
  const from: Fill = petalFill(prior(beat), i);
  const to = petalFill(beat, i);
  return { from, to, k: from === to ? 1 : ease.outCubic(at(t, paintStart(beat, i), SIXTEENTH)) };
}

/**
 * How strongly the highlight is on a petal, 0 to 1: on the strongest few, as each lands; their share labels come
 * with it.
 */
export function petalLit(beat: number, t: number, i: number): number {
  if (i >= LIT) return 0;
  if (beat === 1 || beat === 5) return ease.outCubic(at(t, litStart(beat, i), SIXTEENTH));
  if (beat === 2 || beat === 0) return 1 - ease.outCubic(at(t, CALL, SIXTEENTH));
  return 0;
}

/** Each petal's share of the whole once influence shows, in %: what its label says. Symbolic, as the heights are. */
export const sharePercent = (() => {
  const held = base.map((r) => r - INNER);
  const all = held.reduce((sum, h) => sum + h, 0);
  return held.map((h) => (100 * h) / all);
})();

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

/**
 * The two neighbours the last beat opens onto: a line shoots out to each on the three and four, and each bursts
 * out of its wave on the and; on the way out they fold back into their waves with my community. The lines stay
 * until the next one.
 */
export function network(beat: number, t: number) {
  const fold = 1 - ease.inOutSine(at(t, count(7), 1.25 * COUNT_MS));
  if (beat === 5)
    return {
      link: (n: number) => ease.inOutCubic(at(t, REACT + n * COUNT_MS, 1.5 * EIGHTH)),
      bloom: (n: number, j: number) => pop(t, count(3.5) + n * COUNT_MS + j * 10) * fold,
      // the dashes run outward, towards the communities, a dash's length each second
      flow: -t * 0.009,
    };
  if (beat === 0) return { link: () => 1, bloom: () => 0, flow: -(beatMs(5) + t) * 0.009 };
  return { link: () => 1, bloom: () => 0, flow: 0 };
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

/** How far a bubble floats up and down while it is on, in px; and how far it sways, in degrees. */
const FLOAT_PX = 3;
const SWAY = 1.5;
/** The question's float, once every two bars of its own beat. */
const float = (u: number, phase: number) => Math.sin((Math.PI * u) / (4 * COUNT_MS) + phase);
/** The whole story's length, and the answer box's float on it: six times round, so it never jumps as the loop turns. */
const LOOP = startOf(6);
const drift = (beat: number, t: number, phase: number) =>
  Math.sin((12 * Math.PI * (startOf(beat) + t)) / LOOP + phase);

/**
 * The question, `u` into its beat: the call. It eases in on the one from its side; once answered it eases back,
 * dimmer and a little soft, as a camera racks focus; it floats while it is on; it dips and is gone on the last and.
 */
export function question(beat: number, u: number, fresh = false): Motion {
  const start = fresh && beat === 0 ? CALL_FRESH : CALL;
  const inQ = spring(at(u, start, SPRING_MS), 0.85);
  const answered = ease.inOutSine(at(u, respondAt(beat) - SIXTEENTH, EIGHTH));
  const out = at(u, beatMs(beat) - 1.5 * EIGHTH, 1.3 * EIGHTH);
  const leave = ease.inCubic(out);
  return {
    opacity: ease.outCubic(at(u, start, EIGHTH)) * (1 - 0.45 * answered) * (1 - leave),
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
 * Petals' answer box: it comes in with the very first answer and stays from then on, floating; a glint crosses it
 * as each new answer lands.
 */
export function answerBox(beat: number, t: number, fresh = false): Motion {
  const first = fresh && beat === 0;
  const inA = first ? spring(at(t, respondAt(0) - SIXTEENTH, SPRING_MS), 0.85) : 1;
  return {
    opacity: first ? ease.outCubic(at(t, respondAt(0) - SIXTEENTH, EIGHTH)) : 1,
    x: 20 * (1 - inA),
    y: 8 * (1 - inA) + FLOAT_PX * drift(beat, t, Math.PI),
    blur: 0,
    scale: 0.94 + 0.06 * inA,
    turn: 13 + 16 * (1 - inA) + SWAY * drift(beat, t, Math.PI + 1),
    z: 80,
    glint: at(t, respondAt(beat), 1.5 * COUNT_MS),
    glow: inA,
  };
}

/**
 * One beat's answer in the box at a moment: this beat's comes in on the response, word by word; the last beat's
 * stays until then and gives way just before it; any other is not there. `words` says the line is coming in, so
 * each word is drawn with its own motion (answerWord).
 */
export function answerLine(own: number, beat: number, t: number, fresh = false) {
  if (own === beat) return { opacity: t >= respondAt(beat) ? 1 : 0, y: 0, blur: 0, words: true };
  if (own === prior(beat) && !(fresh && beat === 0)) {
    const out = at(t, respondAt(beat) - EIGHTH, EIGHTH);
    return {
      opacity: 1 - ease.inOutSine(out),
      y: -8 * ease.inCubic(out),
      blur: 4 * ease.inCubic(out),
      words: false,
    };
  }
  return { opacity: 0, y: 0, blur: 0, words: false };
}

/** One word of the answer coming in, `j` from its start: one on each sixteenth, easing up into the line. */
export function answerWord(beat: number, t: number, j: number) {
  const start = respondAt(beat) + j * SIXTEENTH;
  const p = ease.outCubic(at(t, start, 1.5 * EIGHTH));
  return { opacity: ease.outCubic(at(t, start, EIGHTH)), y: 8 * (1 - p), blur: 4 * (1 - p) };
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
