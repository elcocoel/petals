// The side panel (specs/004-workspace; Elco, 10 Nov: "a grown-up side panel", like Orca's): docked to the
// window's left edge, the full height, with a hairline between it and the work. At its top, the fold and
// the wordmark; then the few places and actions that are always there, one row each; then the groups,
// which scroll. Folded, it keeps the fold and those places as icons, in the same spots, so nothing moves
// under the hand (box.fold). It holds no state: open or folded comes from its ViewModel.
import type { ReactNode } from 'react';
import type { IconName } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import { NavItem } from './NavItem.tsx';
import { Wordmark } from './Wordmark.tsx';

/** A place or an action that is always in the panel, open or folded. */
export type RailItem = {
  key: string;
  icon: IconName;
  label: string;
} & ({ href: string; current?: boolean } | { href?: undefined; onClick: () => void });

function Item({ item, open }: { item: RailItem; open: boolean }) {
  if (open) {
    return item.href !== undefined ? (
      <NavItem
        href={item.href}
        current={item.current ?? false}
        icon={item.icon}
        label={item.label}
      />
    ) : (
      <NavItem onClick={item.onClick} icon={item.icon} label={item.label} />
    );
  }
  return item.href !== undefined ? (
    <IconButton href={item.href} icon={item.icon} label={item.label} />
  ) : (
    <IconButton onClick={item.onClick} icon={item.icon} label={item.label} />
  );
}

// box.fold
export function SideRail({
  label,
  open,
  foldLabel,
  unfoldLabel,
  onFold,
  onUnfold,
  items,
  children,
}: {
  /** What a screen reader hears for the panel. */
  label: string;
  open: boolean;
  foldLabel: string;
  unfoldLabel: string;
  onFold: () => void;
  onUnfold: () => void;
  items: RailItem[];
  /** The groups, shown while it's open. */
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className={`flex h-full shrink-0 flex-col border-r border-hairline bg-surface ${open ? 'w-sidebar-width' : ''}`}
    >
      <div className="flex h-control-height shrink-0 items-center gap-space-8 px-space-8">
        <IconButton
          icon="sidebar"
          label={open ? foldLabel : unfoldLabel}
          onClick={open ? onFold : onUnfold}
          expanded={open}
        />
        {open && <Wordmark size="panel" />}
      </div>
      <ul className="m-0 flex shrink-0 list-none flex-col p-0 px-space-8">
        {items.map((item) => (
          <li key={item.key}>
            <Item item={item} open={open} />
          </li>
        ))}
      </ul>
      {open && (
        <div className="flex min-h-0 flex-1 flex-col gap-space-16 overflow-y-auto overscroll-none px-space-8 pt-space-16 pb-block-gap">
          {children}
        </div>
      )}
    </nav>
  );
}
