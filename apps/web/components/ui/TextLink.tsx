// Petals / Link 23:159: a label you can follow, no box. Underlined only under the pointer. The rail's
// items are this link with an icon, and a quiet one is the same link a size down.
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon.tsx';

const VARIANTS = {
  label: 'type-label text-primary',
  quiet: 'type-caption text-muted hover:text-primary',
  rail: 'flex items-center gap-icon-gap py-rail-item-block type-label whitespace-nowrap text-primary',
} as const;

export function TextLink({
  href,
  rel,
  target,
  variant = 'label',
  icon,
  children,
}: {
  href: string;
  rel?: string;
  target?: string;
  variant?: keyof typeof VARIANTS;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      rel={rel}
      target={target}
      className={`no-underline hover:underline ${VARIANTS[variant]}`}
    >
      {icon && <Icon name={icon} />}
      {children}
    </a>
  );
}
