'use client';
// The side panel (specs/004-workspace; design/side-panel.md, every state and every click; Elco, 10 Nov:
// "once the sidebar is open, I can see all of the sections one after the other"). Docked to the window's
// left edge, the full height. A bar of icons is always there: first the one collapse control, which always
// works, then one icon per section, with the person's own two (Profile, Settings) at its foot, as in VS
// Code and every IDE; each icon's name shows in a tooltip. Open, the panel beside the bar is one column of
// every section in order, scrolling as one under the wordmark; a section's icon scrolls it to that section,
// and collapsed, opens it there. Its right edge is a sash that sizes it. It holds no state: open or
// collapsed, the section asked for and the width's hands come from its ViewModel; it only scrolls.
import { type PointerEvent, type ReactNode, useEffect, useRef } from 'react';
import type { IconName } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import { Wordmark } from './Wordmark.tsx';

/** One section of the panel: its icon in the bar, and its rows in the column. */
export interface RailSection {
  key: string;
  icon: IconName;
  /** Its name, read aloud and in its icon's tooltip. */
  label: string;
  /** At the bar's foot: the person's own. */
  foot?: boolean;
  content: ReactNode;
}

/** The sash's hands and the column's: the ViewModel writes the width straight to the column. */
export interface RailWidth {
  panel: (el: HTMLElement | null) => void;
  sash: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
  };
}

export const sectionId = (key: string) => `panel-${key}`;

function Icons({ sections, onJump }: { sections: RailSection[]; onJump: (key: string) => void }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-space-4 p-0">
      {sections.map((s) => (
        <li key={s.key}>
          <IconButton icon={s.icon} label={s.label} tip="right" onClick={() => onJump(s.key)} />
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
  toggleLabel,
  onToggle,
  onJump,
  jump,
  width,
}: {
  /** What a screen reader hears for the panel. */
  label: string;
  sections: RailSection[];
  open: boolean;
  /** The collapse control's name, as it is now: hide, or show. */
  toggleLabel: string;
  onToggle: () => void;
  /** A section's icon was pressed. */
  onJump: (key: string) => void;
  /** The section to bring to the top, and how many times it's been asked, so asking again scrolls again. */
  jump: { key: string; n: number } | null;
  width: RailWidth;
}) {
  const column = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !jump) return;
    const at = column.current?.querySelector(`#${sectionId(jump.key)}`);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    at?.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
  }, [open, jump]);
  return (
    <nav aria-label={label} className="flex h-full shrink-0 border-r border-hairline bg-surface">
      <div className="flex shrink-0 flex-col justify-between p-space-8">
        <div className="flex flex-col gap-space-16">
          <IconButton
            icon="sidebar"
            label={toggleLabel}
            tip="right"
            onClick={onToggle}
            expanded={open}
          />
          <Icons sections={sections.filter((s) => !s.foot)} onJump={onJump} />
        </div>
        <Icons sections={sections.filter((s) => s.foot)} onJump={onJump} />
      </div>
      {open && (
        <div
          ref={width.panel}
          className="relative flex w-sidebar-width shrink-0 flex-col border-l border-hairline"
        >
          <div className="flex h-control-height shrink-0 items-center px-space-16">
            <Wordmark size="panel" />
          </div>
          <div
            ref={column}
            className="flex min-h-0 flex-1 flex-col gap-space-16 overflow-y-auto overscroll-none px-space-8 pb-block-gap"
          >
            {sections.map((s) => (
              <div key={s.key} id={sectionId(s.key)}>
                {s.content}
              </div>
            ))}
          </div>
          {/* the sash: drag to size, double-click for the usual width */}
          <span
            aria-hidden="true"
            {...width.sash}
            className="absolute top-0 -right-space-4 bottom-0 w-space-8 cursor-col-resize touch-none"
          />
        </div>
      )}
    </nav>
  );
}
