// The root: html, body and fonts, and the person's view, read once on the server for the page and held for
// the browser (app/PersonView.tsx). The site's nav and the workspace's frame are their own layouts.
// Styling lives in globals.css and the generated tokens.

import { Bitcount_Grid_Single, Geist_Mono, Mona_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { viewerView } from '../lib/viewer-view.ts';
import { readVisitorFrom } from '../lib/visitor.ts';
import './globals.css';
import './versions/tokens.generated.css';
import './versions/v2.css';
import { PersonViewProvider } from './PersonView.tsx';
import { JoyLayer } from './versions/JoyLayer.tsx';
import { SWITCH_SCRIPT } from './versions/switch.ts';

// A page's call to the API is its visitor's: lib/visitor.ts.
readVisitorFrom(headers);

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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const person = await viewerView();
  return (
    // data-version is this branch's default. The script below may change it before the first paint, so
    // React shouldn't expect it to match.
    <html
      lang="en"
      data-version="2"
      suppressHydrationWarning
      className={`${monaSans.variable} ${geistMono.variable} ${bitcount.variable}`}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: our own constant, and it has to run before the first paint */}
        <script dangerouslySetInnerHTML={{ __html: SWITCH_SCRIPT }} />
      </head>
      <body data-b="surface">
        <PersonViewProvider initial={person}>
          {children}
          <JoyLayer />
        </PersonViewProvider>
      </body>
    </html>
  );
}
