// The side panel (specs/004-workspace; Elco, 10 Nov: "a grown-up side panel", like Orca's, and "when the
// session is collapsed, the tool buttons take me to versions of the sidebar itself, and each of them is a
// set of tools"). Docked to the window's left edge, the full height. A bar of icons, one per section, is
// always there, with the person's own two (Profile, Settings) at its foot, as in every IDE. Pressing one
// opens its section in the panel beside it, in place; pressing the open one again folds the panel back to
// the bar, and pressing another switches. The open section's icon is marked. It holds no state: which
// section is open comes from its ViewModel.
import type { ReactNode } from 'react';
import type { IconName } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import { Wordmark } from './Wordmark.tsx';

/** One section of the panel, as its icon in the bar. */
export interface RailSection {
  key: string;
  icon: IconName;
  /** Its name, read aloud and shown on hover. */
  label: string;
  /** At the bar's foot: the person's own. */
  foot?: boolean;
}

function Icons({
  sections,
  open,
  onChoose,
}: {
  sections: RailSection[];
  open: string | null;
  onChoose: (key: string) => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-space-4 p-0">
      {sections.map((s) => (
        <li key={s.key}>
          <IconButton
            icon={s.icon}
            label={s.label}
            current={open === s.key}
            onClick={() => onChoose(s.key)}
          />
        </li>
      ))}
    </ul>
  );
}

// box.fold
export function SideRail({
  label,
  sections,
  open,
  onChoose,
  children,
}: {
  /** What a screen reader hears for the panel. */
  label: string;
  sections: RailSection[];
  /** The section open beside the bar, by key, or null when the panel is folded to it. */
  open: string | null;
  onChoose: (key: string) => void;
  /** The open section's rows. */
  children: ReactNode;
}) {
  return (
    <nav aria-label={label} className="flex h-full shrink-0 border-r border-hairline bg-surface">
      <div className="flex shrink-0 flex-col justify-between p-space-8">
        <Icons sections={sections.filter((s) => !s.foot)} open={open} onChoose={onChoose} />
        <Icons sections={sections.filter((s) => s.foot)} open={open} onChoose={onChoose} />
      </div>
      {open !== null && (
        <div className="flex w-sidebar-width flex-col border-l border-hairline">
          <div className="flex h-control-height shrink-0 items-center px-space-16">
            <Wordmark size="panel" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-space-16 overflow-y-auto overscroll-none px-space-8 pb-block-gap">
            {children}
          </div>
        </div>
      )}
    </nav>
  );
}
