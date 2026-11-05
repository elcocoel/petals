// The small mono line: what a figure is, a note under a row of buttons, the footer's small print.
// Double spaces are Figma's. Case is written in the copy.
import type { ReactNode } from 'react';

export function Caption({
  as: Tag = 'p',
  children,
}: {
  as?: 'p' | 'figcaption';
  children: ReactNode;
}) {
  return <Tag className="my-0 type-mono whitespace-pre-wrap">{children}</Tag>;
}
