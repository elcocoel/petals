// Every word in the side panel (WorkMenu, on /make and /lobby), in one place, so the panel says one thing
// one way (Elco, 10 Nov: "two buttons with different languages kind of claiming to do the same thing").
// Drafts, PANEL's, listed for Elco; "Lobby", "Projects" and "Conversations" are Elco's own words.
import { agentWords } from './agents.ts';

/** The side panel's sections, as WorkMenu draws them and useWorkMenu keeps which one is open. */
export type SectionKey = 'conversations' | 'projects' | 'agents' | 'lobby' | 'profile' | 'settings';

export const panelWords = {
  /** What a screen reader hears for the panel. */
  panel: 'Your work',
  /** The sections, as their icons are read aloud and shown on hover, and as each one's head. */
  sections: {
    conversations: 'Conversations',
    projects: 'Projects',
    agents: 'Your agents',
    lobby: 'Lobby',
    profile: 'Profile',
    settings: 'Settings',
  },
  newConversation: 'New conversation',
  lobby: 'Lobby',
  /** The Lobby section's rows: each opens its card on /lobby. */
  balance: 'Balance',
  near: (amount: string) => `${amount} NEAR`,
  onTheMap: 'On the map',
  /** The Profile section: the public profile's state, a few characters at its row's end. */
  socialState: {
    petals: 'In Petals',
    profile: 'NEAR Social',
    none: 'None',
    reading: '…',
    unread: 'No answer',
  },
  signOut: 'Disconnect',
  /**
   * Settings (coordinator/one-source.md, step 7): how each dimension draws data, for every petal you look
   * at. The dimensions' names are the view's own (view/v1); the rest are drafts.
   */
  settings: {
    dimensions: {
      height: 'Height',
      width: 'Width',
      order: 'Order',
      colour: 'Colour',
      outline: 'Outline',
      texture: 'Texture',
      markings: 'Markings',
      segments: 'Segments',
      lines: 'Lines',
    },
    /** A piece of data as a person reads it: share, amount, kind, identity. */
    piece: (name: string) => `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
    none: 'None',
    /** At a choice's end: the one everyone sees until they choose. */
    isDefault: 'default',
    scale: 'Scale',
    scales: { sqrt: 'Square root', linear: 'Straight', log: 'Log' },
    /** A dimension no data takes yet, on hover. */
    nothingFits: 'No data takes this yet',
    reset: 'Put the default back',
    failed: (reason: string) => `Not saved: ${reason}`,
  },
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
