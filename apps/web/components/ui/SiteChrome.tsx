// The nav and the reading column, around every page that isn't the landing: app/(site)/layout.tsx and
// app/make/layout.tsx.
import type { ReactNode } from 'react';
import { Nav } from './Nav.tsx';

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-content-width px-block-gap py-column-gap">{children}</main>
    </>
  );
}
