// The side panel's state, held by the layout /make and /lobby share (app/(work)/layout.tsx), so the panel
// stays put while the page beside it changes (Elco, 10 Nov: "when I click on a new conversation, the whole
// page reloads - so the side bar is fake?"). It reads who's here, the person's conversations and the
// panel's own state (useWorkMenu), and says which conversation is open from the address, which the page
// keeps true. The page tells it two things through WorkPanelContext: when to read the list again (a turn
// started or ended, a job moved) and the name Petals' agent just gave the open conversation. It also holds
// the person's own state (the session, the profile and its editor, the credit), once, which the panel's
// Profile and Lobby sections and the lobby page all read. No timer.
import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { type ConversationRow, conversationRows } from '../lib/conversation-list.ts';
import { useConversations } from './useConversations.ts';
import { useFunds } from './useFunds.ts';
import { useProfile } from './useProfile.ts';
import { useProfileEditor } from './useProfileEditor.ts';
import { useSession } from './useSession.ts';
import { useWorkMenu } from './useWorkMenu.ts';

/** The person's own state, read once here for the panel and the lobby page alike (LOBBY, 10 Nov: one state,
 * not two reads, so a Saved or a withdrawal shows in both). */
export interface PanelPerson {
  session: ReturnType<typeof useSession>;
  profile: ReturnType<typeof useProfile>;
  editor: ReturnType<typeof useProfileEditor>;
  funds: ReturnType<typeof useFunds>;
}

/** What the page beside the panel reads from it and tells it. */
export interface WorkPanelBus {
  /** The panel is on the page: someone is signed in. */
  shown: boolean;
  /** The person's own state; null outside the shared layout. */
  person: PanelPerson | null;
  /** The person's conversations, the open one marked, as the panel shows them. */
  rows: ConversationRow[];
  /** Read the list and the agents again whenever this changes. */
  touch: (signal: string) => void;
  /** The name Petals' agent gave the open conversation in this page's stream, or null. */
  name: (title: string | null) => void;
  /**
   * How many times a conversation has been opened here: by a link, by New, by back or forward. The page
   * keys its conversation by it, so a move opens one clean, while a refresh of the page's data, or the
   * page writing its own address, keeps the one that's open.
   */
  visit: number;
  /** The page is about to write this address itself (history.replaceState): it isn't a move. */
  claim: (address: string) => void;
  /** Open the conversation again from clean, at the same address: New, pressed where it already is. */
  restart: () => void;
}

/** An address as the router reports it, so a claimed one and a seen one compare the same. */
export const addressOf = (path: string, query: string) => {
  const q = new URLSearchParams(query).toString();
  return q ? `${path}?${q}` : path;
};

const NOBODY: WorkPanelBus = {
  shown: false,
  person: null,
  rows: [],
  touch: () => {},
  name: () => {},
  visit: 0,
  claim: () => {},
  restart: () => {},
};

export const WorkPanelContext = createContext<WorkPanelBus>(NOBODY);

/** The panel, from the page beside it. Outside the shared layout there's none, and nothing to tell. */
export function useWorkPanel(): WorkPanelBus {
  return useContext(WorkPanelContext);
}

/** The layout's own: everything the panel shows, and the bus for the page. */
export function usePanelState() {
  const session = useSession(true);
  const signedIn = Boolean(session.account);
  const profile = useProfile();
  const editor = useProfileEditor(profile.account, profile.social, profile.reload);
  const funds = useFunds();
  const pathname = usePathname();
  const params = useSearchParams();
  const runId = params.get('run');
  const elsewhere = params.get('elsewhere') ?? undefined;
  const [signal, setSignal] = useState('');
  const [named, setNamed] = useState<string | null>(null);
  // A move is any change of address the page didn't write itself. It's counted while rendering, so the
  // page's new conversation and its key arrive in the same render, and a render twice over counts once.
  const address = addressOf(pathname, params.toString());
  const seen = useRef(address);
  const claimed = useRef<string | null>(null);
  const visits = useRef(0);
  const [, rerender] = useState(0);
  if (address !== seen.current) {
    seen.current = address;
    if (address === claimed.current) claimed.current = null;
    else visits.current += 1;
  }
  const claim = useCallback((to: string) => {
    const at = new URL(to, window.location.origin);
    claimed.current = addressOf(at.pathname, at.search);
  }, []);
  const restart = useCallback(() => {
    visits.current += 1;
    rerender((n) => n + 1);
  }, []);
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
  const person = useMemo<PanelPerson>(
    () => ({ session, profile, editor, funds }),
    [session, profile, editor, funds],
  );
  const visit = visits.current;
  const bus = useMemo<WorkPanelBus>(
    () => ({
      shown: signedIn,
      person,
      rows,
      touch: setSignal,
      name: setNamed,
      visit,
      claim,
      restart,
    }),
    [signedIn, person, rows, visit, claim, restart],
  );
  // what the Profile and Lobby sections say: the lobby's own state, not a second read of it
  const you = {
    account: session.account,
    social: profile.social,
    balance: funds.balance,
    leave: session.disconnect,
  };
  return {
    bus,
    menu,
    rows,
    you,
    here: pathname === '/lobby' ? ('lobby' as const) : undefined,
    // New, pressed where a new conversation already is: the address won't change, so it says so itself
    atNew: address === '/make',
    restart,
  };
}
