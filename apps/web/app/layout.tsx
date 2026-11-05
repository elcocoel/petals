// The root: html, body and fonts. The site's nav and the workspace's frame are their own layouts.
// Styling lives in globals.css and the generated tokens.
import { Bitcount_Grid_Single, Geist_Mono, Mona_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
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
      <body>{children}</body>
    </html>
  );
}
