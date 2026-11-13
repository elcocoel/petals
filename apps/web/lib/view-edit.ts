// What a choice in the Settings section does to the person's view: a dimension takes a piece of data, or none;
// a dimension that has a scale takes one, while it
// shows a number. Only data that fits the dimension is ever offered (lib/person-view.ts, viewChoices), so a
// choice keeps the view valid. The default is handed in (it's named only in lib/person-view.ts): it gives a
// number its usual scale, and says when there's nothing to put back. Pure.
import type { View } from '@petal/core/types';
import { DIMENSIONS, type Dimension, latestView, type Piece, SOME_FLOWERS } from '@petal/core/view';

export type Scale = 'sqrt' | 'linear' | 'log';

/** The scales a view knows, in the order they're offered. */
export const SCALES: readonly Scale[] = ['sqrt', 'linear', 'log'];

/** The dimensions whose value a scale turns a number into (height, width and colour). */
const SCALED: ReadonlySet<Dimension> = new Set(['height', 'width', 'colour']);

const NUMBERS = new Set(['amount', 'count', 'share']);

type Entry = { data: string; scale?: Scale; max_ratio?: number } | null;

/** A dimension's entry, a view/v1 read as the latest (labels on identity), so every row has one. */
const entry = (view: View, d: Dimension) => latestView(view).dimensions[d] as Entry;

/** The piece of data a dimension shows, or null. */
export const dataOf = (view: View, d: Dimension): string | null => entry(view, d)?.data ?? null;

/** The scale a dimension uses, when it has one and shows a number. */
export function scaleOf(view: View, d: Dimension, pieces: readonly Piece[]): Scale | null {
  const e = entry(view, d);
  if (!e || !SCALED.has(d)) return null;
  const kind = pieces.find((p) => p.name === e.data)?.kind;
  return kind && NUMBERS.has(kind) ? (e.scale ?? null) : null;
}

/** Whether a scale can be chosen for this dimension now: it has one, and what it shows is a number. */
export function takesScale(view: View, d: Dimension, pieces: readonly Piece[]): boolean {
  const e = entry(view, d);
  if (!e || !SCALED.has(d)) return false;
  const kind = pieces.find((p) => p.name === e.data)?.kind;
  return Boolean(kind && NUMBERS.has(kind));
}

/**
 * The view with this dimension showing this piece of data, or nothing. A number keeps its scale, or takes
 * the default's. It's always the latest version: a person's view/v1 becomes v2 at their next choice.
 */
export function withData(
  view: View,
  d: Dimension,
  data: string | null,
  pieces: readonly Piece[],
  defaults: View,
): View {
  const was = entry(view, d);
  let next: Entry = null;
  if (data !== null) {
    const kind = pieces.find((p) => p.name === data)?.kind;
    const number = Boolean(kind && NUMBERS.has(kind));
    const fallback = entry(defaults, d);
    const scale = number && SCALED.has(d) ? (was?.scale ?? fallback?.scale) : undefined;
    const ratio = d === 'width' && number ? (was?.max_ratio ?? fallback?.max_ratio) : undefined;
    next = {
      data,
      ...(scale ? { scale } : {}),
      ...(ratio !== undefined ? { max_ratio: ratio } : {}),
    };
  }
  const latest = latestView(view);
  return { ...latest, dimensions: { ...latest.dimensions, [d]: next } };
}

/** The view with this dimension's scale changed; nothing changes where there's no scale to choose. */
export function withScale(view: View, d: Dimension, scale: Scale): View {
  const e = entry(view, d);
  if (!e || !SCALED.has(d)) return view;
  const latest = latestView(view);
  return { ...latest, dimensions: { ...latest.dimensions, [d]: { ...e, scale } } };
}

/** Whether the view is the default, so putting the default back would change nothing. */
export const isDefault = (view: View, defaults: View): boolean =>
  DIMENSIONS.every((d) => JSON.stringify(entry(view, d)) === JSON.stringify(entry(defaults, d)));

/** Settings' hands, where the legend changes the person's view (components/ViewLegend.tsx). */
export interface LegendEdit {
  defaults: View;
  /** For each dimension, the data that fits it. */
  choices: Record<Dimension, readonly Piece[]>;
  /** The dimension whose choices are open. */
  open: Dimension | null;
  onOpen: (d: Dimension) => void;
  onPick: (d: Dimension, data: string | null) => void;
  onScale: (d: Dimension, scale: Scale) => void;
  /** Puts the default back; absent while the view is the default. */
  onReset?: (() => void) | undefined;
  /** Why the last change wasn't saved, or null. */
  failed?: string | null | undefined;
  /**
   * The dimension just changed while the map is drawn again in it, as visual feedback that something is
   * being updated, or null.
   */
  drawing?: Dimension | null | undefined;
  /** The colours chosen for Colour's values (view/v3 colour.keys), by value; 'grade' names a grade's colour. */
  colourKeys?: Readonly<Record<string, string>> | undefined;
  /** Chooses a value's colour, or hands it back to the ranking (null). */
  onKey?: ((value: string, key: string | null) => void) | undefined;
}

/**
 * What Tools offers where you are (every offered choice draws: 'Who backs it' on a DAO with no delegations
 * drew nothing): the data some DAOs have (core's SOME_FLOWERS: who backs a wallet, its activity) only where
 * one of the flowers here has it; what every flower has, and a person's own names, always. A flower whose pieces
 * aren't known (an older server) leaves every choice offered.
 */
export function onlyWhatDraws(
  choices: Record<Dimension, readonly Piece[]>,
  here: readonly (readonly string[] | undefined)[],
): Record<Dimension, readonly Piece[]> {
  if (here.length === 0 || here.some((p) => !p)) return choices;
  const has = new Set(here.flatMap((p) => p ?? []));
  const some = new Set(SOME_FLOWERS.map((p) => p.name));
  const out = { ...choices };
  for (const d of DIMENSIONS) {
    out[d] = choices[d].filter((p) => !some.has(p.name) || has.has(p.name));
  }
  return out;
}
