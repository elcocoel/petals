// The work menu (specs/004-workspace, B1): the side panel on the left of the lobby and of the workspace, the
// same piece in both, held by the layout they share, so it stays while the page beside it changes. A
// professional tool's panel and a bar: the collapse control, the person's own place (the lobby, which holds
// the account, its settings and its money), then the work, three sections, each a set of tools. Open, every
// section is in the panel, one after the other, in that order, scrolling as one; a section's icon brings it to
// the top. How petals draw is set where they're drawn, in Tools, not here.
// - Conversations: every conversation, newest first, each with who and when, and the way to a project;
//   New conversation is its first row, where a new one appears.
// - Projects: each holding its conversations, named in place; New project is its last row.
// - Your agents: each with its state and a way to end it; connecting one is at the panel's top, once.
// It lies in the page's flow, open or collapsed, so a page that lays out beside it isn't covered.
// Props only: its state comes from viewmodels/useWorkMenu.ts and useWorkPanel.ts. Every word from
// lib/panel-words.ts.

import type { DragEvent, ReactNode } from 'react';
import { type AgentRow, agentsAtTop, type CopiedAt } from '../../lib/agents.ts';
import {
  byProject,
  type ConversationRow,
  conversationRows,
  type ListedConversation,
  type ListedProject,
  type RowRef,
} from '../../lib/conversation-list.ts';
import { panelWords, type SectionKey } from '../../lib/panel-words.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ConversationList, type RowActions } from '../chat/ConversationList.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Field } from '../ui/Field.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { NavItem } from '../ui/NavItem.tsx';
import { RowField } from '../ui/RowField.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { type RailSection, type RailWidth, SideRail } from '../ui/SideRail.tsx';
import { Tip } from '../ui/Tip.tsx';

/** The bar, top to bottom, and the panel's sections in the same order. */
const SECTIONS: (Omit<RailSection, 'content'> & { key: SectionKey })[] = [
  { key: 'conversations', icon: 'conversation', label: panelWords.sections.conversations },
  { key: 'projects', icon: 'project', label: panelWords.sections.projects },
  { key: 'agents', icon: 'agent', label: panelWords.sections.agents },
];

/** What viewmodels/useWorkMenu.ts gives the menu, the same on both pages. */
export interface WorkMenuView {
  /** The panel is open beside the bar; collapsed, only the bar shows. */
  open: boolean;
  /** The one collapse control: hides the panel, or shows it again. */
  toggleOpen: () => void;
  /** The section asked for last, and how many times: the panel scrolls to it. */
  jump: { key: SectionKey; n: number } | null;
  /** A section's icon: opens the panel if it's collapsed, unfolds the section, and scrolls to it. */
  jumpTo: (key: SectionKey) => void;
  /** The sections folded to their heads. */
  folded: readonly SectionKey[];
  fold: (key: SectionKey) => void;
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
  /** Where each conversation moved here is now, until the list is read again. */
  placed: Readonly<Record<string, string | null>>;
  /** The row whose ⋯ menu is open. */
  menuFor: string | null;
  toggleMenu: (key: string) => void;
  closeMenu: () => void;
  /** The conversation in the move dialog, and the dialog's search. */
  moving: RowRef | null;
  startMove: (row: RowRef) => void;
  stopMove: () => void;
  query: string;
  setQuery: (q: string) => void;
  moveTo: (
    row: { key: string; title: string },
    project: { key: string; name: string } | null,
  ) => void;
  archive: (key: string) => void;
  unarchive: (key: string) => void;
  /** The archived conversations, and whether their row is open. */
  archived: ListedConversation[];
  archivedOpen: boolean;
  toggleArchived: () => void;
  /** The conversation in the delete dialog, and why the last try failed. */
  removing: RowRef | null;
  startRemove: (row: RowRef) => void;
  stopRemove: () => void;
  remove: () => void;
  removeFailed: string | null;
  /** Dragging a row onto a project (lines 30 to 32). */
  dragging: string | null;
  dragStart: (key: string) => void;
  dragEnd: () => void;
  dropOn: string | null;
  dragOver: (project: string | null) => void;
  /** The row just moved, and what a screen reader hears about it. */
  justMoved: string | null;
  said: string;
  /** The person's own agents, and what each is doing. */
  agents: AgentRow[];
  /** Where Connect an agent was just pressed, for its Copied; null once that's gone. */
  copied: CopiedAt | null;
  /** Copies the one prompt that connects another agent, with a fresh agent key. */
  copy: (at: CopiedAt) => void;
  /** Ends one agent, by the name the server knows it by. */
  disconnect: (name: string) => void;
  /** Ends every agent, all their workers. */
  disconnectAll: () => void;
}

