// The small mono line: an eyebrow over a heading, a caption under a figure, a note under a row of
// buttons, the footer's small print. text-primary unless a tone says otherwise: muted beside the work,
// accent where a section asks for it. Double spaces are Figma's. Case is written in the copy.
import type { ReactNode } from 'react';

const TONES = { primary: 'text-primary', muted: 'text-muted', accent: 'text-accent' } as const;

export function Mono({
  as: Tag = 'p',
  tone = 'primary',
  children,
}: {
  as?: 'p' | 'span' | 'figcaption';
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return <Tag className={`my-0 type-mono whitespace-pre-wrap ${TONES[tone]}`}>{children}</Tag>;
}
