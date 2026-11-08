// The menu down the left of the workspace (specs/004-workspace): a BarBox docked to the window's edge,
// holding a person's conversations and, later, folders and more. It folds away and comes back (box.fold).
// It holds no state: open or folded comes from its ViewModel. Its width is a tile's until the surfaces
// stage decides it (design/polish-log.md).
import type { ReactNode } from 'react';
import { BarBox } from './BarBox.tsx';
import { Button } from './Button.tsx';
import { Mono } from './Mono.tsx';

export function SideRail({
  label,
  title,
  open,
  foldLabel,
  unfoldLabel,
  onFold,
  onUnfold,
  control,
  children,
}: {
  /** What a screen reader hears for the menu. */
  label: string;
  /** The bar's words. */
  title: string;
  open: boolean;
  foldLabel: string;
  unfoldLabel: string;
  onFold: () => void;
  onUnfold: () => void;
  /** Something the bar can do, before the fold. */
  control?: ReactNode;
  children: ReactNode;
}) {
  // box.fold
  if (!open) {
    return (
      <nav aria-label={label} className="flex shrink-0 flex-col p-block-gap">
        <Button variant="link" onClick={onUnfold}>
          {unfoldLabel}
        </Button>
      </nav>
    );
  }
  return (
    <nav aria-label={label} className="flex h-full w-tile-width shrink-0 flex-col">
      <BarBox
        kind="float"
        className="flex size-full flex-col bg-surface"
        bar={
          <div className="flex items-center justify-between gap-text-gap">
            <span className="min-w-0 truncate">
              <Mono as="span">{title}</Mono>
            </span>
            <span className="flex shrink-0 items-center gap-text-gap">
              {control}
              <Button variant="quiet" onClick={onFold}>
                {foldLabel}
              </Button>
            </span>
          </div>
        }
        barClassName="min-h-control-height shrink-0"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none">
          {children}
        </div>
      </BarBox>
    </nav>
  );
}
