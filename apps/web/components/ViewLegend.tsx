// The legend (design/legend.md; Elco, 11 Nov: "an interactive visual legend element which is basically
// settings but it has to show up nice and pretty on published maps and interactive on a map we are working
// on"; board #92), as a tool panel (Elco, 12 Nov, walk 2: "like a tool panel where I would have drop downs to
// changing the things that it's very clearly to see what is category, what is input ... more inspired by the
// side panel"). Two sections under the side panel's heads: Dimensions, the person's view as a key (Settings'
// rows, one source, each always there, None too), and Map, what the map itself shows (the flower's groups to
// highlight, gravity, what a line is). Each row is its category on the left, quiet, and its input on the right:
// a dropdown where the legend changes the view (Settings' own hands: /make, and /map signed in), the value as
// words where it only reads. Under Colour, its keys. The glasses are the person's, never the petal's. Opaque, so
// it reads over a map: one of the overlays (Overlay; design/overlays.md). Props only.
import type { View } from '@petal/core/types';
import type { Dimension, Piece } from '@petal/core/view';
import type { ReactNode } from 'react';
import { BLOC_SPANS, type BlocChoice, type BlocSpan, blocWords } from '../lib/bloc-words.ts';
import type { LegendKey } from '../lib/flower-view.ts';
import { panelWords } from '../lib/panel-words.ts';
import { SETTINGS_ROWS, type SettingsRow } from '../lib/person-view.ts';
import {
  dataOf,
  type LegendEdit,
  SCALES,
  type Scale,
  scaleOf,
  takesScale,
} from '../lib/view-edit.ts';
import { LegendKeys } from './Legend.tsx';
import { Button } from './ui/Button.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { Range } from './ui/Range.tsx';
import { SectionHead } from './ui/SectionHead.tsx';
import { Select } from './ui/Select.tsx';
import { Switch } from './ui/Switch.tsx';

const words = panelWords.settings;

/**
 * Settings' own rows (lib/person-view.ts SETTINGS_ROWS: the brief's behaviours, then Labels), one source, so
 * the legend says what Settings sets (META's go, 11 Nov, inside #76's brief). Highlight has no place in a view:
 * its row is the flower's groups (its voting blocs, #94), under Map.
 */
const ORDER: readonly Dimension[] = SETTINGS_ROWS.filter(
  (d): d is Exclude<SettingsRow, 'highlight'> => d !== 'highlight',
);

/** A select's value for None. */
const NONE = '';

export type { LegendEdit };

/** The Highlight row's groups (lib/bloc-words.ts). */
export interface LegendGroups {
  choices: readonly BlocChoice[];
  /** the chosen group, by its id, or null */
  chosen: string | null;
  /** which votes they come from, and the period that is, in words */
  span: BlocSpan;
  period: string;
  onChoose: (id: string | null) => void;
  onSpan: (span: BlocSpan) => void;
  /** Outside any flower: nothing to choose yet, and the rows stay where they are (one menu, Elco's walk 3). */
  away?: boolean;
}

/** One row of the panel: its category on the left, its input or value on the right. */
function ToolRow({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-row-height items-center justify-between gap-space-8 px-space-8">
      <span className="min-w-0 shrink-0 type-ui text-muted">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-space-4">{children}</span>
    </div>
  );
}

/** A value the legend only says: the words, in the words' colour. */
function Value({ children }: { children: ReactNode }) {
  return <span className="min-w-0 truncate type-ui text-primary">{children}</span>;
}

/** Words under a row, quiet. */
function Note({ children }: { children: ReactNode }) {
  return <p className="my-0 px-space-8 pb-space-8 type-ui text-muted">{children}</p>;
}

/** A dimension's input: its data, and for a number its scale, as dropdowns; or what they are, in words. */
function DimensionInput({
  d,
  view,
  pieces,
  edit,
}: {
  d: Dimension;
  view: View;
  pieces: readonly Piece[];
  edit: LegendEdit | undefined;
}) {
  const data = dataOf(view, d);
  const scale = scaleOf(view, d, pieces);
  if (!edit) {
    return (
      <Value>
        {data === null
          ? words.none
          : scale
            ? `${words.piece(data)} · ${words.scales[scale].toLowerCase()}`
            : words.piece(data)}
      </Value>
    );
  }
  const dataOptions = [
    ...edit.choices[d].map((p) => ({ value: p.name, label: words.piece(p.name) })),
    { value: NONE, label: words.none },
  ];
  return (
    <>
      <Select
        label={words.dimensions[d]}
        value={data ?? NONE}
        options={dataOptions}
        onChange={(v) => edit.onPick(d, v === NONE ? null : v)}
      />
      {takesScale(view, d, pieces) && scale && (
        <Select
          label={`${words.dimensions[d]}, ${words.scale}`}
          value={scale}
          options={SCALES.map((s) => ({
            value: s,
            label: words.scales[s],
          }))}
          onChange={(v) => edit.onScale(d, v as Scale)}
        />
      )}
    </>
  );
}

