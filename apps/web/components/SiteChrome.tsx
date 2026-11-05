// The nav and the reading column, around every page in app/(site). The workspace has its own frame, and
// the landing page draws its own bands.
import type { ReactNode } from 'react';
import { Nav } from './ui/Nav.tsx';

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-content-width px-block-gap py-column-gap">{children}</main>
    </>
  );
}
