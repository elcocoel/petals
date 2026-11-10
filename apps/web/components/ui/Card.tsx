// A card: one title, one job (the small set, Figma "Lobby / Card head"). Its head holds the title, an
// optional badge beside it and at most one action on the right; everything else is its body. It's a box
// you read, not one you press: under v2 it takes box's glass and rises in, and never lifts, tilts or swells
// (v2.css, JoyLayer), so it doesn't read as something to click.
import type { ReactNode } from 'react';

export function Card({
  title,
  badge,
  action,
  labelledBy,
  children,
}: {
  title: string;
  /** Information beside the title: a Badge. */
  badge?: ReactNode;
  /** The card's one action: a Button. */
  action?: ReactNode;
  /** The id its title takes, for the section's name. */
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      data-b="box"
      data-kind="card"
      className="flex min-w-0 flex-col gap-space-16 border border-hairline bg-surface p-block-gap text-primary"
    >
      <div className="flex min-h-row-height items-center gap-text-gap">
        <h2 id={labelledBy} className="m-0 type-label font-semibold">
          {title}
        </h2>
        {badge}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}
