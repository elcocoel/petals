// Every word in the side panel (WorkMenu, on /make and /lobby), in one place, so the panel says one thing
// one way (Elco, 10 Nov: "two buttons with different languages kind of claiming to do the same thing").
// Drafts, PANEL's, listed for Elco; "Lobby", "Projects" and "Conversations" are Elco's own words.
import { agentWords } from './agents.ts';

export const panelWords = {
  /** What a screen reader hears for the panel. */
  panel: 'Your work',
  fold: 'Hide the panel',
  unfold: 'Show the panel',
  newConversation: 'New conversation',
  lobby: 'Lobby',
  projects: 'Projects',
  newProject: 'New project',
  /** The new project's row, waiting for its name. */
  nameProject: 'Name the project',
  /** An open project with nothing in it yet. */
  emptyProject: 'Nothing in it yet',
  /** The way to put a conversation in a project, read aloud and on hover with the conversation's title. */
  moveTo: (title: string) => `Move “${title}” to a project`,
  outOfProject: 'Out of its project',
  /** How many conversations a project holds. */
  count: (n: number) => String(n),
  conversations: 'Conversations',
  /** Rule 2: what goes here, and the way to it is the first row of the panel. */
  noConversations: 'Your conversations show here',
  agents: 'Your agents',
  /** The one way to connect one: it copies the one prompt, with a fresh agent key, in /connect's words. */
  connect: agentWords.copy,
  copied: agentWords.copied,
  disconnect: (agent: string) => `Disconnect ${agent}`,
  /** An agent's state, in a few characters at its row's end; the full line shows on hover. */
  state: { busy: 'on a job', waiting: 'waiting', away: 'away' },
  /** Read aloud for a working square. */
  working: 'Working',
  /** Who a conversation is with, shown on hover after its title. */
  withPetals: "With Petals' agent",
  withOwn: 'With your own agent',
} as const;
