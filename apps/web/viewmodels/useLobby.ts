// The lobby's ViewModel (specs/004-workspace, W3): who's here, what they hold in the credit contract
// (useFunds), and the profile part (useProfile: the wallet they signed in with, and NEAR Social). The side
// panel, with the person's conversations, is the layout's (viewmodels/useWorkPanel.ts). Reads happen when
// the page opens. There is no timer.
import { PROFILE_EDITING } from '../lib/lobby-view.ts';
import { useFunds } from './useFunds.ts';
import { useProfile } from './useProfile.ts';
import { useProfileEditor } from './useProfileEditor.ts';
import { useSession } from './useSession.ts';

export function useLobby() {
  const session = useSession(true);
  const funds = useFunds();
  const profile = useProfile();
  const editor = useProfileEditor(profile.account, profile.social, profile.reload);
  return {
    session,
    profile: {
      account: profile.account,
      social: profile.social,
      edit: PROFILE_EDITING ? editor.open : undefined,
      saved: editor.saved,
    },
    editor: editor.view,
    funds,
  };
}
