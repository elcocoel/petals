// The hero's Tools box (Elco, 12 Nov: "either we find a visual shorthand or we use the real thing but we make sure
// it's connected to the components for real so they change with whatever I change there"): the real one, the map's
// own Tools rows (ViewLegend), read only, handed the view the flower is drawn in at each moment: Height to None
// while the community is even, back to Share of the whole as the heights part; Colour to Voted or never for the vote,
// with what each colour means; Highlight to one voting bloc and then the other. Whatever changes in ViewLegend shows
// here too. The stage sets it back and soft (HeroStory).
'use client';
import type { View } from '@petal/core/types';
import { ACTIVITY, EVERY_FLOWER, inUse } from '@petal/core/view';
import { wordsOf } from '@petal/core/wedge/keys';
import { blocWords } from '../../lib/bloc-words.ts';
import type { LegendKey } from '../../lib/flower-view.ts';
import { blocChosen, type ToolRow, type ToolValue, tool } from '../../lib/hero-story.ts';
import { DEFAULT_PERSON_VIEW } from '../../lib/person-view.ts';
import { withData } from '../../lib/view-edit.ts';
import { ViewLegend } from '../ViewLegend.tsx';

/** The data the hero's flower has, as a reading with its proposals read would: every flower's, and its activity. */
const PIECES = [...EVERY_FLOWER, ...ACTIVITY];

/** The view with Height at share or None, and Colour at kind of account or voted or never: the four the story uses. */
/** Everyone's default view, from the one place it comes from. */
const DEFAULT = DEFAULT_PERSON_VIEW.view;

function viewOf(height: ToolValue, colour: ToolValue) {
  let view: View = DEFAULT;
  if (height === 'none') view = withData(view, 'height', null, PIECES, DEFAULT);
  if (colour === 'voted') view = withData(view, 'colour', 'voted', PIECES, DEFAULT);
  return { view, drawn: inUse(view, PIECES) };
}
const VIEWS = {
  'share-kind': viewOf('share', 'kind'),
  'none-kind': viewOf('none', 'kind'),
  'share-voted': viewOf('share', 'voted'),
  'none-voted': viewOf('none', 'voted'),
} as const;

/** What each colour means under Colour, in the core's words, with the look's own key swatches. */
const KEYS: Record<'kind' | 'voted', readonly LegendKey[]> = {
  kind: [
    { label: wordsOf('unknown'), swatch: 'key-mint' },
    { label: wordsOf('contract'), swatch: 'key-blue' },
    { label: wordsOf('mining_pool'), swatch: 'key-coral' },
    { label: wordsOf('person'), swatch: 'key-apricot' },
    { label: wordsOf('group'), swatch: 'key-pink' },
  ],
  voted: [
    { label: wordsOf('voted'), swatch: 'key-mint' },
    { label: wordsOf('never voted'), swatch: 'key-grey' },
  ],
};

/** The made-up flower's two voting blocs, as the Highlight row offers a flower's. */
const BLOCS = ['first', 'second'].map((id) => ({
  id,
  label: blocWords.alike(6),
  trail: blocWords.pairs(9),
  members: [],
}));
const nothing = () => {};

/** What a row is set to at a moment: the new setting once it has taken over. */
const at = (beat: number, t: number, row: ToolRow) => {
  const r = tool(beat, t, row);
  return r.k >= 0.5 ? r.to : r.from;
};

export function HeroTools({ beat, t }: { beat: number; t: number }) {
  const colour = at(beat, t, 'colour') === 'voted' ? 'voted' : 'kind';
  const { view, drawn } = VIEWS[`${at(beat, t, 'height') === 'none' ? 'none' : 'share'}-${colour}`];
  return (
    <div className="relative">
      <ViewLegend
        view={view}
        drawn={drawn}
        pieces={PIECES}
        keys={KEYS[colour]}
        groups={{
          choices: BLOCS,
          chosen: blocChosen(beat, t),
          span: 'all',
          period: blocWords.all,
          onChoose: nothing,
          onSpan: nothing,
        }}
        bare
      />
    </div>
  );
}
