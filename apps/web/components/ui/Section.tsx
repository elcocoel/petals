// The landing page's shell, one of them for every band: a surface edge to edge, its content in a
// column as wide as Figma's frame, so a wider window gets more band and no longer lines. Nav and
// Footer are this too. Grayscale smoothing is how Figma draws type; macOS's default thickens it.
import type { SurfaceName } from '@petal/tokens';
import type { ReactNode } from 'react';
import { Surface } from './Surface.tsx';

const PADDING = {
  section: 'px-block-gap py-section-inset md:px-page-inset md:py-section-padding',
  // Figma lets the hero's figure run closer to the edge than the page inset.
  hero: 'px-block-gap py-section-inset md:pt-space-56 md:pr-block-gap md:pb-page-inset md:pl-page-inset',
  nav: 'px-block-gap py-space-22 md:px-page-inset',
  footer: 'px-block-gap pt-page-inset pb-space-40 md:px-page-inset',
} as const;

const RULES = { top: 'border-t border-hairline', bottom: 'border-b border-hairline' } as const;

export function Section({
  kind = 'ground',
  as = 'section',
  padding = 'section',
  rule,
  id,
  children,
}: {
  kind?: SurfaceName;
  as?: 'section' | 'footer' | 'nav';
  padding?: keyof typeof PADDING;
  /** A hairline on this edge, the whole width of the window. */
  rule?: keyof typeof RULES;
  id?: string;
  children: ReactNode;
}) {
  return (
    <Surface kind={kind} as={as} id={id} className={rule && RULES[rule]}>
      <div className={`mx-auto w-full max-w-page-width antialiased ${PADDING[padding]}`}>
        {children}
      </div>
    </Surface>
  );
}
