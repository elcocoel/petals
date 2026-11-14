// Power over time (the Play): a map's dated readings, each the map at a past moment, oldest first, stepped through
// one after another so its flower glides from one moment to the next, the date shown. What the map draws stays its
// main reading; only the Play shows the dated ones. Pure.
import type { MapReading } from './maps.ts';

/** One moment of a map: its reading, by snapshot, and when it holds. */
export interface PlayStep {
  snapshot: string;
  as_of: string;
}

/** A map's moments to play: its dated readings, oldest first; none unless it has two. */
export function playSteps(
  readings: readonly Pick<MapReading, 'snapshot' | 'as_of' | 'dated'>[] | undefined,
): PlayStep[] {
  const steps = (readings ?? [])
    .filter((r) => r.dated)
    .map((r) => ({ snapshot: r.snapshot, as_of: r.as_of }))
    .sort((a, b) => Date.parse(a.as_of) - Date.parse(b.as_of));
  return steps.length >= 2 ? steps : [];
}

/** How long each moment stays before the next, in ms: the flower's glide to it, then a moment to read it. */
export const PLAY_STEP = 2300;

/** The Play's words: its control, read aloud. */
export const playWords = { play: 'Play over time', pause: 'Pause' } as const;

const MONTH = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A moment as the Play says it: 'Oct 2026'. */
export const momentOf = (iso: string) => MONTH.format(Date.parse(iso));
