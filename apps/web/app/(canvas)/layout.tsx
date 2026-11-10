// Pages where the live canvas fills the window under the site's nav: a flower's page and a draft
// (coordinator/one-source.md, step 4), and the Power Map (step 5). The URLs don't change: (canvas) is only
// a folder.
import type { ReactNode } from 'react';
import { Nav } from '../../components/ui/Nav.tsx';

export default function CanvasLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <Nav />
      <main className="relative min-h-0 flex-1">{children}</main>
    </div>
  );
}
