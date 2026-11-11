// The profile, one page with the lobby (Elco, 11 Nov: "we might want to unify them and use this overall"):
// /profile shows the lobby's page, so the panel's Profile row and its Lobby row open the same widgets. Like
// the lobby, a person's own: nobody signed in goes to the front page.
import LobbyPage from '../lobby/page.tsx';

export const dynamic = 'force-dynamic';

export default function ProfileRoute() {
  return <LobbyPage />;
}
