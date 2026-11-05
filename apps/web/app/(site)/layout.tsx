// Every page in here reads in the site's chrome. The URLs don't change: (site) is only a folder.
import type { ReactNode } from 'react';
import { SiteChrome } from '../../components/ui/SiteChrome.tsx';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
