// The legend (design/legend.md; Elco, 11 Nov: "an interactive visual legend element which is basically
// settings but it has to show up nice and pretty on published maps and interactive on a map we are working
// on"; board #92). The person's view drawn as a key: one row for each dimension that draws something on
// this flower, the brief's behaviours first (height, colour, segments; design/flower-art-direction/
// default-system-vnext.md), each saying the data it shows and, for a number, its scale, with the colours'
// keys under Colour. On a published map or a still picture it only reads. Handed Settings' own hands (on
// /make), a row opens the same choices Settings does (DimensionChoices), and a choice changes the person's
// view everywhere at once: the glasses are the person's, never the petal's. Opaque, so it reads over a
// map: one of the overlays (Overlay; design/overlays.md). Props only.
import type { View } from '@petal/core/types';
import type { Dimension, Piece } from '@petal/core/view';
import type { LegendKey } from '../lib/flower-view.ts';
import { panelWords } from '../lib/panel-words.ts';
import { type Scale, scaleOf } from '../lib/view-edit.ts';
import { LegendKeys } from './Legend.tsx';
import { NavItem } from './ui/NavItem.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { DimensionChoices } from './workspace/ViewControls.tsx';

const words = panelWords.settings;

/** The brief's behaviours first, then the rest of view/v2's dimensions. */
const ORDER: readonly Dimension[] = [
  'height',
  'colour',
  'segments',
  'order',
  'width',
  'outline',
  'texture',
  'markings',
  'lines',
  'labels',
];

/** Settings' hands, where the legend changes the person's view. */
export interface LegendEdit {
  defaults: View;
  /** For each dimension, the data that fits it. */
  choices: Record<Dimension, readonly Piece[]>;
  /** The dimension whose choices are open. */
  open: Dimension | null;
  onOpen: (d: Dimension) => void;
  onPick: (d: Dimension, data: string | null) => void;
  onScale: (d: Dimension, scale: Scale) => void;
}

export function ViewLegend({
  view,
  drawn,
  pieces,
  keys,
  edit,
  fold,
}: {
  view: View;
  /** What each dimension draws on this flower, or null: core's inUse, in the person's view. */
  drawn: Record<Dimension, string | null>;
  /** Every piece of data the flower has, with its kind: what a scale applies to. */
  pieces: readonly Piece[];
  /** The colours this drawing paints, as its own key gives them. */
  keys: readonly LegendKey[];
  edit?: LegendEdit | undefined;
  /** It folds to its bar, as every overlay can (design/overlays.md, line 6). */
  fold?: { open: boolean; onToggle: () => void } | undefined;
}) {
  // a row whose choices are open stays while they are, even at None (design/legend.md, line 6)
  const rows = ORDER.filter((d) => drawn[d] !== null || edit?.open === d);
  return (
    <Overlay title={panelWords.legend} fold={fold}>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((d) => {
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
