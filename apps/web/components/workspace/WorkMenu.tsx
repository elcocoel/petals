// The work menu (specs/004-workspace, B1): the side panel on the left of the lobby and of the workspace,
// the same piece in both (Elco, 9 Nov), held by the layout they share, so it stays while the page beside
// it changes. Since 10 Nov a professional tool's panel, as Orca's is, and a bar of sections (Elco: "each
// of them is a set of tools"): Conversations, Projects, Your agents and Lobby, then the person's own two,
// Profile and Settings, at the bar's foot. One section is open at a time, beside the bar, or none.
// - Conversations: every conversation, newest first, each with who and when, and the way to a project;
//   New conversation is its first row, where a new one appears.
// - Projects: each holding its conversations, named in place; New project is its last row.
// - Your agents: each with its state and a way to end it, and the one way to connect another.
// - Lobby: the lobby, the balance and the map, each opening its card on /lobby. Withdraw stays on the card.
// - Profile: who's signed in, their public profile's state (it opens the card, where it's edited), and
//   Disconnect, the one place to sign out.
// - Settings: the person's view, how each of the nine dimensions draws data for every petal they look at
//   (ViewControls; coordinator/one-source.md, step 7), saved at once and drawn everywhere without a reload.
// It keeps its room in the page's flow, open or folded, so a page that lays out beside it isn't covered.
// Props only: its state comes from viewmodels/useWorkMenu.ts and useWorkPanel.ts. Every word from
// lib/panel-words.ts.
import { DIMENSIONS } from '@petal/core/view';
import type { ReactNode } from 'react';
import type { AgentRow } from '../../lib/agents.ts';
import {
  byProject,
  type ConversationRow,
  type ListedProject,
} from '../../lib/conversation-list.ts';
import { type SocialState, shownAccount } from '../../lib/lobby-view.ts';
import { panelWords, type SectionKey } from '../../lib/panel-words.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { ConversationList, type MoveRows } from '../chat/ConversationList.tsx';
import { IconButton } from '../ui/IconButton.tsx';
import { NavItem } from '../ui/NavItem.tsx';
import { RowField } from '../ui/RowField.tsx';
import { SectionHead } from '../ui/SectionHead.tsx';
import { type RailSection, SideRail } from '../ui/SideRail.tsx';
import { ViewControls } from './ViewControls.tsx';

/** The bar, top to bottom. */
const SECTIONS: (RailSection & { key: SectionKey })[] = [
  { key: 'conversations', icon: 'conversation', label: panelWords.sections.conversations },
  { key: 'projects', icon: 'project', label: panelWords.sections.projects },
  { key: 'agents', icon: 'agent', label: panelWords.sections.agents },
  { key: 'lobby', icon: 'home', label: panelWords.sections.lobby },
  { key: 'profile', icon: 'profile', label: panelWords.sections.profile, foot: true },
  { key: 'settings', icon: 'settings', label: panelWords.sections.settings, foot: true },
];

