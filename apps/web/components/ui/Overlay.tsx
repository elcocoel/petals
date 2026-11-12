// One overlay over the map (design/overlays.md; Elco, 11 Nov: "the general element of overlays on the map
// needs a specific and consistent design language"; board #95). The floating boxes' own surface and edge
// (BarBox kind float: the conversation's and the flower box's glass), their bar with the overlay's name in
// mono; pressing the bar folds it to the bar and back, with the side panel's chevron. What goes in it is the
// panel's rows (NavItem): the app scale, and a chosen row's soft fill is what's selected. Props only.
import type { ReactNode } from 'react';
import { BarBox } from './BarBox.tsx';
import { Icon } from './Icon.tsx';

export function Overlay({
  title,
  fold,
  tool = false,
  children,
}: {
  /** Its name, in its bar, and what a screen reader hears for it. */
  title: string;
  /** It folds to its bar: whether it's open now, and the hand that folds it. */
  fold?: { open: boolean; onToggle: () => void } | undefined;
  /** A tool panel (the legend, Insights): its sections' heads reach its edges, as the side panel's do. */
  tool?: boolean;
  children: ReactNode;
}) {
  const open = fold ? fold.open : true;
  return (
    // folded, it's as wide as its bar, so it covers only that much of the map
    <section
      aria-label={title}
      className={`flex flex-col ${open ? 'w-tile-width' : 'w-fit max-w-tile-width'}`}
    >
      <BarBox
        kind="float"
        className="bg-surface"
        folded={!open}
        barSize="row"
        bar={
          fold ? (
            <button
              type="button"
              aria-expanded={fold.open}
              onClick={fold.onToggle}
              className="flex h-row-height w-full min-w-0 items-center justify-start gap-space-8 bg-transparent p-0 type-mono text-primary hover:opacity-100"
            >
              <span className={`flex shrink-0 text-muted ${fold.open ? 'rotate-90' : ''}`}>
                <Icon name="chevron" small />
              </span>
              <span className="min-w-0 truncate">{title}</span>
            </button>
          ) : (
            <span className="block min-w-0 truncate type-mono text-primary">{title}</span>
          )
        }
      >
        {open && (
          <div
            className={`flex flex-col ${tool ? 'px-space-8 pb-space-8' : 'px-space-16 py-space-8'}`}
          >
            {children}
          </div>
        )}
      </BarBox>
    </section>
  );
}
