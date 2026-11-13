// The legend: an interactive visual legend, settings that read well on a published map and change things on a
// map being worked on, as a tool panel taken from the side panel that makes plain what is category and what is
// input. Two sections under the side panel's heads: Dimensions, the person's view as a key (Settings'
// rows, one source, each always there, None too), and Map, what the map itself shows (the flower's groups to
// highlight, gravity, what a line is). Each row is its category on the left, quiet, and its input on the right:
// a dropdown where the legend changes the view (Settings' own hands: /make, and /map signed in), the value as
// words where it only reads. Under Colour, its keys. The glasses are the person's, never the petal's. Opaque, so
// it reads over a map: one of the overlays (Overlay). Props only.
import type { View } from '@petal/core/types';
import { COLOUR_KEYS, DIMENSIONS, type Dimension, type Piece } from '@petal/core/view';
import { type ReactNode, useState } from 'react';
import { BLOC_SPANS, type BlocChoice, type BlocSpan, blocWords } from '../lib/bloc-words.ts';
import type { LegendKey } from '../lib/flower-view.ts';
import { panelWords } from '../lib/panel-words.ts';
import {
  dataOf,
  type LegendEdit,
  SCALES,
  type Scale,
  scaleOf,
  takesScale,
} from '../lib/view-edit.ts';
import { Button } from './ui/Button.tsx';
import { ColourPick } from './ui/ColourPick.tsx';
import { Mono } from './ui/Mono.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { Ramp } from './ui/Ramp.tsx';
import { Range } from './ui/Range.tsx';
import { SectionHead } from './ui/SectionHead.tsx';
import { Select } from './ui/Select.tsx';
import { Switch } from './ui/Switch.tsx';

const words = panelWords.settings;

/**
 * Every dimension of the view, grouped as a person reads a flower: first the four that say most, how the petals go
 * round the circle, how tall, what colour means and what names them; then the rest, folded under their head until
 * asked. Highlight has no place in a view: its row is the flower's groups (its voting blocs), under Highlight.
 */
const PETALS: readonly Dimension[] = ['order', 'height', 'colour', 'labels'];
const MORE: readonly Dimension[] = DIMENSIONS.filter((d) => !PETALS.includes(d));

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
  /** The flower has blocs, but none with members drawn on it. */
  elsewhere?: boolean;
  onChoose: (id: string | null) => void;
  onSpan: (span: BlocSpan) => void;
  /** Outside any flower: nothing to choose yet, and the rows stay where they are (one menu). */
  away?: boolean;
}

/**
 * One row of the panel: its category on the left, its input or value on the right; under the category, when it
 * has one, a quiet line saying what it does.
 */
function ToolRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div className={`flex flex-col px-space-8 ${hint ? 'pb-space-4' : ''}`}>
      <div className="flex min-h-row-height items-center justify-between gap-space-8">
        <span className={`min-w-0 shrink-0 type-ui ${hint ? 'text-primary' : 'text-muted'}`}>
          {label}
        </span>
        <span className="flex min-w-0 items-center justify-end gap-space-4">{children}</span>
      </div>
      {hint && <span className="type-ui text-muted">{hint}</span>}
    </div>
  );
}

/**
 * What each colour stands for, under Colour: one value a line, its swatch before it, led by a quiet line that
 * says so.
 */
