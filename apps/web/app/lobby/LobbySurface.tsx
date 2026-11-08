'use client';
// Wires useLobby to the lobby's view, as InteractionSurface does for /make.
import { Lobby } from '../../components/workspace/Lobby.tsx';
import { useLobby } from '../../viewmodels/useLobby.ts';

export function LobbySurface() {
  return <Lobby {...useLobby()} />;
}
