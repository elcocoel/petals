// The nav and the reading column, around every page in app/(site). The workspace has its own frame, and
// the landing page draws its own bands.
import type { ReactNode } from 'react';
import { Nav } from './ui/Nav.tsx';

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <ReadingColumn as="main">{children}</ReadingColumn>
    </>
  );
}

/** The reading column alone: a canvas page's words when it has no flower to show (app/(canvas)). */
export function ReadingColumn({
  as: Tag = 'div',
  children,
}: {
  as?: 'main' | 'div';
  children: ReactNode;
}) {
  return <Tag className="mx-auto max-w-content-width px-block-gap py-column-gap">{children}</Tag>;
}
