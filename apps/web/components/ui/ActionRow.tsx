// A section's call to action: 32 between a button and a link, 12 between buttons; its buttons start at the left or
// sit centred, also when they wrap onto a second line.
import type { ReactNode } from 'react';

const GAPS = { wide: 'gap-space-32', tight: 'gap-text-gap' } as const;
const ALIGNS = { start: '', center: 'justify-center' } as const;

export function ActionRow({
  gap = 'wide',
  align = 'start',
  children,
}: {
  gap?: keyof typeof GAPS;
  align?: keyof typeof ALIGNS;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-wrap items-center ${GAPS[gap]} ${ALIGNS[align]}`}>{children}</div>
  );
}
