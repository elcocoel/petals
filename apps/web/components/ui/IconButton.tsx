// A control that is only an icon, in the side panel: a square one row high. Its name is read aloud, and
// shown in a tooltip beside it while the pointer is over it or the keyboard is on it (design/side-panel.md,
// line 6): to its right in the bar, to its left at a row's end, so it stays in sight. The fill under the
// pointer is item's, as a row's is. A way somewhere is Next's Link, as NavItem's is.
import Link from 'next/link';
import type { MouseEventHandler } from 'react';
import { Icon, type IconName } from './Icon.tsx';

const LOOK =
  'group/tip relative inline-flex size-row-height shrink-0 items-center justify-center bg-transparent p-0 text-muted hover:z-20 hover:bg-tint hover:text-primary hover:opacity-100 focus-visible:z-20 aria-expanded:text-primary data-current:bg-tint data-current:text-primary';

const TIP =
  'pointer-events-none invisible absolute top-1/2 z-20 -translate-y-1/2 whitespace-nowrap bg-action px-space-8 py-space-4 type-ui text-on-action group-hover/tip:visible group-focus-visible/tip:visible';
const SIDE = { right: 'left-full ml-space-8', left: 'right-full mr-space-8' } as const;

function Tip({ label, side }: { label: string; side: keyof typeof SIDE }) {
  return (
    <span aria-hidden="true" className={`${TIP} ${SIDE[side]}`}>
      {label}
    </span>
  );
}

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
  tip?: keyof typeof SIDE;
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
