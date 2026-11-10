'use client';
// Wires useLobby to the lobby's view, as InteractionSurface does for /make.
import { Lobby, type LobbyMap } from '../../../components/workspace/Lobby.tsx';
import { useLobby } from '../../../viewmodels/useLobby.ts';

/** The page hands over the map's cards, read on the server with the page. */
export function LobbySurface({ map }: { map: LobbyMap }) {
  return <Lobby {...useLobby()} map={map} />;
}
