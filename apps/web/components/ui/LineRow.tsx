// A row that holds a few lines and opens what's under it (a claim on the map, MapClaims), or does one thing (a
// next step, NextSteps): it answers as the side panel's rows do (NavItem's fill under the pointer, and while it's open), but it's as tall as its
// lines, its words wrap and it starts at the panel's inset. Props only.
import type { ReactNode } from 'react';

export function LineRow({
  expanded,
  onClick,
  children,
}: {
  /** What's under it is open; left out where it opens nothing. */
  expanded?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-b="item"
      aria-expanded={expanded}
      onClick={onClick}
      className="flex h-auto w-full flex-col items-start gap-space-4 bg-transparent px-space-8 py-space-8 text-left whitespace-normal text-primary hover:bg-tint hover:opacity-100 aria-expanded:bg-tint"
    >
      {children}
    </button>
  );
}