/** What viewmodels/useWorkMenu.ts gives the menu, the same on both pages. */
export interface WorkMenuView {
  /** The section open beside the bar, or null when the panel is folded to it. */
  section: SectionKey | null;
  /** Opens a section; the open one folds the panel. */
  choose: (key: SectionKey) => void;
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

/** The person, as the Profile and Lobby sections say it: read once, in the layout, with the lobby's. */
export interface PanelYou {
  account: string | null;
  social: SocialState;
  /** The credit in NEAR, or null until it's read. */
  balance: string | null;
  /** Signs out. */
  leave: () => void;
}

/** The person's view, as the Settings section sets it: what ViewControls takes, but the dimensions. */
export type SettingsView = Omit<Parameters<typeof ViewControls>[0], 'dimensions'>;

/** A group of the panel: its head, then its rows, the last of which is its one action, if it has one. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <SectionHead size="panel" title={title} />
      {children}
    </section>
  );
}

const lobbyAt = (card: string) => `${siteLinks.lobby}#${card}`;

export function WorkMenu({
  conversations,
  menu,
  you,
  settings,
  here,
  restartNew,
}: {
  conversations: ConversationRow[];
  menu: WorkMenuView;
  you: PanelYou;
  settings: SettingsView;
  /** New, pressed where a new conversation already is: the address won't move, so this opens it again. */
  restartNew?: (() => void) | undefined;
  /** The page it's on, when that page is one of its places. */
  here?: 'lobby';
}) {
  const rows = conversations.map((row) =>
    row.key in menu.placed ? { ...row, project: menu.placed[row.key] ?? null } : row,
  );
  const { projects } = byProject(rows, menu.projects);
  const move: MoveRows = {
    projects: projects.map((p) => ({ key: p.key, name: p.name })),
    open: menu.moving,
    toggle: menu.toggleMoving,
    to: menu.moveTo,
  };
  const who = you.account ? shownAccount(you.account) : null;
  const name = you.social.kind === 'profile' ? you.social.profile.name : null;

  const sections: Record<SectionKey, ReactNode> = {
    conversations: (
      <Group title={panelWords.sections.conversations}>
        <NavItem
          href={siteLinks.make}
          icon="plus"
          label={panelWords.newConversation}
          muted
          {...(restartNew ? { onNavigate: restartNew } : {})}
        />
        {rows.length > 0 ? (
          <ConversationList rows={rows} move={move} />
        ) : (
          // design/minimally-good.md, rule 2: empty says what goes here; the way to it is the row above
          <NavItem label={panelWords.noConversations} muted />
        )}
      </Group>
    ),
    projects: (
      <Group title={panelWords.sections.projects}>
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
      <Group title={panelWords.sections.agents}>
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
    ),
    lobby: (
      <Group title={panelWords.sections.lobby}>
        <NavItem
          href={siteLinks.lobby}
          current={here === 'lobby'}
          icon="home"
          label={panelWords.lobby}
        />
        <NavItem
          href={lobbyAt('lobby-balance')}
          icon="balance"
          label={panelWords.balance}
          {...(you.balance === null ? {} : { trail: panelWords.near(you.balance) })}
        />
        <NavItem href={lobbyAt('lobby-map')} icon="map" label={panelWords.onTheMap} />
      </Group>
    ),
    profile: (
      <Group title={panelWords.sections.profile}>
        {/* the person, opening their Profile card; the trail says where the profile is kept */}
        <NavItem
          href={lobbyAt('lobby-profile')}
          icon="profile"
          label={name ?? who?.shown ?? '…'}
          {...(who ? { title: who.full } : {})}
          trail={
            panelWords.socialState[
              you.social.kind === 'profile'
                ? you.social.source === 'petals'
                  ? 'petals'
                  : 'profile'
                : you.social.kind === 'none'
                  ? 'none'
                  : you.social.kind
            ]
          }
        />
        {/* rule 4: the one place to sign out */}
        <NavItem onClick={you.leave} icon="leave" label={panelWords.signOut} muted />
      </Group>
    ),
    settings: (
      <Group title={panelWords.sections.settings}>
        <ViewControls dimensions={DIMENSIONS} {...settings} />
      </Group>
    ),
  };

  const rail = (children: ReactNode) => (
    <SideRail
      label={panelWords.panel}
      sections={SECTIONS}
      open={menu.section}
      onChoose={(key) => menu.choose(key as SectionKey)}
    >
      {children}
    </SideRail>
  );
  return (
    <>
      {/* Its room in the page's flow, which the page can lay out beside: the same panel, unseen. */}
      <div aria-hidden className="invisible flex h-dvh shrink-0">
        {rail(null)}
      </div>
      <div className="fixed top-0 bottom-0 left-0 flex">
        {rail(menu.section ? sections[menu.section] : null)}
      </div>
    </>
  );
}
