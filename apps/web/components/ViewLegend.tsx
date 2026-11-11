// The legend (design/legend.md; Elco, 11 Nov: "an interactive visual legend element which is basically
// settings but it has to show up nice and pretty on published maps and interactive on a map we are working
// on"; board #92). The person's view drawn as a key: one row for each of Settings' rows that draws
// something on this flower (the brief's behaviours, then Labels; design/flower-art-direction/
// default-system-vnext.md), each saying the data it shows and, for a number, its scale, with the colours'
// keys under Colour. On a published map or a still picture it only reads. Handed Settings' own hands (on
// /make), a row opens the same choices Settings does (DimensionChoices), and a choice changes the person's
// view everywhere at once: the glasses are the person's, never the petal's. Opaque, so it reads over a
// map: one of the overlays (Overlay; design/overlays.md). Props only.
import type { View } from '@petal/core/types';
import type { Dimension, Piece } from '@petal/core/view';
import { BLOC_SPANS, type BlocChoice, type BlocSpan, blocWords } from '../lib/bloc-words.ts';
import type { LegendKey } from '../lib/flower-view.ts';
import { panelWords } from '../lib/panel-words.ts';
import { SETTINGS_ROWS, type SettingsRow } from '../lib/person-view.ts';
import { type LegendEdit, scaleOf } from '../lib/view-edit.ts';
import { LegendKeys } from './Legend.tsx';
import { Mono } from './ui/Mono.tsx';
import { NavItem } from './ui/NavItem.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { DimensionChoices } from './workspace/ViewControls.tsx';

const words = panelWords.settings;

/**
 * Settings' own rows (lib/person-view.ts SETTINGS_ROWS: the brief's behaviours, then Labels), one source, so
 * the legend says what Settings sets (META's go, 11 Nov, inside #76's brief). Highlight has no place in a view:
 * its row is the flower's groups (its voting blocs, #94), when it's handed them.
 */
const ORDER: readonly Dimension[] = SETTINGS_ROWS.filter(
  (d): d is Exclude<SettingsRow, 'highlight'> => d !== 'highlight',
);

export type { LegendEdit };

/** The Highlight row's groups (lib/bloc-words.ts). */
export interface LegendGroups {
  choices: readonly BlocChoice[];
  /** the chosen group, by its id, or null */
  chosen: string | null;
  /** its choices are open */
  open: boolean;
  /** which votes they come from, and the period that is, in words */
  span: BlocSpan;
  period: string;
  onOpen: () => void;
  onChoose: (id: string | null) => void;
  onSpan: (span: BlocSpan) => void;
}

/** Highlight: the chosen group or None; pressed, the flower's groups, None first, then what they rest on. */
function HighlightRow({ groups }: { groups: LegendGroups }) {
  const chosen = groups.choices.find((c) => c.id === groups.chosen);
  return (
    <li>
      <NavItem
        onClick={groups.onOpen}
        expanded={groups.open}
        icon="chevron"
        label={words.dimensions.highlight}
        trail={chosen?.label ?? blocWords.none}
      />
      {groups.open && (
        <ul className="m-0 flex list-none flex-col p-0 pl-space-32">
          <li>
            <NavItem
              onClick={() => groups.onChoose(null)}
              chosen={groups.chosen === null}
              label={blocWords.none}
            />
          </li>
          {groups.choices.length === 0 && (
            <li className="px-space-8 py-space-4 type-ui text-muted">{blocWords.noneHere}</li>
          )}
          {groups.choices.map((c) => (
            <li key={c.id}>
              <NavItem
                onClick={() => groups.onChoose(c.id)}
                chosen={groups.chosen === c.id}
                label={c.label}
                trail={c.trail}
              />
            </li>
          ))}
          {BLOC_SPANS.map((s) => (
            <li key={s}>
              <NavItem
                onClick={() => groups.onSpan(s)}
                chosen={groups.span === s}
                label={blocWords.spans[s]}
              />
            </li>
          ))}
          <li className="flex flex-col gap-space-4 px-space-8 pt-space-4 pb-space-8">
            <Mono as="span" tone="muted">
              {groups.period}
            </Mono>
            <span className="type-ui text-muted">{blocWords.caveat}</span>
          </li>
        </ul>
      )}
    </li>
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
  fold,
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
   * The flower's groups for the Highlight row (#94): its voting blocs, the chosen one, and the hands that open
   * them and choose one. Choosing highlights a group on the map; it changes no one's view.
   */
  groups?: LegendGroups | undefined;
  /** It folds to its bar, as every overlay can (design/overlays.md, line 6). */
  fold?: { open: boolean; onToggle: () => void } | undefined;
}) {
  // a row whose choices are open stays while they are, even at None (design/legend.md, line 6)
  const shown = ORDER.filter((d) => drawn[d] !== null || edit?.open === d);
  // the Highlight row stands where Settings has it, before Labels
  const rows: (Dimension | 'highlight')[] = SETTINGS_ROWS.filter((r) =>
    r === 'highlight' ? groups !== undefined : shown.includes(r),
  );
  return (
    <Overlay title={panelWords.legend} fold={fold}>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((d) => {
          if (d === 'highlight') return groups ? <HighlightRow key={d} groups={groups} /> : null;
          const data = drawn[d];
          const scale = scaleOf(view, d, pieces);
          const trail =
            data === null
              ? words.none
              : scale
                ? `${words.piece(data)} · ${words.scales[scale].toLowerCase()}`
                : words.piece(data);
          return (
            <li key={d}>
              {edit ? (
                <NavItem
                  onClick={() => edit.onOpen(d)}
                  expanded={edit.open === d}
                  icon="chevron"
                  label={words.dimensions[d]}
                  trail={trail}
                />
              ) : (
                <NavItem label={words.dimensions[d]} trail={trail} />
              )}
              {edit && edit.open === d && (
                <DimensionChoices
                  dimension={d}
                  view={view}
                  defaults={edit.defaults}
                  fit={edit.choices[d]}
                  pieces={pieces}
                  onPick={edit.onPick}
                  onScale={edit.onScale}
                />
              )}
              {d === 'colour' && data !== null && keysNote && (
                <p
                  className={`my-0 pb-space-8 type-ui text-muted ${edit ? 'pl-space-32' : 'px-space-8'}`}
                >
                  {keysNote}
                </p>
              )}
              {d === 'colour' && data !== null && keys.length > 0 && (
                // the keys start where the rows' words do, past the chevron where there is one
                <div className={`pb-space-8 ${edit ? 'pl-space-32' : 'px-space-8'}`}>
                  <LegendKeys keys={[...keys]} size="ui" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Overlay>
  );
}
