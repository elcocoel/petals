// The lobby's ViewModel (specs/004-workspace, W3): who's here, their conversations, the flowers on the map,
// and whether the menu is open. Reads happen when the page opens, and the conversations once the server
// has said who's here. There is no timer.
import { useEffect, useState } from 'react';
import { listMapFlowers } from '../lib/agent-client.ts';
import { conversationRows } from '../lib/conversation-list.ts';
import type { ListedFlower } from '../lib/flower-view.ts';
import { mapTiles } from '../lib/lobby-view.ts';
import { useConversations } from './useConversations.ts';
import { useSession } from './useSession.ts';

export function useLobby() {
  const session = useSession(true);
  // Only a person has conversations: read them once the server has said someone is here.
  const conversations = useConversations(session.known && session.account ? 'arrived' : null);
  const [flowers, setFlowers] = useState<ListedFlower[]>([]);
  useEffect(() => {
    let gone = false;
    void listMapFlowers().then(
      (next) => {
        if (!gone) setFlowers(next);
      },
      // no answer leaves the map empty
      () => {},
    );
    return () => {
      gone = true;
    };
  }, []);
  // box.fold: the menu starts open, as an IDE's does, and folds away by hand
  const [menuOpen, setMenuOpen] = useState(true);
  return {
    session,
    conversations: conversationRows(conversations, { runId: null }),
    tiles: mapTiles(flowers),
    menuOpen,
    fold: () => setMenuOpen(false),
    unfold: () => setMenuOpen(true),
  };
}
