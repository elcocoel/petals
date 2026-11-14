// A way somewhere that isn't built yet: greyed, not a link, and the one tooltip look (Tip) saying when it comes while
// the pointer is on it; a screen reader hears it with the name. Every destination whose address is still empty in
// lib/site-links.ts shows through this, so they all read the same.
import type { ReactNode } from 'react';
import { landingCopy } from '../../lib/landing-copy.ts';
import { Tip, type TipSide } from './Tip.tsx';

export function Soon({ children, side }: { children: ReactNode; side: TipSide }) {
  return (
    <span aria-disabled="true" className="group/tip relative inline-flex cursor-default text-muted">
      {children}
      <span className="sr-only">{landingCopy.soon}</span>
      <Tip label={landingCopy.soon} side={side} />
    </span>
  );
}
