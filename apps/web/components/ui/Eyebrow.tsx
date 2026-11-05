// The small mono label. Muted beside the work; above a section it takes the surface's eyebrow role,
// Ink on ground and mint, Mint on ink (Figma's landing frame). Case is written in the copy.
import type { ReactNode } from 'react';

const TONES = { muted: 'text-muted', section: 'text-eyebrow' } as const;

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
