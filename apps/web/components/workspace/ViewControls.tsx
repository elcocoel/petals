// One dimension's choices in the person's view, the glasses through which they see every map: what Tools
// (ViewLegend) opens under a dimension's row. Props only; nothing is written here but what it's handed.
import type { View } from '@petal/core/types';
import type { Dimension, Piece } from '@petal/core/view';
import { panelWords } from '../../lib/panel-words.ts';
import { dataOf, SCALES, type Scale, scaleOf, takesScale } from '../../lib/view-edit.ts';
import { NavItem } from '../ui/NavItem.tsx';

const words = panelWords.settings;

/**
 * One dimension's choices, as its row opens them: only the data that fits it, then None, the default marked,
 * and, while it shows a number on a dimension that has one, its scale.
 */
export function DimensionChoices({
  dimension: d,
  view,
  defaults,
  fit,
  pieces,
  onPick,
  onScale,
}: {
  dimension: Dimension;
  view: View;
  defaults: View;
  /** The data that fits this dimension. */
  fit: readonly Piece[];
  pieces: readonly Piece[];
  onPick: (d: Dimension, data: string | null) => void;
  onScale: (d: Dimension, scale: Scale) => void;
}) {
  const shown = dataOf(view, d);
  const usual = dataOf(defaults, d);
  const scale = scaleOf(view, d, pieces);
  const usualScale = scaleOf(defaults, d, pieces);
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {fit.map((p) => (
        <li key={p.name}>
          <NavItem
            onClick={() => onPick(d, p.name)}
            chosen={shown === p.name}
            label={words.piece(p.name)}
            depth={1}
            {...(usual === p.name ? { trail: words.isDefault } : {})}
          />
        </li>
      ))}
      <li>
        <NavItem
          onClick={() => onPick(d, null)}
          chosen={shown === null}
          label={words.none}
          depth={1}
          {...(usual === null ? { trail: words.isDefault } : {})}
        />
      </li>
      {takesScale(view, d, pieces) && (
        <>
          <li>
            <NavItem label={words.scale} muted depth={1} />
          </li>
          {SCALES.map((s) => (
            <li key={s}>
              <NavItem
                onClick={() => onScale(d, s)}
                chosen={scale === s}
                label={words.scales[s]}
                depth={2}
                {...(usualScale === s && usual === shown ? { trail: words.isDefault } : {})}
              />
            </li>
          ))}
        </>
      )}
    </ul>
  );
}
