// The hero's story, as numbers (HERO ART's V2, approved by Elco 11 Nov: "BRO, 10 OUT OF 10 - LFG!!!! ... get
// this in the hero please"; design/hero-illustration/foreground-script-v2.md). Six beats; each lasts BEAT_MS:
// the question arrives, the flower answers, the words answer, a quiet hold, the words leave. Everything a frame
// draws is a pure function of the beat and the time into it, so choosing a beat settles it at once and a test
// can read any moment. The flower is a symbol, not a reading: no network, no counts.

/** How long a beat lasts, from its question arriving to its words leaving. */
export const BEAT_MS = 6800;
/** A moment inside a beat where everything has settled and both lines are in view. */
export const SETTLED_MS = 3700;
/** When the flower starts its answer, before the words do. */
const RESPOND_MS = 1050;
const QUESTION_MS = 100;
const ANSWER_MS = 2350;
const DEPART_MS = 6000;
/** How long the history beat's heights take to move from then to now. */
const HISTORY = { from: 1100, ms: 3900 };

export const PETALS = 24;
/** Where the petals start: the centre's edge. */
export const INNER = 36;
/** Every petal's length when the community first opens, all equal. */
const EVEN = 106;

/** Tallest at twelve o'clock, then shorter around the clock: the same symbolic sequence the earlier hero drew. */
const shares = Array.from({ length: PETALS }, (_, i) => 0.3 + 0.7 * (1 - i / (PETALS - 1)) ** 1.8);
/** Each petal's length once influence shows. */
const base = shares.map((s) => 43 + s * 128);
/** The same petals at the history beat's "now": another balance, the positions kept. */
const later = shares.map((_, i) => 49 + (shares[(i + 7) % PETALS] as number) * 119);
export const ghostLengths: readonly number[] = base;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** 0 to 1 from `start` over `ms`, eased out. */
const ease = (t: number, start: number, ms: number) => 1 - (1 - clamp((t - start) / ms)) ** 3;
const linear = (t: number, start: number, ms: number) => clamp((t - start) / ms);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Each petal's length once a beat has settled, which is where the next beat starts from. */
function settled(beat: number): readonly number[] {
  if (beat === 0) return Array(PETALS).fill(EVEN);
  if (beat === 3) return later;
  return base;
}

export function petalLengths(beat: number, t: number): number[] {
  const before = settled((beat + 5) % 6);
  if (t < RESPOND_MS) {
    const k = ease(t, 0, 500);
    return before.map((r, i) => lerp(r, beat === 0 ? INNER : (base[i] as number), k));
  }
  if (beat === 0)
    return Array.from({ length: PETALS }, () => lerp(INNER, EVEN, ease(t, RESPOND_MS, 700)));
  if (beat === 3) {
    const k = linear(t, HISTORY.from, HISTORY.ms);
    return base.map((r, i) => lerp(r, later[i] as number, k));
  }
  return [...base];
}

/** How far the history beat's marker has gone along its line, 0 to 1. */
export const historyAt = (t: number) => linear(t, HISTORY.from, HISTORY.ms);

/** The main flower pulls back at the last beat, to make room for the communities it leads to. */
export function flowerScale(beat: number, t: number): number {
  if (beat === 5) return lerp(1, 0.65, ease(t, RESPOND_MS, 700));
  if (beat === 0) return lerp(0.65, 1, ease(t, 0, 600));
  return 1;
}

/** A layer that belongs to one beat: it comes in with the flower's answer and goes as the next beat starts. */
export function layerOpacity(own: number, beat: number, t: number): number {
  if (beat === own) return ease(t, RESPOND_MS, 400);
  if (beat === (own + 1) % 6) return 1 - ease(t, 0, 400);
  return 0;
}

export type Fill = 'petal' | 'accent' | 'second';

const LIT = 3;
const BLOC_A = new Set([0, 1, 8, 9, 16, 17]);
const BLOC_B = new Set([4, 5, 12, 13, 20, 21]);

/** What each petal is painted with in a beat: the few that carry the most, or two groups that vote alike. */
export function petalFill(beat: number, i: number): Fill {
  if (beat === 1 || beat === 5) return i < LIT ? 'accent' : 'petal';
  if (beat === 2 || beat === 3)
    return BLOC_A.has(i) ? 'accent' : BLOC_B.has(i) ? 'second' : 'petal';
  return 'petal';
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

/** A vote mark inside each petal at the proposal beat: against on every fourth, none on every fifth. */
export const voteOf = (i: number): 'for' | 'against' | null =>
  i % 5 === 0 ? null : i % 4 === 0 ? 'against' : 'for';

/** Where the words are: how much they show and how far they've risen, in px. */
export function words(t: number) {
  const leave = ease(t, DEPART_MS, 500);
  const rise = ease(t, DEPART_MS, 600) * 12;
  const answered = ease(t, ANSWER_MS, 500);
  return {
    question: {
      opacity: ease(t, QUESTION_MS, 500) * (1 - 0.55 * answered) * (1 - leave),
      y: 14 * (1 - ease(t, QUESTION_MS, 600)) - rise,
    },
    answer: {
      opacity: answered * (1 - leave),
      y: 16 * (1 - ease(t, ANSWER_MS, 600)) - rise,
    },
  };
}

/** A sector from `inner` to `outer`: two straight sides, its top and foot on the circle's arcs. */
export function sector(i: number, outer: number, inner = INNER, count = PETALS): string {
  const step = (2 * Math.PI) / count;
  const a = -Math.PI / 2 + i * step + 0.013;
  const b = a + step - 0.026;
  const at = (r: number, t: number) =>
    `${(Math.cos(t) * r).toFixed(2)} ${(Math.sin(t) * r).toFixed(2)}`;
  const r = Math.max(inner + 0.05, outer);
  return `M${at(inner, a)} L${at(r, a)} A${r} ${r} 0 0 1 ${at(r, b)} L${at(inner, b)} A${inner} ${inner} 0 0 0 ${at(inner, a)}Z`;
}

/** A point at a petal's middle angle, `r` from the centre. */
export function atPetal(i: number, r: number): [number, number] {
  const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / PETALS;
  return [Math.cos(a) * r, Math.sin(a) * r];
}
