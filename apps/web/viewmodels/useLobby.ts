// The lobby's ViewModel (specs/004-workspace, W3): who's here, their conversations, the views on the one map,
// what they hold in the credit contract (useFunds), the profile part (useProfile: the wallet they signed in with, and NEAR Social),
// and whether the menu is open. Reads happen when the page opens, and the conversations once the server
// has said who's here. There is no timer.
import { useEffect, useState } from 'react';
import { listMapViews } from '../lib/agent-client.ts';
import { conversationRows } from '../lib/conversation-list.ts';
import type { MapViewRow } from '../lib/flower-view.ts';
import { mapTiles } from '../lib/lobby-view.ts';
import { useConversations } from './useConversations.ts';
import { useFunds } from './useFunds.ts';
import { useProfile } from './useProfile.ts';
import { useProfileEditor } from './useProfileEditor.ts';
import { useSession } from './useSession.ts';
import { useWorkMenu } from './useWorkMenu.ts';

export function useLobby() {
  const session = useSession(true);
  // Read once the server has said who's here. Only a person reaches the lobby (app/lobby/page.tsx).
  const conversations = useConversations(session.known ? 'arrived' : null);
  const funds = useFunds();
  const profile = useProfile();
  const editor = useProfileEditor(profile.account, profile.social, profile.reload);
  const [views, setViews] = useState<MapViewRow[]>([]);
  useEffect(() => {
    let gone = false;
    void listMapViews().then(
      (next) => {
        if (!gone) setViews(next);
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
    profile: {
      account: profile.account,
      social: profile.social,
      edit: editor.open,
      saved: editor.saved,
    },
    editor: editor.view,
    funds,
    conversations: conversationRows(conversations, { runId: null }),
    tiles: mapTiles(views),
    menu,
  };
}
