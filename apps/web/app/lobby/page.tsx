// The lobby (specs/004-workspace, W3): a skeleton of where a person's work sits, so Elco can sense what's
// needed. It's a person's own: Elco, 8 Nov, "lobby is my lobby". Nobody signed in goes to the front page,
// asked here before anything is drawn, so a visitor never sees it.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { api } from '../../lib/api.ts';
import { LobbySurface } from './LobbySurface.tsx';

export const dynamic = 'force-dynamic';

export default async function LobbyPage() {
  // /api/v1/me answers only for a person with a wallet; an anonymous session or no answer is nobody
  const me = await api<{ person_id: string }>('/api/v1/me', {
    cookie: (await headers()).get('cookie'),
  });
  if (!me.ok) redirect('/');
  return <LobbySurface />;
}
