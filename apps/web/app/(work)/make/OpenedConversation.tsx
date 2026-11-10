'use client';
// The conversation on /make, opened once per move: it's keyed by the side panel's count of moves
// (viewmodels/useWorkPanel.ts, visit), so a link, New, back or forward opens one clean, and a refresh of
// the page's data from the server (a saved view redrawing the tiles) or the page writing its own address
// keeps the one that's open.
import { Fragment, type ReactNode } from 'react';
import { useWorkPanel } from '../../../viewmodels/useWorkPanel.ts';

export function OpenedConversation({ children }: { children: ReactNode }) {
  return <Fragment key={useWorkPanel().visit}>{children}</Fragment>;
}
