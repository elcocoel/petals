// Continuous detail: what shows at what distance, written down. Each row names one thing that can
// show, the on-screen size that matters to it, and the range of that size over which it fades in.
// Nothing here is a global level, and nothing here is a clock but the zoom: stop part-way and it
// stays part-way, zoom out and it reverses. All sizes are px on screen unless a row says otherwise.

export type Driver =
  /** The flower's radius: how much of a thing it is on screen. */
  | 'flowerRadius'
  /** What's left of the polygon's radius once half the title is in it. */
  | 'titleRoom'
  /** The flower's radius over (rank + 2): how much room each rank gets if the ones above it show. */
  | 'radiusPerRank'
  /** This petal's side on the polygon, as drawn. */
  | 'petalSide'
  /** This petal's end as drawn, the widest part of it. */
  | 'petalEnd'
  /** The focused petal's side at rest, ignoring how it's swollen. */
  | 'focusSide'
  /** A band's size across its label. */
  | 'bandAcross'
  /** How far the flower overflows the window: its radius over half the short side (a ratio). */
  | 'overflow'
  /** How far the account has opened, 0 to 1 (a ratio). */
  | 'open'
  /** On the map (specs/006-the-map): the smaller radius on screen of a connection's two flowers. */
  | 'pairRadius';

export interface Row {
  driver: Driver;
  /** Starts to show at the first value, fully there at the second. */
  fadeIn: [number, number];
  /** And leaves over this range, if it leaves. */
  fadeOut?: [number, number];
}

export const DETAIL = {
  /** One path for the whole flower, while single petals are smaller than a click. */
  silhouette: { driver: 'flowerRadius', fadeIn: [0, 0], fadeOut: [64, 72] },
  /** The same geometry, one path per petal. Solid before the silhouette leaves, so no flash. */
  petals: { driver: 'flowerRadius', fadeIn: [56, 64] },
  polygonLine: { driver: 'flowerRadius', fadeIn: [14, 40] },
  /** The flower answers the pointer, and the pointed-at note shows. */
  hover: { driver: 'flowerRadius', fadeIn: [56, 96] },

  /** The title under the flower, while it's too small to hold it. */
  titleOutside: { driver: 'flowerRadius', fadeIn: [20, 36] },
  /** It leaves just before the polygon can hold it, so there's never two of it. */
  titleLeaves: { driver: 'titleRoom', fadeIn: [-14, 2] },
  /** And comes back inside as soon as it fits. */
  titleInside: { driver: 'titleRoom', fadeIn: [2, 18] },

  /** Top petals' notes, biggest first: rank 1 from a radius of about 80, rank 9 from about 290. */
  topNotes: { driver: 'radiusPerRank', fadeIn: [26, 34] },
  /** Everyone's note, once its own petal is wide enough to earn one. */
  allNotes: { driver: 'petalSide', fadeIn: [26, 40] },
  /** The second line on the pointed-at note. */
  kind: { driver: 'petalEnd', fadeIn: [14, 26] },

  /** The bands of the petal in direct focus, and only that petal, with their names in its note. */
  segments: { driver: 'petalEnd', fadeIn: [18, 34] },
  /** A band of that petal saying its own name, once it's big enough to hold it. */
  segmentLabels: { driver: 'bandAcross', fadeIn: [15, 23] },

  /** The crossing into an account (crossing.js, opens side 24 to 72 px). */
  account: { driver: 'focusSide', fadeIn: [24, 72] },
  /** The open account's panel. */
  panel: { driver: 'open', fadeIn: [0.55, 0.95] },
  /** The small map of the flower, once it no longer fits the window. */
  wayBack: { driver: 'overflow', fadeIn: [1.4, 2.2] },

  /** The illustrative layer, only with ?relations=1. */
  relations: { driver: 'flowerRadius', fadeIn: [56, 96] },

  // The map (specs/006-the-map). A flower on the map uses every row above, by its own size on screen; its
  // name under it is `titleOutside`'s, at one size on screen.
  /**
   * The far wave (/lab/map?far=wave only, for now): one soft ring in place of the silhouette,
   * handing over to the silhouette's petals as the flower grows, before the live flower takes over.
   */
  farWave: { driver: 'flowerRadius', fadeIn: [0, 0], fadeOut: [30, 50] },
  /** A flower's mark, its logo or token symbol, before its name has room. */
  mark: { driver: 'flowerRadius', fadeIn: [5, 10] },
  /** A connection: one line between two flowers, its width the accounts they share. It stays as you zoom. */
  road: { driver: 'pairRadius', fadeIn: [0, 0] },
  /**
   * The lab's lines: the pointed flower's connections, once it's big enough to be told apart; none far
   * away.
   */
  lineFocus: { driver: 'pairRadius', fadeIn: [12, 24] },
  /** A flower's weaker connections, past its strongest few, once its flowers are big enough to tell apart. */
  roadMore: { driver: 'pairRadius', fadeIn: [20, 60] },
  /** A connection's number, at its middle, once its flowers are big enough. A click shows it at any size. */
  roadCount: { driver: 'pairRadius', fadeIn: [40, 70] },
} satisfies Record<string, Row>;

export type Thing = keyof typeof DETAIL;

/** Smoothstep. Below a is 0, above b is 1. With a === b it's a hard step at a. */
export function ramp(a: number, b: number, x: number): number {
  if (b <= a) return x >= a ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** How much of a thing shows, given the size that drives it. */
export function fade(row: Row, size: number): number {
  const shown = ramp(row.fadeIn[0], row.fadeIn[1], size);
  return row.fadeOut ? shown * (1 - ramp(row.fadeOut[0], row.fadeOut[1], size)) : shown;
}

/** How far a petal with this side at rest has opened, at this zoom. */
export const openAt = (restSide: number, k: number): number => fade(DETAIL.account, restSide * k);
