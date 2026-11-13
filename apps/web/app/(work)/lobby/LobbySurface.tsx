'use client';
// Wires useLobby to the lobby's view, as InteractionSurface does for /make.
import { Lobby, type LobbyMap } from '../../../components/workspace/Lobby.tsx';
import type { WalletLogos } from '../../../lib/profile-view.ts';
import { useLobby } from '../../../viewmodels/useLobby.ts';

/** The page hands over the map's cards and the chains' logos, read on the server with the page. */
export function LobbySurface({ map, logos }: { map: LobbyMap; logos: WalletLogos }) {
  return <Lobby {...useLobby()} map={map} logos={logos} />;
}
