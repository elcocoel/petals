// The work menu (specs/004-workspace, B1): the side panel on the left of the lobby and of the workspace,
// the same piece in both (Elco, 9 Nov). Since 10 Nov it is a professional tool's panel, as Orca's is:
// docked, folding to its icons, and dense enough to show forty minutes of work. In it, in this order: a
// new conversation and the lobby; the person's projects, each holding its conversations (Elco, 10 Nov:
// projects back in the panel); the conversations in no project; the person's own agents, each with a way
// to end it, and the one way to connect another. It keeps its room in the page's flow, open or folded, so
// a page that lays out beside it isn't covered. Props only: its state comes from viewmodels/useWorkMenu.ts.
// Every word from lib/panel-words.ts.
import type { ReactNode } from 'react';
import type { AgentRow } from '../../lib/agents.ts';
import {
  byProject,
  type ConversationRow,
  type ListedProject,
} from '../../lib/conversation-list.ts';
import { panelWords } from '../../lib/panel-words.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ConversationList, type MoveRows } from '../chat/ConversationList.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { NavItem } from '../ui/NavItem.tsx';
import { RowField } from '../ui/RowField.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { type RailItem, SideRail } from '../ui/SideRail.tsx';

/** What viewmodels/useWorkMenu.ts gives the menu, the same on both pages. */
export interface WorkMenuView {
  open: boolean;
  fold: () => void;
  unfold: () => void;
  /** The person's projects, as the server keeps them (its folders). */
  projects: ListedProject[];
  /** The projects showing their conversations, by key. */
  opened: readonly string[];
  toggle: (key: string) => void;
  /** A new project's row is waiting for its name. */
  naming: boolean;
  /** Opens that row. */
  newProject: () => void;
  nameProject: (name: string) => void;
  stopNaming: () => void;
  /** The conversation whose projects are open to choose from, by key. */
  moving: string | null;
  toggleMoving: (row: string) => void;
  moveTo: (row: string, project: string | null) => void;
  /** Where each conversation moved here is now, until the list is read again. */
  placed: Readonly<Record<string, string | null>>;
  /** The person's own agents, and what each is doing (the first full test, 9 Nov). */
  agents: AgentRow[];
  copied: boolean;
  /** Copies the one prompt that connects another agent, with a fresh agent key. */
  copy: () => void;
  /** Ends one agent, by the name the server knows it by. */
  disconnect: (name: string) => void;
}

/** A group of the panel: its head, then its rows, the last of which is its one action, if it has one. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <SectionHead size="panel" title={title} />
      {children}
    </section>
  );
}

export function WorkMenu({
  conversations,
  menu,
  here,
}: {
  conversations: ConversationRow[];
  menu: WorkMenuView;
  /** The page it's on, when that page is one of its places. */
  here?: 'lobby';
}) {
  const { open, fold, unfold } = menu;
  const items: RailItem[] = [
    { key: 'new', icon: 'plus', label: panelWords.newConversation, href: siteLinks.make },
    {
      key: 'lobby',
      icon: 'home',
      label: panelWords.lobby,
      href: siteLinks.lobby,
      current: here === 'lobby',
    },
  ];
  const rows = conversations.map((row) =>
    row.key in menu.placed ? { ...row, project: menu.placed[row.key] ?? null } : row,
  );
  const { projects, loose } = byProject(rows, menu.projects);
  const move: MoveRows = {
    projects: projects.map((p) => ({ key: p.key, name: p.name })),
    open: menu.moving,
    toggle: menu.toggleMoving,
    to: menu.moveTo,
  };
  const rail = (open: boolean, children: ReactNode) => (
    <SideRail
      label={panelWords.panel}
      open={open}
      foldLabel={panelWords.fold}
      unfoldLabel={panelWords.unfold}
      onFold={fold}
      onUnfold={unfold}
      items={items}
    >
      {children}
    </SideRail>
  );
  return (
    <>
      {/* Its room in the page's flow, which the page can lay out beside: the same panel, unseen. */}
      <div aria-hidden className="invisible flex h-dvh shrink-0">
        {rail(open, null)}
      </div>
      <div className="fixed top-0 bottom-0 left-0 flex">
        {rail(
          open,
          <>
            <Group title={panelWords.projects}>
              <ul className="m-0 flex list-none flex-col p-0">
                {projects.map((p) => {
                  const shown = menu.opened.includes(p.key);
                  return (
                    <li key={p.key}>
                      <NavItem
                        onClick={() => menu.toggle(p.key)}
                        expanded={shown}
                        icon="chevron"
                        label={p.name}
                        trail={panelWords.count(p.rows.length)}
                      />
                      {shown &&
                        (p.rows.length > 0 ? (
                          <ConversationList rows={p.rows} depth={1} move={move} />
                        ) : (
                          // rule 2: open and empty says so
                          <NavItem label={panelWords.emptyProject} muted depth={1} />
                        ))}
                    </li>
                  );
                })}
                {/* a group's one action is its last row; with nothing above it, it says what goes here.
                    A new project is named in its place, before it exists. */}
                <li>
                  {menu.naming ? (
                    <RowField
                      label={panelWords.nameProject}
                      placeholder={panelWords.nameProject}
                      icon="project"
                      onDone={menu.nameProject}
                      onCancel={menu.stopNaming}
                    />
                  ) : (
                    <NavItem
                      onClick={menu.newProject}
                      icon="plus"
                      label={panelWords.newProject}
                      muted
                    />
                  )}
                </li>
              </ul>
            </Group>
            <Group title={panelWords.conversations}>
              {loose.length > 0 ? (
                <ConversationList rows={loose} move={move} />
              ) : (
                <NavItem label={panelWords.noConversations} muted />
              )}
            </Group>
            <Group title={panelWords.agents}>
              <ul className="m-0 flex list-none flex-col p-0">
                {menu.agents.map((a) => (
                  <li key={a.key}>
                    <NavItem
                      icon="agent"
                      label={a.label}
                      title={`${a.label}\n${a.status}`}
                      trail={panelWords.state[a.state]}
                      muted={!a.here}
                      // rule 4: what starts can end, from where you see it
                      action={
                        <IconButton
                          icon="close"
                          label={panelWords.disconnect(a.label)}
                          onClick={() => menu.disconnect(a.name)}
                        />
                      }
                    />
                  </li>
                ))}
                <li>
                  <NavItem
                    onClick={menu.copy}
                    icon="plus"
                    label={menu.copied ? panelWords.copied : panelWords.connect}
                    muted
                  />
                </li>
              </ul>
            </Group>
          </>,
        )}
      </div>
    </>
  );
}
