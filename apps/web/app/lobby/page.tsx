// The lobby (specs/004-workspace, W3): a skeleton of where a person's work sits, so Elco can sense what's
// needed. Its own page for now, so /make and the front door are left as they are until Elco has felt it.
import { LobbySurface } from './LobbySurface.tsx';

export const dynamic = 'force-dynamic';

export default function LobbyPage() {
  return <LobbySurface />;
}
