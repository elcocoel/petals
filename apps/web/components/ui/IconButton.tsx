// A control that is only an icon, in the side panel: a square one row high. Its name is read aloud, and
// shown in a tooltip beside it while the pointer is over it or the keyboard is on it: to its right in the
// bar, to its left at a row's end, so it stays in sight. The fill under the pointer is item's, as a row's
// is. A way somewhere is Next's Link, as NavItem's is.
import Link from 'next/link';
import type { MouseEventHandler } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import { Tip, type TipSide } from './Tip.tsx';

const LOOK =
  'group/tip relative inline-flex size-row-height shrink-0 items-center justify-center bg-transparent p-0 text-muted hover:z-20 hover:bg-tint hover:text-primary hover:opacity-100 focus-visible:z-20 aria-expanded:text-primary data-current:bg-tint data-current:text-primary';

export function IconButton({
  icon,
  label,
  current,
  tip = 'left',
  ...rest
}: {
  icon: IconName;
  /** What it does, in a person's words: read aloud, and its tooltip. */
  label: string;
  /** The one of these that's on. */
  current?: boolean;
  /** Where its tooltip shows: right in the bar, left at a row's end. */
  tip?: TipSide;
} & (
  | { href: string }
  | {
      href?: undefined;
      onClick: MouseEventHandler<HTMLButtonElement>;
      /** It opens or folds something, and this says which it is now. */
      expanded?: boolean;
    }
)) {
  if (rest.href !== undefined) {
    return (
      <Link
        href={rest.href}
        prefetch={false}
        aria-current={current ? 'page' : undefined}
        data-current={current ? '' : undefined}
        aria-label={label}
        data-button=""
        data-b="item"
        className={LOOK}
      >
        <Icon name={icon} small />
        <Tip label={label} side={tip} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={rest.expanded}
      aria-pressed={current}
      data-current={current ? '' : undefined}
      onClick={rest.onClick}
      data-b="item"
      className={LOOK}
    >
      <Icon name={icon} small />
      <Tip label={label} side={tip} />
    </button>
  );
}
