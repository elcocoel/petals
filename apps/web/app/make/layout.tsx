// The workspace lays out its own spacing, so nothing in it reads as the site's prose (app/globals.css).
import type { ReactNode } from 'react';

export default function MakeLayout({ children }: { children: ReactNode }) {
  return <main data-workspace>{children}</main>;
}
