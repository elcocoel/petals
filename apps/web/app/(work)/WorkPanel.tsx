'use client';
// Wires the side panel's state (usePanelState) to the panel (WorkMenu), once, for every page in this
// layout, and hands the page beside it the bus (WorkPanelContext). The page comes first in the markup, so
// the panel paints over a page that fills the window (the workspace's canvas) and under a box a hand
// raised; the panel still lays out first, on the left.
import type { ReactNode } from 'react';
import { WorkMenu } from '../../components/workspace/WorkMenu.tsx';
import { usePanelState, WorkPanelContext } from '../../viewmodels/useWorkPanel.ts';

export function WorkPanel({ children }: { children: ReactNode }) {
  const { bus, menu, rows, you, here } = usePanelState();
  return (
    <WorkPanelContext.Provider value={bus}>
      <div className="flex h-dvh">
        <div className="min-w-0 flex-1">{children}</div>
        {bus.shown && (
          <div className="order-first flex">
            <WorkMenu conversations={rows} menu={menu} you={you} here={here} />
          </div>
        )}
      </div>
    </WorkPanelContext.Provider>
  );
}
