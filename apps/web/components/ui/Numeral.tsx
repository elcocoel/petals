// The pixel numeral over a step (66:2275): Bitcount Grid Single, in the surface's accent.
import type { ReactNode } from 'react';

export function Numeral({ children }: { children: ReactNode }) {
  return <p className="my-0 type-pixel-numeral text-accent">{children}</p>;
}
