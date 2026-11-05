// The small mono label. Muted beside the work, text-primary above a section, and accent where a section
// asks for it, For Builders on ink. Case is written in the copy.
import type { ReactNode } from 'react';

const TONES = { muted: 'text-muted', primary: 'text-primary', accent: 'text-accent' } as const;

export function Eyebrow({
  as: Tag = 'p',
  tone = 'muted',
  children,
}: {
  as?: 'p' | 'span';
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return <Tag className={`my-0 type-mono whitespace-pre-wrap ${TONES[tone]}`}>{children}</Tag>;
}
