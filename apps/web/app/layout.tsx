// The site shell: fonts, tokens, the nav. Styling lives in globals.css and the generated tokens.
import { Bitcount_Grid_Single, Geist_Mono, Mona_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { TextLink } from '../components/ui/TextLink.tsx';
import { Wordmark } from '../components/ui/Wordmark.tsx';
import './globals.css';

// Each `variable` is the one packages/tokens/source.ts names under `fonts`.
const monaSans = Mona_Sans({ subsets: ['latin'], variable: '--font-mona-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
// The wordmark's layers set these axes. Block rather than swap: three stacked copies in a fallback
// font would flash as a smear.
const bitcount = Bitcount_Grid_Single({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['CRSV', 'ELSH', 'ELXP', 'slnt'],
  variable: '--font-bitcount',
  display: 'block',
});

export const metadata = {
  title: 'Petals',
  description: 'See who holds power in a network, drawn as a flower. NEAR first.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${monaSans.variable} ${geistMono.variable} ${bitcount.variable}`}>
      <body>
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
      </body>
    </html>
  );
}
