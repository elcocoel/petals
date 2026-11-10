// The lobby's ViewModel (specs/004-workspace, W3): who's here, what they hold in the credit contract
// (useFunds), and the profile part (useProfile: the wallet they signed in with, and NEAR Social). Read
// once, in the layout the lobby shares with the workspace (viewmodels/useWorkPanel.ts), so the side panel
// and the page show one state (LOBBY, 10 Nov). There is no timer.
import { PROFILE_EDITING } from '../lib/lobby-view.ts';
import { useWorkPanel } from './useWorkPanel.ts';

export function useLobby() {
  const person = useWorkPanel().person;
  if (!person) throw new Error('the lobby is drawn inside the layout it shares with the workspace');
  const { profile, editor, funds } = person;
  return {
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
