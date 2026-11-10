// The work menu (specs/004-workspace, B1): one menu on the left of the lobby and of the workspace, the
// same piece in both. Elco, 9 Nov: "the left collapsable sidebar overlay in both situations seems to likely
// be the same". It floats at the window's edge, over whatever the page shows, and keeps its room in the
// page's flow, open or folded, so a page that lays out beside it isn't covered. Folded, only its word
// floats, so nothing else under it is held. It holds a person's conversations, a way
// to a new one, the person's own agents (each with a way to end it), and the way to bring another. Props only: open or folded comes from the page's ViewModel. Words
// from lib/lobby-view.ts.
import type { ReactNode } from 'react';
import { type AgentRow, agentWords } from '../../lib/agents.ts';
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { doorWords } from '../../lib/door-words.ts';
import { lobbyWords } from '../../lib/lobby-view.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ConversationList } from '../chat/ConversationList.tsx';
import { Button } from '../ui/Button.tsx';
import { SideRail } from '../ui/SideRail.tsx';
import { TextLink } from '../ui/TextLink.tsx';

/** What viewmodels/useWorkMenu.ts gives the menu, the same on both pages. */
export interface WorkMenuView {
  open: boolean;
  fold: () => void;
  unfold: () => void;
  /** The person's own agents, and what each is doing (the first full test, 9 Nov). */
  agents: AgentRow[];
  copied: boolean;
  /** Copies the one prompt that connects another agent, with a fresh agent key. */
  copy: () => void;
  /** Ends one agent, by the name the server knows it by. */
  disconnect: (name: string) => void;
}

export function WorkMenu({
  conversations,
  menu,
}: {
  conversations: ConversationRow[];
  menu: WorkMenuView;
}) {
  const { open, fold: onFold, unfold: onUnfold } = menu;
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
              // design/minimally-good.md, rule 2: empty says what to do
              <p className="m-0 p-block-gap type-caption text-muted">
                {lobbyWords.noConversations}
              </p>
            )}
            {/* The person's own agents (C, the first full test): who's connected and what each is on, the
                one prompt that connects another, and how, on /connect. */}
            <section className="flex flex-col items-start gap-text-gap p-block-gap">
              <h2 className="m-0 type-label">{agentWords.heading}</h2>
              {menu.agents.length === 0 && (
                <p className="m-0 type-caption text-muted">{agentWords.none}</p>
              )}
              {menu.agents.length > 0 && (
                <ul className="m-0 flex w-full list-none flex-col gap-space-8 p-0">
                  {menu.agents.map((a) => (
                    <li key={a.key} className="flex items-start justify-between gap-text-gap">
                      <span className="flex min-w-0 flex-col">
                        <span
                          title={a.label}
                          className={`truncate type-label ${a.here ? 'text-primary' : 'text-muted'}`}
                        >
                          {a.label}
                        </span>
                        <span className="truncate type-caption text-muted">{a.status}</span>
                      </span>
                      {/* rule 4: what starts can end, from where you see it */}
                      <Button variant="quiet" onClick={() => menu.disconnect(a.name)}>
                        {agentWords.disconnect}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="pill" onClick={menu.copy}>
                {menu.copied ? agentWords.copied : agentWords.copy}
              </Button>
              <TextLink variant="quiet" href={siteLinks.connect}>
                {doorWords.ownAgent}
              </TextLink>
            </section>
          </>,
        )}
      </div>
    </>
  );
}
