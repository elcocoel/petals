// The work menu (specs/004-workspace, B1): one menu on the left of the lobby and of the workspace, the
// same piece in both. Elco, 9 Nov: "the left collapsable sidebar overlay in both situations seems to likely
// be the same". It floats at the window's edge, over whatever the page shows, and keeps its room in the
// page's flow, so a page that lays out beside it isn't covered. It holds a person's conversations, a way
// to a new one, and where folders go. Props only: open or folded comes from the page's ViewModel. Words
// from lib/lobby-view.ts.
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
  return (
    <>
      {/* its room in the page, while it's open */}
      {open && <div aria-hidden className="w-tile-width shrink-0 box-content px-block-gap" />}
      <div className={`fixed top-0 bottom-0 left-0 flex ${open ? 'p-block-gap' : ''}`}>
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
      </div>
    </>
  );
}