/**
 * A section of the panel: its head, then its rows, the last of which is its one action, if it has one.
 * Pressing the head folds it to the head: the rows stay, out of reach, so the fold can settle
 * (head.settle); without the joy layer they're simply gone. The space under a section is its own, so
 * folded heads meet.
 */
function Group({
  title,
  folded,
  onFold,
  children,
}: {
  title: string;
  folded: boolean;
  onFold: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <SectionHead size="panel" title={title} fold={{ open: !folded, onToggle: onFold }} />
      <div
        data-fold=""
        {...(folded ? { 'data-folded': '' } : {})}
        inert={folded}
        className={folded ? 'hidden' : ''}
      >
        <div className="pb-space-16">{children}</div>
      </div>
    </section>
  );
}

export function WorkMenu({
  conversations,
  menu,
  width,
  over = false,
  here,
  restartNew,
}: {
  conversations: ConversationRow[];
  menu: WorkMenuView;
  /** The sash's hands: the panel's width is sized at its edge. */
  width: RailWidth;
  /** The window is narrow: opened, the panel lies over the page. */
  over?: boolean;
  /** New, pressed where a new conversation already is: the address won't move, so this opens it again. */
  restartNew?: (() => void) | undefined;
  /** The page it's on, when that page is one of its places. */
  here?: 'lobby' | 'profile';
}) {
  const rows = conversations.map((row) =>
    row.key in menu.placed ? { ...row, project: menu.placed[row.key] ?? null } : row,
  );
  const { projects } = byProject(rows, menu.projects);
  const ref = (row: ConversationRow): RowRef => ({
    key: row.key,
    title: row.title,
    project: row.project,
    current: row.current,
  });
  const canMove = (row: ConversationRow) => projects.length > 0 || row.project !== null;
  const actions: RowActions = {
    menuFor: menu.menuFor,
    toggleMenu: menu.toggleMenu,
    closeMenu: menu.closeMenu,
    itemsFor: (row) => [
      ...(canMove(row)
        ? [
            {
              key: 'move',
              icon: 'project' as const,
              label: panelWords.moveToProject,
              onPick: () => menu.startMove(ref(row)),
            },
          ]
        : []),
      {
        key: 'archive',
        icon: 'archive',
        label: panelWords.archive,
        onPick: () => menu.archive(row.key),
      },
      {
        key: 'remove',
        icon: 'remove',
        label: panelWords.remove,
        onPick: () => menu.startRemove(ref(row)),
      },
    ],
    drag: { start: menu.dragStart, end: menu.dragEnd },
    justMoved: menu.justMoved,
  };
  const archivedRows = conversationRows(menu.archived, { runId: null });
  const archivedActions: RowActions = {
    menuFor: menu.menuFor,
    toggleMenu: menu.toggleMenu,
    closeMenu: menu.closeMenu,
    itemsFor: (row) => [
      {
        key: 'unarchive',
        icon: 'unarchive',
        label: panelWords.unarchive,
        onPick: () => menu.unarchive(row.key),
      },
      {
        key: 'remove',
        icon: 'remove',
        label: panelWords.remove,
        onPick: () => menu.startRemove(ref(row)),
      },
    ],
    justMoved: null,
  };
  // a project takes a dragged conversation anywhere on its rows (line 30)
  const dropHands = (p: { key: string; name: string }) =>
    menu.dragging
      ? {
          onDragOver: (e: DragEvent<HTMLElement>) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (menu.dropOn !== p.key) menu.dragOver(p.key);
          },
          onDragLeave: (e: DragEvent<HTMLElement>) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) menu.dragOver(null);
          },
          onDrop: (e: DragEvent<HTMLElement>) => {
            e.preventDefault();
            const row = rows.find((r) => r.key === menu.dragging);
            menu.dragEnd();
            if (row && row.project !== p.key) menu.moveTo({ key: row.key, title: row.title }, p);
          },
        }
      : {};
  const found = menu.moving
    ? projects.filter(
        (p) =>
          p.key !== menu.moving?.project &&
          p.name.toLowerCase().includes(menu.query.trim().toLowerCase()),
      )
    : [];
  const sections: Record<SectionKey, ReactNode> = {
    conversations: (
      <Group
        title={panelWords.sections.conversations}
        folded={menu.folded.includes('conversations')}
        onFold={() => menu.fold('conversations')}
      >
        <NavItem
          href={siteLinks.make}
          icon="plus"
          label={panelWords.newConversation}
          muted
          {...(restartNew ? { onNavigate: restartNew } : {})}
        />
        {rows.length > 0 ? (
          <ConversationList rows={rows} actions={actions} />
        ) : (
          // empty says what goes here; the way to it is the row above
          <NavItem label={panelWords.noConversations} muted />
        )}
        {/* line 28: one row for the archived, only while there are some */}
        {archivedRows.length > 0 && (
          <>
            <NavItem
              onClick={menu.toggleArchived}
              expanded={menu.archivedOpen}
              icon="chevron"
              label={panelWords.archived}
              trail={panelWords.count(archivedRows.length)}
              muted
            />
            {menu.archivedOpen && (
              <ConversationList rows={archivedRows} depth={1} actions={archivedActions} />
            )}
          </>
        )}
      </Group>
    ),
    projects: (
      <Group
        title={panelWords.sections.projects}
        folded={menu.folded.includes('projects')}
        onFold={() => menu.fold('projects')}
      >
        <ul className="m-0 flex list-none flex-col p-0">
          {projects.map((p) => {
            const shown = menu.opened.includes(p.key);
            return (
              <li key={p.key} {...dropHands(p)}>
                <NavItem
                  onClick={() => menu.toggle(p.key)}
                  expanded={shown}
                  icon="chevron"
                  label={p.name}
                  trail={panelWords.count(p.rows.length)}
                  lit={menu.dropOn === p.key}
                />
                {shown &&
                  (p.rows.length > 0 ? (
                    <ConversationList rows={p.rows} depth={1} actions={actions} />
                  ) : (
                    // rule 2: open and empty says so
                    <NavItem label={panelWords.emptyProject} muted depth={1} />
                  ))}
              </li>
            );
          })}
          {/* a group's one action is its last row, where a new one appears; a new project is named in
              its place, before it exists */}
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
              <NavItem onClick={menu.newProject} icon="plus" label={panelWords.newProject} muted />
            )}
          </li>
        </ul>
      </Group>
    ),
    agents: (
      <Group
        title={panelWords.sections.agents}
        folded={menu.folded.includes('agents')}
        onFold={() => menu.fold('agents')}
      >
        <ul className="m-0 flex list-none flex-col p-0">
          {menu.agents.map((a) => (
            <li key={a.key}>
              {a.href ? (
                // an agent working in one of the person's conversations: the way there; it holds no key to disconnect
                <NavItem
                  href={a.href}
                  icon="agent"
                  label={a.label}
                  title={`${a.label}\n${a.status}`}
                  trail={panelWords.state[a.state]}
                />
              ) : (
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
                      // it ends the agent, all its workers (swarm step 1): Disconnect Codex, on Codex 2 too
                      label={panelWords.disconnect(a.agent)}
                      onClick={() => menu.disconnect(a.name)}
                    />
                  }
                />
              )}
            </li>
          ))}
          {/* connecting one is at the panel's top, once */}
          {menu.agents.length === 0 && (
            <li>
              <NavItem label={panelWords.noAgents} muted />
            </li>
          )}
        </ul>
      </Group>
    ),
  };

  // always in sight, under the wordmark
  const connected = agentsAtTop(menu.agents);
  const top = (
    <ul className="m-0 flex list-none flex-col p-0">
      <li className="relative">
        <NavItem onClick={() => menu.copy('top')} icon="plus" label={panelWords.connect} />
        {menu.copied === 'top' && <Tip label={panelWords.copied} side="right" said />}
      </li>
      {connected && (
        <li>
          <NavItem
            icon="agent"
            label={connected.label}
            title={connected.title}
            trail={panelWords.state[connected.state]}
            muted={connected.state === 'away'}
            action={
              <IconButton
                icon="close"
                label={panelWords.disconnectAll}
                onClick={menu.disconnectAll}
              />
            }
          />
        </li>
      )}
    </ul>
  );

  const moving = menu.moving;
  return (
    <>
      <SideRail
        label={panelWords.panel}
        top={top}
        sections={SECTIONS.map((section) => ({ ...section, content: sections[section.key] }))}
        open={menu.open}
        toggleLabel={menu.open ? panelWords.fold : panelWords.unfold}
        onToggle={menu.toggleOpen}
        onJump={(key) => menu.jumpTo(key as SectionKey)}
        jump={menu.jump}
        width={width}
        over={over}
        account={{
          href: siteLinks.lobby,
          label: panelWords.account,
          current: here === 'lobby' || here === 'profile',
        }}
      />
      {/* line 26: move to a project, found by name */}
      <Dialog
        open={moving !== null}
        title={moving ? panelWords.moveTitle(moving.title) : ''}
        closeLabel={panelWords.close}
        onClose={menu.stopMove}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const first = found[0];
            if (moving && first) menu.moveTo(moving, first);
          }}
        >
          <Field
            id="panel-find-project"
            label={panelWords.findProject}
            value={menu.query}
            onChange={menu.setQuery}
            hideLabel
          />
        </form>
        <ul className="m-0 flex max-h-figure-height list-none flex-col overflow-y-auto p-0">
          {found.map((p) => (
            <li key={p.key}>
              <NavItem
                onClick={() => moving && menu.moveTo(moving, p)}
                icon="project"
                label={p.name}
              />
            </li>
          ))}
          {found.length === 0 && menu.query.trim() !== '' && (
            <li>
              <NavItem label={panelWords.noProjectFound(menu.query.trim())} muted />
            </li>
          )}
          {moving?.project && (
            <li>
              <NavItem
                onClick={() => menu.moveTo(moving, null)}
                icon="close"
                label={panelWords.outOfProject}
                muted
              />
            </li>
          )}
        </ul>
      </Dialog>
      {/* line 29: delete asks first, and says what goes and what stays */}
      <Dialog
        open={menu.removing !== null}
        title={menu.removing ? panelWords.removeTitle(menu.removing.title) : ''}
        closeLabel={panelWords.close}
        onClose={menu.stopRemove}
      >
        <p className="m-0 px-space-8 type-ui text-muted">{panelWords.removeBody}</p>
        {menu.removeFailed && (
          <p className="m-0 px-space-8 type-ui text-primary">{menu.removeFailed}</p>
        )}
        <ul className="m-0 flex list-none flex-col p-0">
          <li>
            <NavItem onClick={menu.remove} icon="remove" label={panelWords.removeYes} />
          </li>
          <li>
            <NavItem onClick={menu.stopRemove} icon="close" label={panelWords.removeNo} muted />
          </li>
        </ul>
      </Dialog>
      {/* line 31: a screen reader hears where a moved conversation went */}
      <p aria-live="polite" className="sr-only">
        {menu.said}
      </p>
    </>
  );
}
