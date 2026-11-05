// The workspace's frame: its own header and rail, in place of the site's nav.
import type { ReactNode } from 'react';
import { WorkspaceFrame } from '../../components/workspace/WorkspaceFrame.tsx';

export default function MakeLayout({ children }: { children: ReactNode }) {
  return <WorkspaceFrame section="Make a flower">{children}</WorkspaceFrame>;
}
