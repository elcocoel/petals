'use client';
// The conversation on /make, opened once per move: it's keyed by the side panel's count of moves
// (viewmodels/useWorkPanel.ts, visit), so a link, New, back or forward opens one clean, and a refresh of
// the page's data from the server (a saved view redrawing the tiles) or the page writing its own address
// keeps the one that's open. A move opens the new conversation only once the page's data is for the
// address showing: on Back the address changes first and the data after, and opening on the old data
// would open the conversation Back just left (WORKSPACE's find).
import { useSearchParams } from 'next/navigation';
import { Fragment, type ReactNode, useRef } from 'react';
import { conversationAt } from '../../../lib/workspace-url.ts';
import { useWorkPanel } from '../../../viewmodels/useWorkPanel.ts';

export function OpenedConversation({
  opens,
  children,
}: {
  /** The conversation the page's data is for (conversationAt). */
  opens: string;
  children: ReactNode;
}) {
  const { visit } = useWorkPanel();
  const params = useSearchParams();
  const showing = conversationAt({
    run: params.get('run') ?? undefined,
    elsewhere: params.get('elsewhere') ?? undefined,
  });
  // counted while rendering, as the visits are, so the key and the data change in one render
  const opened = useRef(visit);
  if (visit !== opened.current && opens === showing) opened.current = visit;
  return <Fragment key={opened.current}>{children}</Fragment>;
}
