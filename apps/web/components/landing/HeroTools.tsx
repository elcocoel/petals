// The hero's Tools box, the real thing rather than a shorthand, wired to the real components so it changes
// whenever they do: the map's own Tools rows (ViewLegend), read only, in the map's own box (BarBox, the floating
// boxes' glass, solid so the petals under it don't show through), handed the view the flower is drawn in at each
// moment: Height to None while the community is even, back to Share of the whole as the heights part; Order to
// Last active as the petals travel round; Colour to Voted or never for the vote, with what each colour means;
// Highlight to one voting bloc and then the other. Whatever changes in ViewLegend or the box shows here too.
'use client';
import type { View } from '@petal/core/types';
import { ACTIVITY, EVERY_FLOWER, inUse } from '@petal/core/view';
import { wordsOf } from '@petal/core/wedge/keys';
import { blocWords } from '../../lib/bloc-words.ts';
import type { LegendKey } from '../../lib/flower-view.ts';
import { blocChosen, type ToolRow, type ToolValue, tool } from '../../lib/hero-story.ts';
import { panelWords } from '../../lib/panel-words.ts';
import { DEFAULT_PERSON_VIEW } from '../../lib/person-view.ts';
import { withData } from '../../lib/view-edit.ts';
import { BarBox } from '../ui/BarBox.tsx';
import { Mono } from '../ui/Mono.tsx';
import { ViewLegend } from '../ViewLegend.tsx';

/** The data the hero's flower has, as a reading with its proposals read would: every flower's, and its activity. */
const PIECES = [...EVERY_FLOWER, ...ACTIVITY];

/** Everyone's default view, from the one place it comes from. */
const DEFAULT = DEFAULT_PERSON_VIEW.view;

/** The view with Order, Height and Colour as the story sets them: made once each, as the story comes to them. */
const VIEWS = new Map<string, { view: View; drawn: ReturnType<typeof inUse> }>();
function viewOf(order: ToolValue, height: ToolValue, colour: ToolValue) {
  const name = `${order}-${height}-${colour}`;
  const made = VIEWS.get(name);
  if (made) return made;
  let view: View = DEFAULT;
  if (order === 'recent') view = withData(view, 'order', 'last_active', PIECES, DEFAULT);
  if (height === 'none') view = withData(view, 'height', null, PIECES, DEFAULT);
  if (colour === 'voted') view = withData(view, 'colour', 'voted', PIECES, DEFAULT);
  const out = { view, drawn: inUse(view, PIECES) };
  VIEWS.set(name, out);
  return out;
}

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
  const { view, drawn } = viewOf(at(beat, t, 'order'), at(beat, t, 'height'), colour);
  return (
    <BarBox kind="float" solid barSize="row" bar={<Mono as="span">{panelWords.tools}</Mono>}>
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
    </BarBox>
  );
}
