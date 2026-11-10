// The lobby's ViewModel (specs/004-workspace, W3): who's here, their conversations, the flowers on the map,
// what they hold in the credit contract (useFunds), the profile part (useProfile: the wallet they signed in with, and NEAR Social),
// and whether the menu is open. Reads happen when the page opens, and the conversations once the server
// has said who's here. There is no timer.
import { useEffect, useState } from 'react';
import { listMapFlowers } from '../lib/agent-client.ts';
import { conversationRows } from '../lib/conversation-list.ts';
import type { ListedFlower } from '../lib/flower-view.ts';
import { mapTiles } from '../lib/lobby-view.ts';
import { useConversations } from './useConversations.ts';
import { useFunds } from './useFunds.ts';
import { useProfile } from './useProfile.ts';
import { useSession } from './useSession.ts';
import { useWorkMenu } from './useWorkMenu.ts';

export function useLobby() {
  const session = useSession(true);
  // Read once the server has said who's here. Only a person reaches the lobby (app/lobby/page.tsx).
  const conversations = useConversations(session.known ? 'arrived' : null);
  const funds = useFunds();
  const profile = useProfile();
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
  const menu = useWorkMenu(Boolean(session.account));
  return {
    session,
    profile,
    funds,
    conversations: conversationRows(conversations, { runId: null }),
    tiles: mapTiles(flowers),
    menu,
  };
}
