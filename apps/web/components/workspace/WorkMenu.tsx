// The work menu (specs/004-workspace, B1): one menu on the left of the lobby and of the workspace, the
// same piece in both. Elco, 9 Nov: "the left collapsable sidebar overlay in both situations seems to likely
// be the same". It floats at the window's edge, over whatever the page shows, and keeps its room in the
// page's flow, open or folded, so a page that lays out beside it isn't covered. Folded, only its word
// floats, so nothing else under it is held. It holds a person's conversations, a way
// to a new one, and where folders go. Props only: open or folded comes from the page's ViewModel. Words
// from lib/lobby-view.ts.
import type { ReactNode } from 'react';
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { lobbyWords } from '../../lib/lobby-view.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ConversationList } from '../chat/ConversationList.tsx';
import { Button } from '../ui/Button.tsx';
import { EmptySlot } from '../ui/EmptySlot.tsx';
import { SideRail } from '../ui/SideRail.tsx';

export function WorkMenu({
  conversations,
  open,
  onFold,
  onUnfold,
}: {
  conversations: ConversationRow[];
  open: boolean;
  onFold: () => void;
  onUnfold: () => void;
}) {
  const rail = (open: boolean, children: ReactNode) => (
    <SideRail
      label={lobbyWords.menu}
      title={lobbyWords.conversations}
      open={open}
      foldLabel={lobbyWords.fold}
      unfoldLabel={lobbyWords.unfold}
      onFold={onFold}
      onUnfold={onUnfold}
      control={
        <Button variant="link" href={siteLinks.make}>
          {lobbyWords.newConversation}
        </Button>
      }
    >
      {children}
    </SideRail>
  );
  return (
    <>
      {/* Its room in the page's flow, which the page can lay out beside: up to the menu's floating edge while
          it's open, and the folded word's while it's folded (the same word, unseen). */}
      <div aria-hidden className="invisible flex shrink-0">
        {open ? <div className="box-content w-tile-width pl-block-gap" /> : rail(false, null)}
      </div>
      <div className={open ? 'fixed top-0 bottom-0 left-0 flex p-block-gap' : 'fixed top-0 left-0'}>
        {rail(
          open,
          <>
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
          </>,
        )}
      </div>
    </>
  );
}
