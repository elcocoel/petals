// The site's nav and content column, for every page that isn't the workspace.
import type { ReactNode } from 'react';
import { TextLink } from './ui/TextLink.tsx';
import { Wordmark } from './ui/Wordmark.tsx';

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="flex flex-wrap items-center justify-between gap-block-gap border-b border-hairline px-block-gap py-block-gap md:px-page-inset">
        <a href="/" aria-label="Petals, home">
          <Wordmark />
        </a>
        <div className="flex flex-wrap gap-block-gap">
          <TextLink href="/gallery">Gallery</TextLink>
          <TextLink href="/connect">Use your own AI</TextLink>
        </div>
      </nav>
      <main className="mx-auto max-w-content-width px-block-gap py-column-gap">{children}</main>
    </>
  );
}
