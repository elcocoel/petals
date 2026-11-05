// /make wears the same chrome as the rest of the site. It stays outside (site) because the workspace
// is being rebuilt here (T183).
import type { ReactNode } from 'react';
import { SiteChrome } from '../../components/ui/SiteChrome.tsx';

export default function MakeLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