function ColourMeans({ keys, edit }: { keys: readonly LegendKey[]; edit: LegendEdit | undefined }) {
  return (
    <div className="flex flex-col gap-space-4 px-space-8 pb-space-8">
      <Mono as="span" tone="muted">
        {words.colourMeans}
      </Mono>
      <ul className="m-0 flex list-none flex-col gap-space-4 p-0">
        {keys.map((k) => (
          <li key={k.label} className="flex items-center gap-space-4 type-ui text-primary">
            {edit?.onKey ? (
              // its swatch chooses its colour
              <ColourPick
                label={words.colourOf(k.label)}
                swatch={k.swatch}
                keys={COLOUR_KEYS}
                chosen={edit.colourKeys?.[k.label] ?? null}
                asItComes={words.asItComes}
                onPick={(key) => edit.onKey?.(k.label, key)}
              />
            ) : (
              <span className="swatch" data-swatch={k.swatch} />
            )}
            {`${k.label.charAt(0).toUpperCase()}${k.label.slice(1)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A value the legend only says: the words, in the words' colour. */
function Value({ children }: { children: ReactNode }) {
  return <span className="min-w-0 truncate type-ui text-primary">{children}</span>;
}

/** A square of accent while the map is drawn again in this row's choice, as a working row's is in the panel. */
function Drawing() {
  return (
    <span className="flex shrink-0 items-center" title={words.drawing}>
      <span aria-hidden="true" className="size-space-8 bg-accent" />
      <span className="sr-only" role="status">
        {words.drawing}
      </span>
    </span>
  );
}

/** Words under a row, quiet. */
function Note({ children }: { children: ReactNode }) {
  return <p className="my-0 px-space-8 pb-space-8 type-ui text-muted">{children}</p>;
}

/** A dimension's input: its data as a dropdown; or what it shows, with its scale, in words. */
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
  // a dimension no data takes yet says so, as Settings does (core's table: nothing of its kind exists today)
  if (edit && edit.choices[d].length === 0 && data === null) return <Value>{words.none}</Value>;
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
    <Select
      label={words.dimensions[d]}
      value={data ?? NONE}
      options={dataOptions}
      onChange={(v) => edit.onPick(d, v === NONE ? null : v)}
    />
  );
}

/** A number's scale, on its own row under its dimension, where the legend changes the view. */
function ScaleRow({
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
  const scale = scaleOf(view, d, pieces);
  if (!edit || !scale || !takesScale(view, d, pieces)) return null;
  return (
    <ToolRow label={words.scale} hint={words.scaleDoes}>
      <Select
        label={`${words.dimensions[d]}, ${words.scale}`}
        value={scale}
        options={SCALES.map((s) => ({ value: s, label: words.scales[s] }))}
        onChange={(v) => edit.onScale(d, v as Scale)}
      />
    </ToolRow>
  );
}

/**
 * A number or a date on Colour, as its grade: its two ends in words either side of the ramp, and, where the
 * legend changes the view, the grade's colour chosen by its own swatch.
 */
function ColourGrade({
  grade,
  edit,
}: {
  grade: { from: string; to: string; fills: string[] };
  edit: LegendEdit | undefined;
}) {
  const hue = edit?.colourKeys?.grade ?? null;
  return (
    <div className="flex flex-col gap-space-4 px-space-8 pb-space-8">
      <Mono as="span" tone="muted">
        {words.colourGrade}
      </Mono>
      <div className="flex items-center gap-space-8 type-ui text-muted">
        <span className="shrink-0">{grade.from}</span>
        <Ramp fills={grade.fills} label={`${grade.from} to ${grade.to}`} />
        <span className="shrink-0">{grade.to}</span>
      </div>
      {edit?.onKey && (
        <span className="flex items-center gap-space-4 type-ui text-muted">
          <ColourPick
            label={words.gradeHue}
            swatch={`key-${hue ?? 'mint'}`}
            keys={COLOUR_KEYS.filter((k) => k !== 'grey')}
            chosen={hue}
            asItComes={words.asItComes}
            onPick={(key) => edit.onKey?.('grade', key)}
          />
          {words.gradeHue}
        </span>
      )}
    </div>
  );
}

/**
 * One dimension's rows: its data, its scale where it's a number, a word where no data takes it yet, and under
 * Colour what each colour stands for, not the colour's name: inside a flower its values, each with its swatch; on
 * the whole map, where each DAO keys its own, a word.
 */
function DimensionRows({
  d,
  view,
  drawn,
  pieces,
  keys,
  keysNote,
  gradeKeys,
  edit,
}: {
  d: Dimension;
  view: View;
  drawn: Record<Dimension, string | null>;
  pieces: readonly Piece[];
  keys: readonly LegendKey[];
  keysNote: string | undefined;
  gradeKeys: { from: string; to: string; fills: string[] } | undefined;
  edit: LegendEdit | undefined;
}) {
  return (
    <div className="flex flex-col">
      <ToolRow label={words.dimensions[d]} hint={words.does[d]}>
        {edit?.drawing === d && <Drawing />}
        <DimensionInput d={d} view={view} pieces={pieces} edit={edit} />
      </ToolRow>
      <ScaleRow d={d} view={view} pieces={pieces} edit={edit} />
      {edit && edit.choices[d].length === 0 && dataOf(view, d) === null && (
        <Note>{words.nothingFits}</Note>
      )}
      {d === 'colour' && drawn.colour !== null && gradeKeys && (
        <ColourGrade grade={gradeKeys} edit={edit} />
      )}
      {d === 'colour' && drawn.colour !== null && !gradeKeys && keys.length > 0 && (
        <ColourMeans keys={keys} edit={edit} />
      )}
      {d === 'colour' && drawn.colour !== null && !gradeKeys && keys.length === 0 && keysNote && (
        <Note>{keysNote}</Note>
      )}
    </div>
  );
}

export function ViewLegend({
  view,
  drawn,
  pieces,
  keys,
  keysNote,
  gradeKeys,
  edit,
  groups,
  gravity,
  worth,
  insights,
  between,
  resetMap,
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
  /**
   * Where Colour shows a number or a date (a grade): its two ends in words and its five steps'
   * colours, lightest first, for a ramp under Colour.
   */
  gradeKeys?: { from: string; to: string; fills: string[] } | undefined;
  edit?: LegendEdit | undefined;
  /**
   * The flower's groups for the Highlight row: its voting blocs, the chosen one, and the hands that
   * choose one and the votes they come from. Choosing highlights a group on the map; it changes no one's view.
   */
  groups?: LegendGroups | undefined;
  /** On a map, how much its flowers draw together (gravity), 0 apart to 1 close, kept for the visit. */
  gravity?: { value: number; onChange: (value: number) => void } | undefined;
  /**
   * On a map, whether each DAO's treasury and token price show under its name at some magnification,
   * switched from the Tools box.
   */
  worth?: { on: boolean; onChange: (on: boolean) => void } | undefined;
  /** On a map, whether Insights shows in its Information box, switched on and off. */
  insights?: { on: boolean; onChange: (on: boolean) => void } | undefined;
  /** On a map, what a line between two flowers is: its name and what it says. */
  between?: { label: string; says: string } | undefined;
  /** Puts the map's own controls back as they came (Gravity, Votes, the switches, a chosen bloc), while one isn't. */
  resetMap?: (() => void) | undefined;
  /** It folds to its bar, as every overlay can. */
  fold?: { open: boolean; onToggle: () => void } | undefined;
  /** Its rows alone, for a box that frames it (the map's floating boxes). */
  bare?: boolean;
}) {
  const chosen = groups?.choices.find((c) => c.id === groups.chosen);
  // the rest of the dimensions, folded until asked: their head says how many there are
  const [moreOpen, setMoreOpen] = useState(false);
  // every section folds under its head, so a long panel never loses you; open as they come
  const [petalsOpen, setPetalsOpen] = useState(true);
  const [highlightOpen, setHighlightOpen] = useState(true);
  const [mapOpen, setMapOpen] = useState(true);
  const rows = { view, drawn, pieces, keys, keysNote, gradeKeys, edit };
  const body = (
    <>
      <SectionHead
        size="panel"
        title={panelWords.legendPetals}
        fold={{ open: petalsOpen, onToggle: () => setPetalsOpen((now) => !now) }}
      />
      {petalsOpen && (
        <div className="flex flex-col py-space-4">
          {PETALS.map((d) => (
            <DimensionRows key={d} d={d} {...rows} />
          ))}
        </div>
      )}
      <SectionHead
        size="panel"
        title={panelWords.legendMore(MORE.length)}
        fold={{ open: moreOpen, onToggle: () => setMoreOpen((now) => !now) }}
      />
      {moreOpen && (
        <div className="flex flex-col py-space-4">
          {MORE.map((d) => (
            <DimensionRows key={d} d={d} {...rows} />
          ))}
        </div>
      )}
      {groups && (
        <>
          <SectionHead
            size="panel"
            title={words.dimensions.highlight}
            fold={{ open: highlightOpen, onToggle: () => setHighlightOpen((now) => !now) }}
          />
          <div className={`flex-col py-space-4 ${highlightOpen ? 'flex' : 'hidden'}`}>
            <ToolRow label={panelWords.legendBlocs}>
              <Select
                label={panelWords.legendBlocs}
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
                    groups.choices.length === 0 && groups.elsewhere
                      ? `${blocWords.elsewhere}.`
                      : '',
                    groups.choices.length === 0 && !groups.elsewhere && groups.period
                      ? `${blocWords.noneHere}.`
                      : '',
                    groups.period ? `${groups.period}.` : '',
                    chosen ? `${blocWords.caveat}.` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
            </Note>
          </div>
        </>
      )}
      {(gravity || worth || insights || between) && (
        <>
          <SectionHead
            size="panel"
            title={panelWords.legendOnMap}
            fold={{ open: mapOpen, onToggle: () => setMapOpen((now) => !now) }}
          />
          <div className={`flex-col py-space-4 ${mapOpen ? 'flex' : 'hidden'}`}>
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
      {/* the default back at a press, while anything in Tools isn't it: the view, and the map's own controls
          for the visit */}
      {(edit?.onReset || resetMap) && (
        <div className="px-space-8 pt-space-4 pb-space-8">
          <Button
            variant="quiet"
            onClick={() => {
              edit?.onReset?.();
              resetMap?.();
            }}
          >
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
