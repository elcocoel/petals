// Petals / Link 23:159: a label you can follow, no box. Underlined only under the pointer.
import type { ReactNode } from 'react';

export function TextLink({
  href,
  rel,
  children,
}: {
  href: string;
  rel?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} rel={rel} className="type-label text-primary no-underline hover:underline">
      {children}
    </a>
  );
}
