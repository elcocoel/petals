// The lobby (specs/004-workspace, W3), a skeleton: the menu on the left with a person's conversations and
// where folders will go, and beside it who's here and the flowers on the map, each opening on the canvas.
// Props only: app/lobby/LobbySurface.tsx wires useLobby to it. It lays out existing parts and adds no
// look of its own. Words from lib/lobby-view.ts.
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { lobbyWords, type MapTile } from '../../lib/lobby-view.ts';
import { ConnectWallet } from '../chat/ConnectWallet.tsx';
import { ConversationList } from '../chat/ConversationList.tsx';
import { WhoIsHere } from '../chat/WhoIsHere.tsx';
import { FlowerTile } from '../FlowerTile.tsx';
import { Button } from '../ui/Button.tsx';
import { EmptySlot } from '../ui/EmptySlot.tsx';
import { SideRail } from '../ui/SideRail.tsx';

export interface LobbySession {
  /** The server has said who's here. */
  known: boolean;
  account: string | null;
  busy: boolean;
  failed: string | null;
  connect: () => void;
  disconnect: () => void;
}

export function Lobby({
  session,
  conversations,
  tiles,
  menuOpen,
  fold,
  unfold,
}: {
  session: LobbySession;
  conversations: ConversationRow[];
  tiles: MapTile[];
  menuOpen: boolean;
  fold: () => void;
  unfold: () => void;
}) {
  return (
    <main aria-label={lobbyWords.page} data-surface="ground" className="flex h-dvh bg-surface">
      <SideRail
        label={lobbyWords.menu}
        title={lobbyWords.conversations}
        open={menuOpen}
        foldLabel={lobbyWords.fold}
        unfoldLabel={lobbyWords.unfold}
        onFold={fold}
        onUnfold={unfold}
        control={
          <Button variant="link" href="/make">
            {lobbyWords.newConversation}
          </Button>
        }
      >
        {conversations.length > 0 ? (
          <ConversationList rows={conversations} />
        ) : (
          <div className="p-block-gap">
            <EmptySlot />
          </div>
        )}
        <section className="flex flex-col gap-text-gap p-block-gap">
          <h2 className="m-0 type-label">{lobbyWords.folders}</h2>
          <EmptySlot />
        </section>
      </SideRail>
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {session.known &&
          (session.account ? (
            <WhoIsHere account={session.account} onDisconnect={session.disconnect} />
          ) : (
            <ConnectWallet
              question=""
              busy={session.busy}
              failed={session.failed}
              onConnect={session.connect}
            />
          ))}
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
