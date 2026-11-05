// The small mono label above a heading. Case is written in the copy, never transformed.
import type { ReactNode } from 'react';

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="type-mono-label text-muted">{children}</p>;
}
