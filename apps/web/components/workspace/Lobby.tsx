// The lobby (specs/004-workspace, W3), a skeleton: the work menu on the left (WorkMenu, the same as the
// workspace's) with a person's conversations and where folders will go, and beside it the profile part
// (who's here, and what they hold in the credit contract, with Withdraw) and the flowers on the map, each
// opening on the canvas.
// Props only: app/lobby/LobbySurface.tsx wires useLobby to it. It lays out existing parts and adds no
// look of its own. Words from lib/lobby-view.ts.
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { fundsWords, lobbyWords, type MapTile, type WithdrawPhase } from '../../lib/lobby-view.ts';
import { WhoIsHere } from '../chat/WhoIsHere.tsx';
import { FlowerTile } from '../FlowerTile.tsx';
import { EmptySlot } from '../ui/EmptySlot.tsx';
import { Funds } from './Funds.tsx';
import { WorkMenu, type WorkMenuView } from './WorkMenu.tsx';

/** Only a person reaches the lobby (app/lobby/page.tsx), so there's no way to connect here. */
export interface LobbySession {
  account: string | null;
  disconnect: () => void;
}

export function Lobby({
  session,
  funds,
  conversations,
  tiles,
  menu,
}: {
  session: LobbySession;
  funds: {
    held: string | null;
    phase: WithdrawPhase;
    withdrew: string | null;
    withdraw: () => void;
  };
  conversations: ConversationRow[];
  tiles: MapTile[];
  menu: WorkMenuView;
}) {
  return (
    <main aria-label={lobbyWords.page} data-surface="ground" className="flex h-dvh bg-surface">
      <WorkMenu conversations={conversations} menu={menu} />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <section aria-label={fundsWords.profile} className="flex flex-col">
          {session.account && (
            <WhoIsHere account={session.account} onDisconnect={session.disconnect} />
          )}
          <Funds
            held={funds.held}
            phase={funds.phase}
            withdrew={funds.withdrew}
            onWithdraw={funds.withdraw}
          />
        </section>
        <section className="flex flex-col gap-block-gap p-column-gap">
          <h2 className="m-0 type-heading">{lobbyWords.map}</h2>
          {tiles.length > 0 ? (
            <ul className="gallery">
              {tiles.map((t) => (
                <li key={t.key}>
                  <FlowerTile
                    title={t.title}
                    where={t.where}
                    badge={t.badge}
                    image={t.image}
                    href={t.href}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptySlot />
          )}
        </section>
      </div>
    </main>
  );
}
