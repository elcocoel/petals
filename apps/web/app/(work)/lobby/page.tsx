// The lobby (specs/004-workspace, W3): a skeleton of where a person's work sits. It's a person's own:
// nobody signed in goes to the front page, asked here before anything is drawn, so a visitor never sees it.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { chainLogo } from '../../../landscape/land.ts';
import { api } from '../../../lib/api.ts';
import { repoRoot } from '../../../lib/config.ts';
import { mapList, mapTile } from '../../../lib/maps.ts';
import { viewerView } from '../../../lib/viewer-view.ts';
import { LobbySurface } from './LobbySurface.tsx';

export const dynamic = 'force-dynamic';

export default async function LobbyPage() {
  // /api/v1/me answers only for a person with a wallet; an anonymous session or no answer is nobody
  const me = await api<{ person_id: string }>('/api/v1/me', {
    cookie: (await headers()).get('cookie'),
  });
  if (!me.ok) redirect('/');
  // The one map, a card per address, as the Power Map lists it (one map per address), so a
  // map reads and opens the same in both. No answer is the same as none.
  const maps = await mapList((await viewerView()).hash);
  const cards = maps.ok ? maps.value.maps : [];
  // each chain's logo, as the map's chain list draws it, for the Wallets card's buttons
  const root = repoRoot();
  const logos = {
    near: chainLogo(root, 'near'),
    evm: chainLogo(root, 'eip155:1'),
    solana: chainLogo(root, 'solana'),
  };
  return (
    <LobbySurface map={{ tiles: cards.map((m) => ({ key: m.id, ...mapTile(m) })) }} logos={logos} />
  );
}
