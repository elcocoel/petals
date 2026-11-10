// A control that is only an icon, in the side panel: a square one row high. Its name is read aloud and
// shown on hover, since there are no words beside it. The fill under the pointer is item's, as a row's is.
// A way somewhere is Next's Link, as NavItem's is.
import Link from 'next/link';
import type { MouseEventHandler } from 'react';
import { Icon, type IconName } from './Icon.tsx';

const LOOK =
  'inline-flex size-row-height shrink-0 items-center justify-center bg-transparent p-0 text-muted hover:bg-tint hover:text-primary hover:opacity-100 aria-expanded:text-primary';

export function IconButton({
  icon,
  label,
  ...rest
}: {
  icon: IconName;
  /** What it does, in a person's words: read aloud and shown on hover. */
  label: string;
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
        aria-label={label}
        title={label}
        data-button=""
        data-b="item"
        className={LOOK}
      >
        <Icon name={icon} small />
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={rest.expanded}
      onClick={rest.onClick}
      data-b="item"
      className={LOOK}
    >
      <Icon name={icon} small />
    </button>
  );
}
