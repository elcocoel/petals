// The small mono label above a heading. Case is written in the copy, never transformed.
import type { ReactNode } from 'react';

export function Eyebrow({ as: Tag = 'p', children }: { as?: 'p' | 'span'; children: ReactNode }) {
  return <Tag className="type-mono-label text-muted">{children}</Tag>;
}
