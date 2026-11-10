// The person's view (coordinator/one-source.md, step 3): which piece of data each dimension shows, one per
// person, for every petal they look at, anywhere. Elco, 10 Nov: "I'm basically choosing the glasses through
// which I see the entire universe, that it doesn't get stuck in the petal." The server keeps it
// (GET and PUT /api/v1/me/view); a visitor, or anyone who hasn't set one, gets the default. Its shape and
// what can go where, for the server's pages and the browser alike. Pure.
import type { View } from '@petal/core/types';
import {
  DEFAULT_VIEW,
  DIMENSIONS,
  type Dimension,
  EVERY_FLOWER,
  fits,
  type Piece,
  viewHash,
} from '@petal/core/view';

/** What GET and PUT /api/v1/me/view answer: the view, and its whole hash, which picture addresses carry. */
export interface PersonView {
  view: View;
  hash: string;
}

export const DEFAULT_PERSON_VIEW: PersonView = { view: DEFAULT_VIEW, hash: viewHash(DEFAULT_VIEW) };

/** For each dimension, the data that fits it. Nothing beyond the default is hard-coded: core's table says. */
export type ViewChoices = Record<Dimension, Piece[]>;

export const viewChoices = (pieces: readonly Piece[] = EVERY_FLOWER): ViewChoices =>
  Object.fromEntries(
    DIMENSIONS.map((d) => [d, pieces.filter((p) => fits(d, p.kind))]),
  ) as ViewChoices;

/** The query the map's lists take, so their pictures, keys and readings come in this view. */
export const viewQuery = (hash: string) => `view=${encodeURIComponent(hash)}`;
