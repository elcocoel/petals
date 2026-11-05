// Petals / Link 23:159: a label you can follow, no box. Underlined only under the pointer.
// The mono variant is the action line of a note box (Figma's "ASK WHY", 66:2231).
import type { ReactNode } from 'react';
import { Arrow } from './Arrow.tsx';

const VARIANTS = {
  label: { type: 'type-label', gap: 'gap-space-6' },
  mono: { type: 'type-mono-tiny', gap: 'gap-text-gap' },
} as const;

export function TextLink({
  href,
  rel,
  variant = 'label',
  arrow,
  children,
}: {
  href: string;
  rel?: string;
  variant?: keyof typeof VARIANTS;
  /** A trailing arrow, drawn. */
  arrow?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      rel={rel}
      className={`text-primary no-underline hover:underline ${VARIANTS[variant].type} ${arrow ? `inline-flex items-center ${VARIANTS[variant].gap}` : ''}`}
    >
      {children}
      {arrow && <Arrow />}
    </a>
  );
}
