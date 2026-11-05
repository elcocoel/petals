// A section's call to action: 32 between a button and a link, 12 between buttons.
import type { ReactNode } from 'react';

const GAPS = { wide: 'gap-space-32', tight: 'gap-text-gap' } as const;

export function ActionRow({
  gap = 'wide',
  children,
}: {
  gap?: keyof typeof GAPS;
  children: ReactNode;
}) {
  return <div className={`flex flex-wrap items-center ${GAPS[gap]}`}>{children}</div>;
}
