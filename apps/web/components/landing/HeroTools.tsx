// The hero's Tools box (Elco, 12 Nov: "there is tooling and things that change and colors change ... closer to the
// real thing, but still illustrative"): a few rows of the map's own Tools box (ViewLegend), in its own words, each
// changing as the flower does what it says: Height to Share of the whole as the heights part, Labels as the
// strongest's shares come, Highlight to a voting bloc, Colour to Voted or never for the vote; the row lights as it
// changes. Under Colour, what each colour means. It only draws; lib/hero-story.ts says what each row is set to.
import { wordsOf } from '@petal/core/wedge/keys';
import { blocWords } from '../../lib/bloc-words.ts';
import { TOOL_ROWS, type ToolRow, type ToolValue, tool } from '../../lib/hero-story.ts';
import { panelWords } from '../../lib/panel-words.ts';
import { Mono } from '../ui/Mono.tsx';

const words = panelWords.settings;

/** What a row is called, as the map's Tools box calls it. */
const ROW_WORDS: Record<ToolRow, string> = {
  height: words.dimensions.height,
  colour: words.dimensions.colour,
  labels: words.dimensions.labels,
  highlight: words.dimensions.highlight,
};

/** What a row is set to, in the map's words: a voting bloc as the Highlight row names one. */
const VALUE_WORDS: Record<ToolValue, string> = {
  none: words.none,
  share: words.piece('share'),
  kind: words.piece('kind'),
  voted: words.piece('voted'),
  blocs: blocWords.alike(6),
};

/** What each colour means, under Colour: the kinds of account, or voted and never; the core's words for each. */
const MEANS: Record<'kind' | 'voted', readonly { swatch: string; label: string }[]> = {
  kind: [
    { swatch: 'key-mint', label: wordsOf('unknown') },
    { swatch: 'key-blue', label: wordsOf('contract') },
    { swatch: 'key-coral', label: wordsOf('mining_pool') },
    { swatch: 'key-apricot', label: wordsOf('person') },
    { swatch: 'key-pink', label: wordsOf('group') },
  ],
  voted: [
    { swatch: 'key-mint', label: wordsOf('voted') },
    { swatch: 'key-grey', label: wordsOf('never voted') },
  ],
};

const n2 = (x: number) => x.toFixed(2);

/** A row: its category on the left, quiet; its value on the right, the last one giving way to the new. */
function Row({ beat, t, row }: { beat: number; t: number; row: ToolRow }) {
  const r = tool(beat, t, row);
  return (
    <div className="relative flex min-h-row-height items-center justify-between gap-space-8 px-space-8">
      {/* the row lights as it changes */}
      <span
        aria-hidden="true"
        className="absolute inset-0 block bg-accent"
        style={{ opacity: n2(0.35 * r.flash) }}
      />
      <span className="relative type-ui text-muted">{ROW_WORDS[row]}</span>
      <span className="relative grid justify-items-end">
        {r.k < 1 && (
          <span
            className="col-start-1 row-start-1 type-ui text-primary"
            style={{ opacity: n2(1 - r.k), translate: `0 ${n2(-6 * r.k)}px` }}
          >
            {VALUE_WORDS[r.from]}
          </span>
        )}
        <span
          className="col-start-1 row-start-1 type-ui text-primary"
          style={{ opacity: n2(r.k), translate: `0 ${n2(6 * (1 - r.k))}px` }}
        >
          {VALUE_WORDS[r.to]}
        </span>
      </span>
    </div>
  );
}

/** What each colour means, the last set giving way to the new as Colour changes. */
function Means({ beat, t }: { beat: number; t: number }) {
  const c = tool(beat, t, 'colour');
  const sets = (c.k < 1 ? [c.from, c.to] : [c.to]) as ('kind' | 'voted')[];
  return (
    <div className="grid px-space-8 pb-space-8">
      {sets.map((set) => (
        <ul
          key={set}
          className="col-start-1 row-start-1 m-0 flex list-none flex-wrap gap-x-space-8 gap-y-space-4 p-0"
          style={{ opacity: n2(set === c.to ? c.k : 1 - c.k) }}
        >
          {MEANS[set].map((m) => (
            <li key={m.label} className="flex items-center gap-space-4 type-caption text-primary">
              <span className="swatch" data-swatch={m.swatch} />
              {m.label}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

/** The box's insides; the stage places it and gives it its glass. */
export function HeroTools({ beat, t }: { beat: number; t: number }) {
  return (
    <div className="relative flex w-full flex-col py-space-8">
      <div className="px-space-8 pb-space-4">
        <Mono as="span">{panelWords.tools}</Mono>
      </div>
      {TOOL_ROWS.map((row) => (
        <div key={row}>
          <Row beat={beat} t={t} row={row} />
          {row === 'colour' && <Means beat={beat} t={t} />}
        </div>
      ))}
    </div>
  );
}
