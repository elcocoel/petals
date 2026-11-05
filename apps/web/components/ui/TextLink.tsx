// Petals / Link 23:159: a label you can follow, no box. Underlined only under the pointer. The rail's
// items are this link with an icon, a quiet one is the same link a size down, and a mono one is the
// action line of a note box (Figma's "ASK WHY", 66:2231).
import type { ReactNode } from 'react';
import { Arrow } from './Arrow.tsx';
import { Icon, type IconName } from './Icon.tsx';

const VARIANTS = {
  label: 'type-label text-primary',
  quiet: 'type-caption text-muted hover:text-primary',
  rail: 'flex items-center gap-space-8 py-space-8 type-label whitespace-nowrap text-primary',
  mono: 'type-mono-tiny text-primary',
} as const;

export function TextLink({
  href,
  rel,
  target,
  variant = 'label',
  icon,
  arrow,
  children,
}: {
  href: string;
  rel?: string;
  target?: string;
  variant?: keyof typeof VARIANTS;
  icon?: IconName;
  /** A trailing arrow, drawn. */
  arrow?: boolean;
  children: ReactNode;
}) {
  const withArrow = arrow
    ? `inline-flex items-center ${variant === 'mono' ? 'gap-text-gap' : 'gap-space-4'}`
    : '';
  return (
    <a
      href={href}
      rel={rel}
      target={target}
      className={`no-underline hover:underline ${VARIANTS[variant]} ${withArrow}`}
    >
      {icon && <Icon name={icon} />}
      {children}
      {arrow && <Arrow />}
    </a>
  );
}
