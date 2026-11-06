// The only words on the flower, and all of them come from the reading.
import type { ReadingPetal } from '@petal/core/types';

/** The mono type class, in one place because it's being renamed. */
export const MONO = 'type-mono-small';
/** Geist Mono at that class's 11px: 0.6em a character, plus 0.04em of tracking. No text measuring. */
export const CHAR = 7.04;
export const LINE = 16;

/** The same rounding as core's reading/words.ts. */
export function pct(x: number): string {
  if (x >= 0.1) return `${(x * 100).toFixed(1)}%`;
  if (x >= 0.001) return `${(x * 100).toFixed(2)}%`;
  return '<0.1%';
}

/** A decimal string, whole and with thousands separated; small ones keep a little of the fraction. */
export function amount(decimal: string): string {
  const [whole = '0', fraction = ''] = decimal.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, ',');
  return whole === '0' && fraction ? `0.${fraction.slice(0, 4)}` : grouped;
}

export const kindWord = (kind: string): string => kind.replace(/_/g, ' ');

const short = (name: string, max: number) =>
  name.length > max ? `${name.slice(0, max - 1)}…` : name;

/** What a petal's note says. Only the note being pointed at can afford a long name in full. */
export function noteText(
  p: Pick<ReadingPetal, 'name' | 'share' | 'tail' | 'count'>,
  full = false,
): string {
  if (p.tail) return `${p.name} (${p.count ?? 0}) ${pct(p.share)}`;
  return `${full ? p.name : short(p.name, 24)} ${pct(p.share)}`;
}

export const textWidth = (s: string, scale = 1): number => s.length * CHAR * scale;
