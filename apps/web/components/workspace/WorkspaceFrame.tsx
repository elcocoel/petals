// The workspace's frame: header on top, rail on the left, the page's columns beside it. It takes the
// whole window and doesn't scroll; each column scrolls inside. Below `wide` the columns stack.
import type { ReactNode } from 'react';
import { NavigationRail } from './NavigationRail.tsx';
import { WorkspaceHeader } from './WorkspaceHeader.tsx';

export function WorkspaceFrame({ section, children }: { section: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col wide:h-dvh">
      <WorkspaceHeader section={section} />
      <div className="flex min-h-0 flex-1 flex-col wide:flex-row">
        <NavigationRail />
        <main data-workspace className="flex min-h-0 min-w-0 flex-1 flex-col wide:flex-row">
          {children}
        </main>
      </div>
    </div>
  );
}