export function ViewLegend({
  view,
  drawn,
  pieces,
  keys,
  keysNote,
  edit,
  groups,
  gravity,
  worth,
  insights,
  between,
  fold,
  bare = false,
}: {
  view: View;
  /** What each dimension draws on this flower, or null: core's inUse, in the person's view. */
  drawn: Record<Dimension, string | null>;
  /** Every piece of data the flower has, with its kind: what a scale applies to. */
  pieces: readonly Piece[];
  /** The colours this drawing paints, as its own key gives them. */
  keys: readonly LegendKey[];
  /** What the colours go by, said under Colour where there's no one key to give (a whole map). */
  keysNote?: string | undefined;
  edit?: LegendEdit | undefined;
  /**
   * The flower's groups for the Highlight row (#94): its voting blocs, the chosen one, and the hands that
   * choose one and the votes they come from. Choosing highlights a group on the map; it changes no one's view.
   */
  groups?: LegendGroups | undefined;
  /** On a map, how much its flowers draw together (Elco, 12 Nov: "gravity"), 0 apart to 1 close, kept for the visit. */
  gravity?: { value: number; onChange: (value: number) => void } | undefined;
  /**
   * On a map, whether each DAO's treasury and token price show under its name at some magnification (Elco, 12 Nov
   * walk 3: "switchable from OVERLAYS' tools box"); OVERLAYS draws its row.
   */
  worth?: { on: boolean; onChange: (on: boolean) => void } | undefined;
  /** On a map, whether Insights shows in its Information box (Elco, walk 3: "turn on insights on and off"). */
  insights?: { on: boolean; onChange: (on: boolean) => void } | undefined;
  /** On a map, what a line between two flowers is: its name and what it says. */
  between?: { label: string; says: string } | undefined;
  /** It folds to its bar, as every overlay can (design/overlays.md, line 6). */
  fold?: { open: boolean; onToggle: () => void } | undefined;
  /** Its rows alone, for a box that frames it (the map's floating boxes). */
  bare?: boolean;
}) {
  const chosen = groups?.choices.find((c) => c.id === groups.chosen);
  const body = (
    <>
      <SectionHead size="panel" title={panelWords.legendDimensions} />
      <div className="flex flex-col py-space-4">
        {ORDER.map((d) => (
          <div key={d} className="flex flex-col">
            <ToolRow label={words.dimensions[d]}>
              <DimensionInput d={d} view={view} pieces={pieces} edit={edit} />
            </ToolRow>
            {d === 'colour' && drawn.colour !== null && keysNote && <Note>{keysNote}</Note>}
            {d === 'colour' && drawn.colour !== null && keys.length > 0 && (
              <div className="px-space-8 pb-space-8">
                <LegendKeys keys={[...keys]} size="ui" />
              </div>
            )}
          </div>
        ))}
      </div>
      {(groups || gravity || worth || insights || between) && (
        <>
          <SectionHead size="panel" title={panelWords.legendMap} />
          <div className="flex flex-col py-space-4">
            {groups && (
              <>
                <ToolRow label={words.dimensions.highlight}>
                  <Select
                    label={words.dimensions.highlight}
                    value={groups.chosen ?? NONE}
                    options={[
                      { value: NONE, label: blocWords.none },
                      ...groups.choices.map((c) => ({
                        value: c.id,
                        label: `${c.label}, ${c.trail}`,
                      })),
                    ]}
                    onChange={(v) => groups.onChoose(v === NONE ? null : v)}
                  />
                </ToolRow>
                <ToolRow label={panelWords.legendVotes}>
                  <Select
                    label={panelWords.legendVotes}
                    value={groups.span}
                    options={BLOC_SPANS.map((s) => ({ value: s, label: blocWords.spans[s] }))}
                    onChange={(v) => groups.onSpan(v as BlocSpan)}
                  />
                </ToolRow>
                <Note>
                  {groups.away
                    ? `${blocWords.away}.`
                    : [
                        groups.choices.length === 0 && groups.period
                          ? `${blocWords.noneHere}.`
                          : '',
                        groups.period ? `${groups.period}.` : '',
                        chosen ? `${blocWords.caveat}.` : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                </Note>
              </>
            )}
            {gravity && (
              <ToolRow label={panelWords.legendGravity}>
                <span className="w-full min-w-0">
                  <Range
                    label={panelWords.legendGravity}
                    min={0}
                    max={1}
                    step={0.05}
                    value={gravity.value}
                    shown={`${Math.round(gravity.value * 100)}%`}
                    onChange={gravity.onChange}
                    // it's for the visit, not kept in the view: nothing to keep when the hand lets go
                    onSet={() => undefined}
                  />
                </span>
              </ToolRow>
            )}
            {worth && (
              <ToolRow label={panelWords.legendWorth}>
                <Switch label={panelWords.legendWorth} on={worth.on} onChange={worth.onChange} />
              </ToolRow>
            )}
            {insights && (
              <ToolRow label={panelWords.legendInsights}>
                <Switch
                  label={panelWords.legendInsights}
                  on={insights.on}
                  onChange={insights.onChange}
                />
              </ToolRow>
            )}
            {between && (
              <>
                <ToolRow label={between.label} />
                <Note>{between.says}</Note>
              </>
            )}
          </div>
        </>
      )}
      {/* the default back at a press, while the view isn't it (Elco: "keep a reset to default button handy") */}
      {edit?.onReset && (
        <div className="px-space-8 pt-space-4 pb-space-8">
          <Button variant="quiet" onClick={edit.onReset}>
            {words.reset}
          </Button>
        </div>
      )}
    </>
  );
  // in a box floating over the map (LandscapeCanvas) the box is its frame; elsewhere, one of the overlays
  if (bare) return <div className="flex flex-col px-space-8 pb-space-8">{body}</div>;
  return (
    <Overlay title={panelWords.legend} fold={fold} tool>
      {body}
    </Overlay>
  );
}
