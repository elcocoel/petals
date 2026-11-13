// A tile you press (the landing's, leading people to action): a box with a few words that rises and tilts,
// and the whole tile is the link. On a light band the box is paper (box.paper); `glass` keeps the band's
// own glass, for ink, where paper would go white. `action` sits under the box, the way it goes, and draws
// its underline when the tile is pointed at (link.card). Without an `href` the tile is a slot waiting for
// its address: it shows, but goes nowhere.
import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';

export function PlateLink({
  href,
  glass = false,
  action,
  children,
}: {
  href?: string;
  glass?: boolean;
  /** Where it goes, under the box. */
  action?: string;
  children: ReactNode;
}) {
  const box = (
    <span
      data-b="box"
      data-kind={glass ? undefined : 'plate'}
      className="flex w-full grow flex-col justify-between gap-block-gap border border-hairline p-block-gap"
    >
      {children}
    </span>
  );
  if (!href)
    return (
      <div className="flex h-full flex-col">
        {box}
        {action && <span className="pt-block-gap type-label text-muted">{action}</span>}
      </div>
    );
  return (
    <a href={href} data-b="link" data-kind="card" className="flex h-full flex-col no-underline">
      {box}
      {action && (
        <span className="mt-block-gap inline-flex items-center gap-space-8 type-label">
          {action}
          <Icon name="arrow" />
        </span>
      )}
    </a>
  );
}
