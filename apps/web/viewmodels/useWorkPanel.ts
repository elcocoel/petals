// The side panel's state, held by the layout /make and /lobby share (app/(work)/layout.tsx), so the panel
// stays put while the page beside it changes (Elco, 10 Nov: "when I click on a new conversation, the whole
// page reloads - so the side bar is fake?"). It reads who's here, the person's conversations and the
// panel's own state (useWorkMenu), and says which conversation is open from the address, which the page
// keeps true. The page tells it two things through WorkPanelContext: when to read the list again (a turn
// started or ended, a job moved) and the name Petals' agent just gave the open conversation. No timer.
import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, useContext, useMemo, useState } from 'react';
import { type ConversationRow, conversationRows } from '../lib/conversation-list.ts';
import { useConversations } from './useConversations.ts';
import { useSession } from './useSession.ts';
import { useWorkMenu } from './useWorkMenu.ts';

/** What the page beside the panel reads from it and tells it. */
export interface WorkPanelBus {
  /** The panel is on the page: someone is signed in. */
  shown: boolean;
  /** The person's conversations, the open one marked, as the panel shows them. */
  rows: ConversationRow[];
  /** Read the list and the agents again whenever this changes. */
  touch: (signal: string) => void;
  /** The name Petals' agent gave the open conversation in this page's stream, or null. */
  name: (title: string | null) => void;
}

const NOBODY: WorkPanelBus = { shown: false, rows: [], touch: () => {}, name: () => {} };

export const WorkPanelContext = createContext<WorkPanelBus>(NOBODY);

/** The panel, from the page beside it. Outside the shared layout there's none, and nothing to tell. */
export function useWorkPanel(): WorkPanelBus {
  return useContext(WorkPanelContext);
}

/** The layout's own: everything the panel shows, and the bus for the page. */
export function usePanelState() {
  const session = useSession(true);
  const signedIn = Boolean(session.account);
  const pathname = usePathname();
  const params = useSearchParams();
  const runId = params.get('run');
  const elsewhere = params.get('elsewhere') ?? undefined;
  const [signal, setSignal] = useState('');
  const [named, setNamed] = useState<string | null>(null);
  // read again on every move and whenever the page signals; nothing is read for nobody
  const listed = useConversations(signedIn ? `${pathname}?${params.toString()}:${signal}` : null);
  const menu = useWorkMenu(signedIn, signal);
  // a name Petals' agent gives the open conversation shows as it arrives, not only when the list is read
  const rows = useMemo(
    () =>
      conversationRows(listed, { runId, elsewhere }).map((row) =>
        named && row.current && row.by === 'petals' ? { ...row, title: named } : row,
      ),
    [listed, runId, elsewhere, named],
  );
  const bus = useMemo<WorkPanelBus>(
    () => ({ shown: signedIn, rows, touch: setSignal, name: setNamed }),
    [signedIn, rows],
  );
  return { bus, menu, rows, here: pathname === '/lobby' ? ('lobby' as const) : undefined };
}
