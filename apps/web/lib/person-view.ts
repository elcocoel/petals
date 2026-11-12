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
  draws,
  EVERY_FLOWER,
  FROM_ANNOTATIONS,
  type Piece,
  SOME_FLOWERS,
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

/**
 * The data a person can choose from: what every flower has, what some have (who backs a wallet, where a reading
 * has delegations; a flower without it draws none), and the names their annotations give accounts
 * (annotation-layer.md, step 6). A petal no one named keeps its short address.
 */
export const CHOOSABLE: readonly Piece[] = [...EVERY_FLOWER, ...SOME_FLOWERS, ...FROM_ANNOTATIONS];

export const viewChoices = (pieces: readonly Piece[] = CHOOSABLE): ViewChoices =>
  Object.fromEntries(
    // only what the dimension draws: a choice draws, or isn't offered (Elco, 12 Nov)
    DIMENSIONS.map((d) => [d, pieces.filter((p) => draws(d, p))]),
  ) as ViewChoices;

/**
 * What Settings shows (board #76's brief, design/flower-art-direction/default-system-vnext.md): the four
 * behaviours, Height, Colour, Segments and Highlight, then Labels. The other dimensions are hidden, not gone:
 * a view still holds them and every petal still draws them. Highlight has no place in a view yet (a chosen
 * group comes with the data), so its row only says so.
 */
export const SETTINGS_ROWS = ['height', 'colour', 'segments', 'highlight', 'labels'] as const;
export type SettingsRow = (typeof SETTINGS_ROWS)[number];

/** The query the map's lists take, so their pictures, keys and readings come in this view. */
export const viewQuery = (hash: string) => `view=${encodeURIComponent(hash)}`;
