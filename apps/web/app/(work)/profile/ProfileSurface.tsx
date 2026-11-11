'use client';
// Wires useProfilePage to the profile page's view, as LobbySurface does for the lobby.
import { ProfilePage } from '../../../components/workspace/ProfilePage.tsx';
import { useProfilePage } from '../../../viewmodels/useProfilePage.ts';

export function ProfileSurface() {
  return <ProfilePage {...useProfilePage()} />;
}
