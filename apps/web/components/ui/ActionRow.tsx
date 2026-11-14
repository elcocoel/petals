// A section's call to action: 32 between a button and a link, 12 between buttons; its buttons start at the left or
// sit centred, also when they wrap onto a second line. Stacked: on a phone, one under another at the full width.
import type { ReactNode } from 'react';

const GAPS = { wide: 'gap-space-32', tight: 'gap-text-gap' } as const;
const ALIGNS = { start: '', center: 'justify-center' } as const;

export function ActionRow({
  gap = 'wide',
  align = 'start',
  stacked = false,
  children,
}: {
  gap?: keyof typeof GAPS;
  align?: keyof typeof ALIGNS;
  /** On a phone, the buttons one under another, each the row's full width. */
  stacked?: boolean;
  children: ReactNode;
}) {
  const flow = stacked
    ? 'flex-col items-stretch sm:flex-row sm:flex-wrap sm:items-center'
    : 'flex-wrap items-center';
  return <div className={`flex ${flow} ${GAPS[gap]} ${ALIGNS[align]}`}>{children}</div>;
}
