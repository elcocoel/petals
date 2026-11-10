// One row of the side panel: a way somewhere, a thing to do, or a line that says what's there. One row
// high, UI words cut with an ellipsis and shown in full on hover, an icon before them and, at the far end,
// when it last moved or a count, in mono. A square of accent says something is working there now. The
// fill under the pointer and under where you are is item's (item.soft in v2). A row nested in a project
// starts where its project's words do. A way somewhere is Next's Link, so moving inside the site is a move,
// not a load: the side panel stays where it is.
import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import { Mono } from './Mono.tsx';

const BASE =
  'flex h-row-height w-full min-w-0 items-center justify-start gap-space-8 bg-transparent px-space-8 text-left type-ui whitespace-nowrap no-underline';
const ANSWERS = 'hover:bg-tint hover:opacity-100 data-current:bg-tint';
/** How far in a row starts: at its group, in a project, or under a row in a project. */
const DEPTH = { 0: '', 1: 'pl-space-32', 2: 'pl-column-gap' } as const;

type Where =
  | {
      href: string;
      /** The one of these you are on. */
      current?: boolean;
    }
  | {
      href?: undefined;
      onClick: MouseEventHandler<HTMLButtonElement>;
      /** It opens or folds the rows under it, and this says which it is now. */
      expanded?: boolean;
    }
  | {
      /** A line that says what's there, which goes nowhere. It may hold one control at its end. */
      href?: undefined;
      onClick?: undefined;
      action?: ReactNode;
    };

export function NavItem({
  label,
  icon,
  trail,
  working,
  muted,
  depth = 0,
  title,
  trailGivesWay,
  ...where
}: {
  label: string;
  icon?: IconName;
  /** When it last moved, or a count: a few characters of mono, never cut. */
  trail?: string;
  /** Something is working there now; the words are read aloud in place of the square. */
  working?: string;
  /** A line that says what's there rather than naming a thing. */
  muted?: boolean;
  depth?: keyof typeof DEPTH;
  /** Shown on hover: the words in full, and anything a row leaves out. */
  title?: string;
  /** A control takes the trail's place on hover (its row is a `group`): the trail keeps its room. */
  trailGivesWay?: boolean;
} & Where) {
  const expanded = 'expanded' in where ? where.expanded : undefined;
  const content = (
    <>
      {icon && (
        <span
          className={`flex shrink-0 text-muted ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          <Icon name={icon} small />
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate ${muted ? 'text-muted' : 'text-primary'}`}>
        {label}
      </span>
      {working && (
        <span className="flex shrink-0 items-center">
          <span aria-hidden="true" className="size-space-8 bg-accent" />
          <span className="sr-only">{working}</span>
        </span>
      )}
      {trail && (
        <span
          className={`shrink-0 ${trailGivesWay ? 'group-focus-within:invisible group-hover:invisible' : ''}`}
        >
          <Mono as="span" tone="muted">
            {trail}
          </Mono>
        </span>
      )}
    </>
  );
  const look = `${BASE} ${DEPTH[depth]}`;
  const hover = title ?? label;
  if (where.href !== undefined) {
    return (
      <Link
        href={where.href}
        // the workspace is read fresh on each move; forty rows mustn't each ask the server ahead
        prefetch={false}
        title={hover}
        aria-current={where.current ? 'page' : undefined}
        data-current={where.current ? '' : undefined}
        data-button=""
        data-b="item"
        className={`${look} ${ANSWERS}`}
      >
        {content}
      </Link>
    );
  }
  if (where.onClick) {
    return (
      <button
        type="button"
        title={hover}
        aria-expanded={expanded}
        onClick={where.onClick}
        data-b="item"
        className={`${look} ${ANSWERS}`}
      >
        {content}
      </button>
    );
  }
  return (
    <div title={hover} className={look}>
      {content}
      {'action' in where && where.action}
    </div>
  );
}
