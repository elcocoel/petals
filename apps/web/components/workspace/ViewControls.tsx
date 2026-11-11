// The person's view, as the Settings section sets it (coordinator/one-source.md, section 3 and step 7; Elco,
// 10 Nov: "I'm basically choosing the glasses through which I see the entire universe"). One row per
// dimension, all of them (ten since Labels, view/v2), saying the data it shows; pressing one opens its choices under it, as a project
// opens its conversations: only the data that fits it, or none, with the default marked, and, while it
// shows a number on a dimension that has one, its scale. A dimension no data takes yet can't open: it has no
// chevron, and says so on hover.
// Choosing saves at once; the last row puts the default back, when there's a change to undo. Nothing is
// written here but what it's handed: any mapping core's table allows. Props only.
import type { View } from '@petal/core/types';
import type { Dimension, Piece } from '@petal/core/view';
import { panelWords } from '../../lib/panel-words.ts';
import { dataOf, SCALES, type Scale, scaleOf, takesScale } from '../../lib/view-edit.ts';
import { NavItem } from '../ui/NavItem.tsx';

const words = panelWords.settings;

export function ViewControls({
  dimensions,
  view,
  defaults,
  choices,
  pieces,
  open,
  onOpen,
  onPick,
  onScale,
  onReset,
  failed,
}: {
  dimensions: readonly Dimension[];
  view: View;
  /** The default view, to mark its choices. */
  defaults: View;
  /** For each dimension, the data that fits it. */
  choices: Record<Dimension, readonly Piece[]>;
  /** Every piece of data a flower has, with its kind: what a scale applies to. */
  pieces: readonly Piece[];
  /** The dimension whose choices are open. */
  open: Dimension | null;
  onOpen: (d: Dimension) => void;
  onPick: (d: Dimension, data: string | null) => void;
  onScale: (d: Dimension, scale: Scale) => void;
  /** Puts the default back; absent while the view is the default. */
  onReset?: (() => void) | undefined;
  /** Why the last change wasn't saved. */
  failed: string | null;
}) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {dimensions.map((d) => {
        const shown = dataOf(view, d);
        const fit = choices[d];
        const trail = shown ? words.piece(shown) : words.none;
        if (fit.length === 0) {
          return (
            <li key={d}>
              {/* it can't open, so no chevron; its name still starts where the others' do */}
              <NavItem
                label={words.dimensions[d]}
                trail={trail}
                title={`${words.dimensions[d]}\n${words.nothingFits}`}
                muted
                depth={1}
              />
            </li>
          );
        }
        const isOpen = open === d;
        const usual = dataOf(defaults, d);
        const scale = scaleOf(view, d, pieces);
        const usualScale = scaleOf(defaults, d, pieces);
        return (
          <li key={d}>
            <NavItem
              onClick={() => onOpen(d)}
              expanded={isOpen}
              icon="chevron"
              label={words.dimensions[d]}
              trail={trail}
            />
            {isOpen && (
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
                          {...(usualScale === s && usual === shown
                            ? { trail: words.isDefault }
                            : {})}
                        />
                      </li>
                    ))}
                  </>
                )}
              </ul>
            )}
          </li>
        );
      })}
      {failed && (
        <li>
          <NavItem label={words.failed(failed)} title={words.failed(failed)} muted />
        </li>
      )}
      {/* the section's one action is its last row, and only when there's a change to undo */}
      {onReset && (
        <li>
          <NavItem onClick={onReset} icon="undo" label={words.reset} muted />
        </li>
      )}
    </ul>
  );
}
